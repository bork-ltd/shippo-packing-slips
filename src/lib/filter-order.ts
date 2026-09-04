import { OrderShopAppEnum, OrderStatusEnum } from 'shippo/models/components';

/**
 * Order statuses that mean the order is already fulfilled, cancelled, or
 * refunded. A packing slip must never print for one of these, regardless of
 * INCLUDE_ALL_ORDER_STATUSES — otherwise a widened catch-up window would
 * reprint slips for orders that already shipped.
 */
const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatusEnum> = new Set([
  OrderStatusEnum.Shipped,
  OrderStatusEnum.PartiallyFulfilled,
  OrderStatusEnum.Cancelled,
  OrderStatusEnum.Refunded,
]);

/** Whether a packing slip should be excluded because the order is already terminal. */
export function isTerminalOrderStatus(
  status: OrderStatusEnum | undefined,
): boolean {
  return status !== undefined && TERMINAL_ORDER_STATUSES.has(status);
}

/**
 * Whether a packing slip should print for this order.
 *
 * PAID orders always print. UNKNOWN orders print only when shopApp is
 * 'Shippo' — an order created directly via the Shippo API/dashboard (e.g.
 * duplicated to reprint a fulfillment) never goes through a shop
 * integration's payment webhook, so it never transitions out of UNKNOWN on
 * its own; PAID-only filtering would silently drop it forever. An UNKNOWN
 * order synced from a real shop integration (Shopify, etc.) still means
 * "not actually paid yet" and must not print.
 */
export function isPrintableOrder(
  status: OrderStatusEnum | undefined,
  shopApp: OrderShopAppEnum | undefined,
): boolean {
  if (isTerminalOrderStatus(status)) {
    return false;
  }
  if (status === OrderStatusEnum.Paid) {
    return true;
  }
  return (
    status === OrderStatusEnum.Unknown && shopApp === OrderShopAppEnum.Shippo
  );
}
