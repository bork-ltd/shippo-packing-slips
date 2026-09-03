import { describe, expect, it } from 'vitest';

import { buildSentinelKey } from './sentinel-key';

describe('buildSentinelKey', () => {
  it('formats the date as YYYY-MM-DD in local time', () => {
    expect(
      buildSentinelKey('packing-slip', new Date(2026, 0, 5), 'ORDER123'),
    ).toBe('packing-slip-2026-01-05-ORDER123');
  });

  it('pads single-digit month and day', () => {
    expect(buildSentinelKey('label', new Date(2026, 8, 3), 'TX1')).toBe(
      'label-2026-09-03-TX1',
    );
  });

  it('falls back to unknown-date when date is undefined', () => {
    expect(buildSentinelKey('label', undefined, 'TX1')).toBe(
      'label-unknown-date-TX1',
    );
  });

  it('replaces disallowed characters in the id with underscore', () => {
    expect(
      buildSentinelKey('packing-slip', new Date(2026, 0, 5), 'ORD#123/A'),
    ).toBe('packing-slip-2026-01-05-ORD_123_A');
  });

  it('preserves hyphens and underscores in the id', () => {
    expect(
      buildSentinelKey('packing-slip', new Date(2026, 0, 5), 'ORD-123_A'),
    ).toBe('packing-slip-2026-01-05-ORD-123_A');
  });
});
