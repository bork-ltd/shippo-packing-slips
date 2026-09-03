import { OrderStatusEnum } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { isTerminalOrderStatus } from './filter-order';

describe('isTerminalOrderStatus', () => {
  it.each([
    OrderStatusEnum.Shipped,
    OrderStatusEnum.PartiallyFulfilled,
    OrderStatusEnum.Cancelled,
    OrderStatusEnum.Refunded,
  ])('returns true for %s', (status) => {
    expect(isTerminalOrderStatus(status)).toBe(true);
  });

  it.each([
    OrderStatusEnum.Unknown,
    OrderStatusEnum.Awaitpay,
    OrderStatusEnum.Paid,
  ])('returns false for %s', (status) => {
    expect(isTerminalOrderStatus(status)).toBe(false);
  });

  it('returns false when status is undefined', () => {
    expect(isTerminalOrderStatus(undefined)).toBe(false);
  });
});
