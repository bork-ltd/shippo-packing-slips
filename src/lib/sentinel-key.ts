export type SentinelKind = 'packing-slip' | 'label';

/**
 * Build the dedup key shared by the /tmp PDF filename (packing slips and
 * labels) and its persistent print marker: `<kind>-<YYYY-MM-DD>-<id>`.
 * @param kind - 'packing-slip' or 'label'
 * @param date - The order's placedAt / transaction's objectCreated; undefined
 *   falls back to 'unknown-date' rather than throwing. Formatted in UTC,
 *   matching the rest of the system (calculateTimeWindow/calculateFetchWindow,
 *   pickupSentinelPath) — the Pi's system timezone is UTC (see
 *   docs/ARCHITECTURE.md), so this only matters off-Pi.
 * @param rawId - Order number or transaction object ID; non-alphanumeric
 *   characters (other than '-' and '_') are replaced with '_'.
 */
export function buildSentinelKey(
  kind: SentinelKind,
  date: Date | undefined,
  rawId: string,
): string {
  const datePrefix = date ? formatDatePrefix(date) : 'unknown-date';
  const sanitizedId = rawId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${kind}-${datePrefix}-${sanitizedId}`;
}

function formatDatePrefix(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
