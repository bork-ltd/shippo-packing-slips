import type { Order } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { calculateItemHeight, TABLE_ROW_PADDING } from './pdf-generator';

type LineItem = NonNullable<Order['lineItems']>[number];

function makeItem(title: string, variantTitle?: string): LineItem {
  return { title, variantTitle } as unknown as LineItem;
}

describe('calculateItemHeight', () => {
  it('returns top padding + lineHeight + bottom padding when no variantTitle', () => {
    const height = calculateItemHeight(makeItem('Widget'), 14);
    expect(height).toBe(TABLE_ROW_PADDING + 14 + TABLE_ROW_PADDING);
  });

  it('returns top padding + 2x lineHeight + bottom padding when variantTitle is present', () => {
    const height = calculateItemHeight(makeItem('Widget', 'Red'), 14);
    expect(height).toBe(TABLE_ROW_PADDING + 14 + 14 + TABLE_ROW_PADDING);
  });

  it('with variantTitle is exactly one lineHeight taller than without', () => {
    const lineHeight = 12;
    const withVariant = calculateItemHeight(
      makeItem('Widget', 'Blue'),
      lineHeight,
    );
    const withoutVariant = calculateItemHeight(makeItem('Widget'), lineHeight);
    expect(withVariant - withoutVariant).toBe(lineHeight);
  });

  it('scales correctly with different singleLineHeight values', () => {
    expect(calculateItemHeight(makeItem('Widget'), 10)).toBe(
      TABLE_ROW_PADDING + 10 + TABLE_ROW_PADDING,
    );
    expect(calculateItemHeight(makeItem('Widget'), 20)).toBe(
      TABLE_ROW_PADDING + 20 + TABLE_ROW_PADDING,
    );
  });

  it('treats empty string variantTitle as falsy (no variant height added)', () => {
    const withEmpty = calculateItemHeight(makeItem('Widget', ''), 14);
    const withUndefined = calculateItemHeight(makeItem('Widget'), 14);
    expect(withEmpty).toBe(withUndefined);
  });
});
