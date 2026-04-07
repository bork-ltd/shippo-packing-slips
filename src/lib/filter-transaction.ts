import type { Transaction } from 'shippo/models/components';

export type FilterResult = 'match' | 'skip' | 'stop';

export function filterTransaction(
  tx: Transaction,
  startDate: Date,
  endDate: Date,
): FilterResult {
  const created = tx.objectCreated;
  if (created && created < startDate) return 'stop';
  if (created && created >= startDate && created <= endDate && tx.labelUrl) {
    return 'match';
  }
  return 'skip';
}
