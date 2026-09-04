import { describe, expect, it } from 'vitest';

import { calculateFetchWindow, calculateTimeWindow } from './time-window';

describe('calculateTimeWindow', () => {
  describe('valid input', () => {
    it('snaps endDate to the nearest 60-min boundary below now', () => {
      const now = new Date('2026-01-01T10:45:00.000Z');
      const { endDate } = calculateTimeWindow(now, 60);
      expect(endDate.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    });

    it('sets startDate to 2x window before endDate', () => {
      const now = new Date('2026-01-01T10:45:00.000Z');
      const { startDate, endDate } = calculateTimeWindow(now, 60);
      expect(endDate.getTime() - startDate.getTime()).toBe(2 * 60 * 60 * 1000);
      expect(startDate.toISOString()).toBe('2026-01-01T08:00:00.000Z');
    });

    it('works for a 30-minute window', () => {
      const now = new Date('2026-01-01T10:45:00.000Z');
      const { endDate, startDate } = calculateTimeWindow(now, 30);
      expect(endDate.toISOString()).toBe('2026-01-01T10:30:00.000Z');
      expect(endDate.getTime() - startDate.getTime()).toBe(2 * 30 * 60 * 1000);
    });

    it('works for a 15-minute window', () => {
      const now = new Date('2026-01-01T10:47:00.000Z');
      const { endDate } = calculateTimeWindow(now, 15);
      expect(endDate.toISOString()).toBe('2026-01-01T10:45:00.000Z');
    });

    it('works for a 1440-minute (daily) window', () => {
      const now = new Date('2026-01-01T10:45:00.000Z');
      const { endDate } = calculateTimeWindow(now, 1440);
      expect(endDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('uses the boundary itself as endDate when now is exactly on a boundary', () => {
      const now = new Date('2026-01-01T10:00:00.000Z');
      const { endDate } = calculateTimeWindow(now, 60);
      expect(endDate.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    });

    it('uses the previous boundary as endDate when now is 1ms before a boundary', () => {
      const now = new Date('2026-01-01T09:59:59.999Z');
      const { endDate } = calculateTimeWindow(now, 60);
      expect(endDate.toISOString()).toBe('2026-01-01T09:00:00.000Z');
    });
  });

  describe('invalid input', () => {
    it('throws RangeError for NaN', () => {
      expect(() => calculateTimeWindow(new Date(), NaN)).toThrow(RangeError);
    });

    it('throws RangeError for a float (1.5) even though 1440 % 1.5 === 0', () => {
      expect(() => calculateTimeWindow(new Date(), 1.5)).toThrow(RangeError);
    });

    it('throws RangeError for 0', () => {
      expect(() => calculateTimeWindow(new Date(), 0)).toThrow(RangeError);
    });

    it('throws RangeError for a negative number', () => {
      expect(() => calculateTimeWindow(new Date(), -60)).toThrow(RangeError);
    });

    it('throws RangeError for 7 (does not evenly divide 1440)', () => {
      expect(() => calculateTimeWindow(new Date(), 7)).toThrow(RangeError);
    });

    it('throws RangeError for 1441', () => {
      expect(() => calculateTimeWindow(new Date(), 1441)).toThrow(RangeError);
    });

    it('includes the bad value in the error message', () => {
      expect(() => calculateTimeWindow(new Date(), 7)).toThrow('7');
    });
  });

  describe('lookbackMinutes', () => {
    it('defaults to 2x timeWindowMinutes when omitted', () => {
      const now = new Date('2026-01-01T10:45:00.000Z');
      const { startDate, endDate } = calculateTimeWindow(now, 60);
      expect(endDate.getTime() - startDate.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('uses an explicit lookbackMinutes instead of the 2x default', () => {
      const now = new Date('2026-01-10T10:45:00.000Z');
      const { startDate, endDate } = calculateTimeWindow(now, 60, 1440);
      expect(endDate.toISOString()).toBe('2026-01-10T10:00:00.000Z');
      expect(startDate.toISOString()).toBe('2026-01-09T10:00:00.000Z');
    });

    it('throws RangeError for a non-positive lookbackMinutes', () => {
      expect(() => calculateTimeWindow(new Date(), 60, 0)).toThrow(RangeError);
    });

    it('throws RangeError for a non-integer lookbackMinutes', () => {
      expect(() => calculateTimeWindow(new Date(), 60, 1.5)).toThrow(
        RangeError,
      );
    });

    it('throws RangeError for NaN lookbackMinutes', () => {
      expect(() => calculateTimeWindow(new Date(), 60, NaN)).toThrow(
        RangeError,
      );
    });
  });
});

describe('calculateFetchWindow', () => {
  const now = new Date('2026-01-10T10:45:00.000Z');
  // baseline for (now, 60): endDate 10:00:00Z, startDate 08:00:00Z

  it('treats a null lastFetch as maximally stale and widens to the cap', () => {
    // No watermark file — same as one deliberately removed to force a
    // full catch-up: widens all the way to the maxLookbackMinutes cap
    // rather than trusting a small baseline window.
    const { startDate, endDate } = calculateFetchWindow(now, 60, null, 10080);
    expect(startDate.toISOString()).toBe('2026-01-03T10:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-01-10T10:00:00.000Z');
  });

  it('a null lastFetch still never narrows below the 2x baseline', () => {
    // maxLookbackMinutes (60) < 2x timeWindowMinutes (120): the cap alone
    // would be narrower than baseline, which must not happen even when
    // lastFetch is null.
    const { startDate } = calculateFetchWindow(now, 60, null, 60);
    expect(startDate.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('returns the baseline window when lastFetch is inside it', () => {
    const lastFetch = new Date('2026-01-10T09:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 10080);
    expect(startDate.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('returns the baseline window when lastFetch equals baseline startDate', () => {
    const lastFetch = new Date('2026-01-10T08:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 10080);
    expect(startDate.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('returns the baseline window when lastFetch is in the future', () => {
    const lastFetch = new Date('2026-01-10T12:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 10080);
    expect(startDate.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('widens startDate to lastFetch when older than the baseline', () => {
    const lastFetch = new Date('2026-01-10T05:00:00.000Z');
    const { startDate, endDate } = calculateFetchWindow(
      now,
      60,
      lastFetch,
      10080,
    );
    expect(startDate.toISOString()).toBe('2026-01-10T05:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-01-10T10:00:00.000Z');
  });

  it('clamps startDate to the maxLookbackMinutes cap', () => {
    const lastFetch = new Date('2025-12-01T00:00:00.000Z'); // ~40 days back
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 10080); // 7-day cap
    expect(startDate.toISOString()).toBe('2026-01-03T10:00:00.000Z');
  });

  it('clamps startDate exactly to the cap when lastFetch equals it', () => {
    // cap = endDate (10:00Z) - 180 minutes = 07:00Z, below the 08:00Z
    // baseline, so the cap (not the baseline) governs here.
    const lastFetch = new Date('2026-01-10T07:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 180);
    expect(startDate.toISOString()).toBe('2026-01-10T07:00:00.000Z');
  });

  it('never narrows startDate below the 2x baseline when maxLookbackMinutes < 2x timeWindowMinutes', () => {
    // baseline startDate is 08:00Z; a 1-hour cap alone would compute 09:00Z,
    // which is *after* the baseline start — must not shrink the window.
    const lastFetch = new Date('2026-01-10T07:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 60);
    expect(startDate.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('treats an invalid (NaN-backed) lastFetch the same as null (widens to the cap)', () => {
    const invalidDate = new Date('not-a-date');
    const { startDate } = calculateFetchWindow(now, 60, invalidDate, 10080);
    expect(startDate.toISOString()).toBe('2026-01-03T10:00:00.000Z');
  });

  it('throws RangeError for a non-positive maxLookbackMinutes', () => {
    expect(() => calculateFetchWindow(now, 60, null, 0)).toThrow(RangeError);
  });

  it('throws RangeError for a non-integer maxLookbackMinutes', () => {
    expect(() => calculateFetchWindow(now, 60, null, 1.5)).toThrow(RangeError);
  });

  it('throws RangeError for NaN maxLookbackMinutes', () => {
    expect(() => calculateFetchWindow(now, 60, null, NaN)).toThrow(RangeError);
  });

  it('propagates RangeError from calculateTimeWindow for an invalid timeWindowMinutes', () => {
    expect(() => calculateFetchWindow(now, 7, null, 10080)).toThrow(RangeError);
  });

  it('forwards a custom lookbackMinutes to the baseline instead of the 2x default', () => {
    // A 24-hour orders lookback: baseline startDate reaches back a full day
    // instead of 2 hours. lastFetch sits inside that wider baseline (but
    // outside the normal 2-hour one), so this returns the baseline as-is —
    // proving the baseline itself widened, not that outage-recovery kicked in.
    const lastFetch = new Date('2026-01-10T00:00:00.000Z');
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 10080, 1440);
    expect(startDate.toISOString()).toBe('2026-01-09T10:00:00.000Z');
  });

  it('never narrows below an explicit lookbackMinutes baseline even when it exceeds maxLookbackMinutes', () => {
    // Same "baseline always wins" invariant as the 2x-default case above,
    // but exercised with an explicit lookbackMinutes (e.g. a misconfigured
    // ORDERS_LOOKBACK_MINUTES set larger than MAX_LOOKBACK_MINUTES): the
    // baseline (24h = 1440min) reaches back further than maxLookbackMinutes
    // (60min) alone would allow, so the cap has no effect at all here.
    const lastFetch = new Date('2026-01-09T00:00:00.000Z'); // older than the 24h baseline
    const { startDate } = calculateFetchWindow(now, 60, lastFetch, 60, 1440);
    expect(startDate.toISOString()).toBe('2026-01-09T10:00:00.000Z');
  });
});
