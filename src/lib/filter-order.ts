import { OrderStatusEnum } from 'shippo/models/components';

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
