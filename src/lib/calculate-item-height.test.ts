import type { Order } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { calculateItemHeight } from './pdf-generator';

type LineItem = NonNullable<Order['lineItems']>[number];

function makeItem(title: string, variantTitle?: string): LineItem {
  return { title, variantTitle } as unknown as LineItem;
}

// TABLE_ROW_PADDING = 6 (top + bottom padding per row, verified in pdf-generator.ts)
const PADDING = 6;

describe('calculateItemHeight', () => {
  it('returns top padding + lineHeight + bottom padding when no variantTitle', () => {
    const height = calculateItemHeight(makeItem('Widget'), 14);
    expect(height).toBe(PADDING + 14 + PADDING);
  });

  it('returns top padding + 2x lineHeight + bottom padding when variantTitle is present', () => {
    const height = calculateItemHeight(makeItem('Widget', 'Red'), 14);
    expect(height).toBe(PADDING + 14 + 14 + PADDING);
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
      PADDING + 10 + PADDING,
    );
    expect(calculateItemHeight(makeItem('Widget'), 20)).toBe(
      PADDING + 20 + PADDING,
    );
  });

  it('treats empty string variantTitle as falsy (no variant height added)', () => {
    const withEmpty = calculateItemHeight(makeItem('Widget', ''), 14);
    const withUndefined = calculateItemHeight(makeItem('Widget'), 14);
    expect(withEmpty).toBe(withUndefined);
  });
});
