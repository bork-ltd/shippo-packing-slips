import type { Transaction } from 'shippo/models/components';
import { TrackingStatusEnum } from 'shippo/models/components';

export type FilterResult = 'match' | 'skip' | 'stop';

/**
 * Tracking statuses meaning the carrier has already scanned the package.
 * A label must never print once its shipment reaches one of these —
 * otherwise a widened catch-up window would print duplicate shipping labels.
 * Absent trackingStatus is treated as printable (pre-carrier-scan default).
 */
const CARRIER_SCANNED_STATUSES: ReadonlySet<TrackingStatusEnum> = new Set([
  TrackingStatusEnum.Transit,
  TrackingStatusEnum.Delivered,
  TrackingStatusEnum.Returned,
  TrackingStatusEnum.Failure,
]);

export function filterTransaction(
  tx: Transaction,
  startDate: Date,
  endDate: Date,
): FilterResult {
  const created = tx.objectCreated;
  if (created && created < startDate) return 'stop';
  if (
    created &&
    created >= startDate &&
    created <= endDate &&
    tx.labelUrl &&
    !(tx.trackingStatus && CARRIER_SCANNED_STATUSES.has(tx.trackingStatus))
  ) {
    return 'match';
  }
  return 'skip';
}
