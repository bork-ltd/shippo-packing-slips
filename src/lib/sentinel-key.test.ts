import { describe, expect, it } from 'vitest';

import { buildSentinelKey } from './sentinel-key';

describe('buildSentinelKey', () => {
  it('formats the date as YYYY-MM-DD in UTC', () => {
    expect(
      buildSentinelKey(
        'packing-slip',
        new Date('2026-01-05T12:00:00.000Z'),
        'ORDER123',
      ),
    ).toBe('packing-slip-2026-01-05-ORDER123');
  });

  it('pads single-digit month and day', () => {
    expect(
      buildSentinelKey('label', new Date('2026-09-03T12:00:00.000Z'), 'TX1'),
    ).toBe('label-2026-09-03-TX1');
  });

  it('uses the UTC date, not local time', () => {
    // 23:45 UTC on Dec 31 is Jan 1 in UTC+2, but the key must stay UTC.
    expect(
      buildSentinelKey('label', new Date('2025-12-31T23:45:00.000Z'), 'TX1'),
    ).toBe('label-2025-12-31-TX1');
  });

  it('falls back to unknown-date when date is undefined', () => {
    expect(buildSentinelKey('label', undefined, 'TX1')).toBe(
      'label-unknown-date-TX1',
    );
  });

  it('replaces disallowed characters in the id with underscore', () => {
    expect(
      buildSentinelKey(
        'packing-slip',
        new Date('2026-01-05T12:00:00.000Z'),
        'ORD#123/A',
      ),
    ).toBe('packing-slip-2026-01-05-ORD_123_A');
  });

  it('preserves hyphens and underscores in the id', () => {
    expect(
      buildSentinelKey(
        'packing-slip',
        new Date('2026-01-05T12:00:00.000Z'),
        'ORD-123_A',
      ),
    ).toBe('packing-slip-2026-01-05-ORD-123_A');
  });
});
