import { describe, expect, it } from 'vitest';

import type { LineItemGroup } from '../lib/group-line-items';
import { calculateGroupHeight, TABLE_ROW_PADDING } from './pdf-generator';

function makeGroup(
  title: string,
  variants: { variantTitle?: string; quantity: number }[],
): LineItemGroup {
  const totalQuantity = variants.reduce((sum, v) => sum + v.quantity, 0);
  return { title, totalQuantity, variants };
}

describe('calculateGroupHeight', () => {
  it('returns top padding + titleHeight + bottom padding for a single variant with no variantTitle', () => {
    const group = makeGroup('Widget', [{ quantity: 3 }]);
    const height = calculateGroupHeight(group, 14, 14);
    expect(height).toBe(TABLE_ROW_PADDING + 14 + TABLE_ROW_PADDING);
  });

  it('adds one line per variant when a lone variant has a variantTitle', () => {
    const group = makeGroup('Widget', [{ variantTitle: 'Red', quantity: 1 }]);
    const height = calculateGroupHeight(group, 14, 14);
    expect(height).toBe(TABLE_ROW_PADDING + 14 + 14 + TABLE_ROW_PADDING);
  });

  it('adds one line per variant when there are multiple variants, even without a variantTitle', () => {
    const group = makeGroup('Widget', [{ quantity: 1 }, { quantity: 2 }]);
    const height = calculateGroupHeight(group, 14, 14);
    expect(height).toBe(TABLE_ROW_PADDING + 14 + 14 * 2 + TABLE_ROW_PADDING);
  });

  it('with a visible variant row is exactly one singleLineHeight taller per variant', () => {
    const lineHeight = 12;
    const withVariant = calculateGroupHeight(
      makeGroup('Widget', [{ variantTitle: 'Blue', quantity: 1 }]),
      lineHeight,
      lineHeight,
    );
    const withoutVariant = calculateGroupHeight(
      makeGroup('Widget', [{ quantity: 1 }]),
      lineHeight,
      lineHeight,
    );
    expect(withVariant - withoutVariant).toBe(lineHeight);
  });

  it('scales with titleHeight independently of variant singleLineHeight, for a wrapped multi-line title', () => {
    const group = makeGroup('Widget', [{ variantTitle: 'Red', quantity: 1 }]);
    // A title wrapped onto two lines (titleHeight = 2x a single line) adds
    // only to the title's contribution, not the variant row's.
    const oneLineTitle = calculateGroupHeight(group, 14, 10);
    const twoLineTitle = calculateGroupHeight(group, 28, 10);
    expect(twoLineTitle - oneLineTitle).toBe(14);
  });

  it('scales correctly with different singleLineHeight values', () => {
    const group = makeGroup('Widget', [{ quantity: 1 }]);
    expect(calculateGroupHeight(group, 10, 10)).toBe(
      TABLE_ROW_PADDING + 10 + TABLE_ROW_PADDING,
    );
    expect(calculateGroupHeight(group, 20, 20)).toBe(
      TABLE_ROW_PADDING + 20 + TABLE_ROW_PADDING,
    );
  });

  it('treats an empty string variantTitle as falsy (no variant row added)', () => {
    const withEmpty = calculateGroupHeight(
      makeGroup('Widget', [{ variantTitle: '', quantity: 1 }]),
      14,
      14,
    );
    const withUndefined = calculateGroupHeight(
      makeGroup('Widget', [{ quantity: 1 }]),
      14,
      14,
    );
    expect(withEmpty).toBe(withUndefined);
  });
});
