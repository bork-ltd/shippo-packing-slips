import { describe, expect, it } from 'vitest';

import { isDuplicatePickupError, pickupSentinelPath } from './duplicate-pickup';

describe('isDuplicatePickupError', () => {
  it('matches the USPS duplicate-pickup message', () => {
    expect(
      isDuplicatePickupError(
        'Failed to schedule pickup: API error occurred: Status 400 Content-Type "application/json; charset=utf-8" Body: {"messages":["You have already requested a USPS pickup for today. Please leave any additional USPS packages at your designated pickup location and the carrier will collect them along with your already-scheduled package."]}',
      ),
    ).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(
      isDuplicatePickupError('ALREADY REQUESTED A USPS PICKUP for today'),
    ).toBe(true);
  });

  it('matches the transaction-level duplicate-pickup message', () => {
    expect(
      isDuplicatePickupError(
        'Failed to schedule pickup: API error occurred: Status 400 Content-Type "application/json; charset=utf-8". Body: {"transactions":["Transaction 5b33938850ff4efebc43d834a2e6f249 already has a pickup scheduled."]}',
      ),
    ).toBe(true);
  });

  it('does not match other pickup errors', () => {
    expect(
      isDuplicatePickupError(
        'The carrier is taking too long to process the request. Please try again.',
      ),
    ).toBe(false);
  });

  it('does not match an empty message', () => {
    expect(isDuplicatePickupError('')).toBe(false);
  });
});

describe('pickupSentinelPath', () => {
  it('builds the path from the UTC date under the given state dir', () => {
    expect(
      pickupSentinelPath(
        new Date('2026-08-30T23:45:09.152Z'),
        '/home/bje/.shippo-state',
      ),
    ).toBe('/home/bje/.shippo-state/pickup-requested-2026-08-30');
  });

  it('uses the UTC date, not local time', () => {
    // 23:45 UTC on Aug 30 is Aug 31 in UTC+2, but the path must stay UTC.
    expect(
      pickupSentinelPath(new Date('2026-08-31T00:10:00.000Z'), '/tmp/state'),
    ).toBe('/tmp/state/pickup-requested-2026-08-31');
  });
});
