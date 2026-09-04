import { OrderShopAppEnum, OrderStatusEnum } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { isPrintableOrder, isTerminalOrderStatus } from './filter-order';

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

describe('isPrintableOrder', () => {
  it('returns true for PAID regardless of shopApp', () => {
    expect(
      isPrintableOrder(OrderStatusEnum.Paid, OrderShopAppEnum.Shopify),
    ).toBe(true);
    expect(isPrintableOrder(OrderStatusEnum.Paid, undefined)).toBe(true);
  });

  it('returns true for UNKNOWN when shopApp is Shippo', () => {
    expect(
      isPrintableOrder(OrderStatusEnum.Unknown, OrderShopAppEnum.Shippo),
    ).toBe(true);
  });

  it('returns false for UNKNOWN when shopApp is a real shop integration', () => {
    expect(
      isPrintableOrder(OrderStatusEnum.Unknown, OrderShopAppEnum.Shopify),
    ).toBe(false);
  });

  it('returns false for UNKNOWN when shopApp is undefined', () => {
    expect(isPrintableOrder(OrderStatusEnum.Unknown, undefined)).toBe(false);
  });

  it('returns false for AWAITPAY even when shopApp is Shippo', () => {
    expect(
      isPrintableOrder(OrderStatusEnum.Awaitpay, OrderShopAppEnum.Shippo),
    ).toBe(false);
  });

  it.each([
    OrderStatusEnum.Shipped,
    OrderStatusEnum.PartiallyFulfilled,
    OrderStatusEnum.Cancelled,
    OrderStatusEnum.Refunded,
  ])(
    'returns false for terminal status %s even when shopApp is Shippo',
    (status) => {
      expect(isPrintableOrder(status, OrderShopAppEnum.Shippo)).toBe(false);
    },
  );

  it('returns false when status is undefined', () => {
    expect(isPrintableOrder(undefined, OrderShopAppEnum.Shippo)).toBe(false);
  });
});
