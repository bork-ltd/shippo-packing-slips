export type TimeWindow = { startDate: Date; endDate: Date };

export function calculateTimeWindow(
  now: Date,
  timeWindowMinutes: number,
): TimeWindow {
  if (
    Number.isNaN(timeWindowMinutes) ||
    timeWindowMinutes <= 0 ||
    !Number.isInteger(timeWindowMinutes)
  ) {
    throw new RangeError(
      `timeWindowMinutes must be a positive integer, got: ${timeWindowMinutes}`,
    );
  }
  if (1440 % timeWindowMinutes !== 0) {
    throw new RangeError(
      `timeWindowMinutes must evenly divide 1440 (minutes in a day), got: ${timeWindowMinutes}`,
    );
  }
  const msPerWindow = timeWindowMinutes * 60 * 1000;
  const endDate = new Date(
    Math.floor(now.getTime() / msPerWindow) * msPerWindow,
  );
  const startDate = new Date(endDate.getTime() - 2 * msPerWindow);
  return { startDate, endDate };
}

/**
 * Widen the normal 2x lookback window to cover a gap since the last
 * successful fetch, capped at maxLookbackMinutes so a very long outage
 * cannot trigger an unbounded catch-up fetch.
 *
 * A missing or invalid lastFetch (no watermark file, or unparseable
 * content) is treated as maximally stale — the same as a watermark that
 * predates the cap — not as "first run, assume healthy." This makes the
 * watermark file itself the recovery lever: deleting it (or the whole
 * state directory) deliberately forces a full reprint of every
 * non-terminal order/label within maxLookbackMinutes, exactly like
 * recovering from an outage that long.
 *
 * endDate always stays the deterministic boundary from calculateTimeWindow.
 * startDate only ever moves earlier than the 2x baseline (or stays put) —
 * a lastFetch that is in the future or newer than the baseline startDate
 * leaves normal-operation behavior unchanged.
 */
export function calculateFetchWindow(
  now: Date,
  timeWindowMinutes: number,
  lastFetch: Date | null,
  maxLookbackMinutes: number,
): TimeWindow {
  if (
    Number.isNaN(maxLookbackMinutes) ||
    maxLookbackMinutes <= 0 ||
    !Number.isInteger(maxLookbackMinutes)
  ) {
    throw new RangeError(
      `maxLookbackMinutes must be a positive integer, got: ${maxLookbackMinutes}`,
    );
  }

  const baseline = calculateTimeWindow(now, timeWindowMinutes);
  const effectiveLastFetch =
    lastFetch && !Number.isNaN(lastFetch.getTime())
      ? lastFetch.getTime()
      : -Infinity;

  if (effectiveLastFetch >= baseline.startDate.getTime()) {
    return baseline;
  }

  // Clamped to the cap, but never narrower than the baseline: a
  // maxLookbackMinutes shorter than 2x timeWindowMinutes must not shrink the
  // window below normal-operation size.
  const cap = baseline.endDate.getTime() - maxLookbackMinutes * 60 * 1000;
  const startDate = new Date(
    Math.min(baseline.startDate.getTime(), Math.max(effectiveLastFetch, cap)),
  );
  return { startDate, endDate: baseline.endDate };
}
