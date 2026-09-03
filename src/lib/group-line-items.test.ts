import type { Order } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { groupLineItems } from './group-line-items';

type LineItem = NonNullable<Order['lineItems']>[number];

function makeItem(
  title?: string,
  variantTitle?: string,
  quantity?: number,
): LineItem {
  return { title, variantTitle, quantity } as unknown as LineItem;
}

describe('groupLineItems', () => {
  it('returns an empty array for no line items', () => {
    expect(groupLineItems([])).toEqual([]);
  });

  it('keeps a single item with no variant as its own group', () => {
    const groups = groupLineItems([makeItem('Widget', undefined, 3)]);
    expect(groups).toEqual([
      {
        title: 'Widget',
        totalQuantity: 3,
        variants: [{ variantTitle: undefined, quantity: 3 }],
      },
    ]);
  });

  it('groups items sharing a title, summing quantity and collecting each variant', () => {
    const groups = groupLineItems([
      makeItem('Container', 'Small / Blue', 2),
      makeItem('Container', 'Large / Red', 1),
    ]);
    expect(groups).toEqual([
      {
        title: 'Container',
        totalQuantity: 3,
        variants: [
          { variantTitle: 'Small / Blue', quantity: 2 },
          { variantTitle: 'Large / Red', quantity: 1 },
        ],
      },
    ]);
  });

  it("orders groups by each title's first appearance, even when titles interleave", () => {
    const groups = groupLineItems([
      makeItem('Container', 'Blue', 1),
      makeItem('Lid', 'Blue', 1),
      makeItem('Container', 'Red', 1),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Container', 'Lid']);
    expect(groups[0].variants).toEqual([
      { variantTitle: 'Blue', quantity: 1 },
      { variantTitle: 'Red', quantity: 1 },
    ]);
  });

  it('falls back to "Unknown Item" when title is missing', () => {
    const groups = groupLineItems([makeItem(undefined, undefined, 1)]);
    expect(groups[0].title).toBe('Unknown Item');
  });

  it('treats a missing quantity as 0', () => {
    const groups = groupLineItems([makeItem('Widget')]);
    expect(groups[0].totalQuantity).toBe(0);
    expect(groups[0].variants[0].quantity).toBe(0);
  });

  it('truncates titles at the second pipe before grouping, so items differing only after it still merge', () => {
    const groups = groupLineItems([
      makeItem('Battery Tray | Small Deep Bins | AA AAA 9V C D', 'Red AA', 1),
      makeItem(
        'Battery Tray | Small Deep Bins | AA AAA 9V C D CR2 CR123',
        'Red AAA',
        1,
      ),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Battery Tray | Small Deep Bins');
  });
});
