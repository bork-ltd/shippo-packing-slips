import type { Order } from 'shippo/models/components';

import { truncateAtSecondPipe } from './truncate-title';

type LineItem = NonNullable<Order['lineItems']>[number];

/** One variant within a grouped line item: its variant label and quantity. */
export type GroupedVariant = {
  variantTitle?: string;
  quantity: number;
};

/** All variants of a product (matched by title), with a summed total quantity. */
export type LineItemGroup = {
  title: string;
  totalQuantity: number;
  variants: GroupedVariant[];
};

/**
 * Group order line items by title (product type) so packing slips can show
 * variants (e.g. color/size) nested under one product heading instead of
 * listing every variant as its own top-level row.
 * @param lineItems - Order line items, in their original order
 * @returns One group per distinct title, in order of each title's first
 *   appearance, with variants in their original relative order
 */
export function groupLineItems(lineItems: LineItem[]): LineItemGroup[] {
  const groups = new Map<string, LineItemGroup>();

  for (const item of lineItems) {
    const title = truncateAtSecondPipe(item.title || 'Unknown Item');
    const quantity = item.quantity || 0;

    let group = groups.get(title);
    if (!group) {
      group = { title, totalQuantity: 0, variants: [] };
      groups.set(title, group);
    }
    group.totalQuantity += quantity;
    group.variants.push({ variantTitle: item.variantTitle, quantity });
  }

  return [...groups.values()];
}
