export type TimeWindow = { startDate: Date; endDate: Date };

export function calculateTimeWindow(
  now: Date,
  timeWindowMinutes: number,
): TimeWindow {
  if (Number.isNaN(timeWindowMinutes) || timeWindowMinutes <= 0) {
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
