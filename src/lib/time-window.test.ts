import { describe, expect, it } from 'vitest';

import { calculateTimeWindow } from './time-window';

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
});
