import type { Transaction } from 'shippo/models/components';
import { describe, expect, it } from 'vitest';

import { filterTransaction } from './filter-transaction';

const startDate = new Date('2026-01-01T10:00:00.000Z');
const endDate = new Date('2026-01-01T11:00:00.000Z');

function makeTx(
  objectCreated: Date | undefined,
  labelUrl?: string,
): Transaction {
  return { objectCreated, labelUrl } as unknown as Transaction;
}

describe('filterTransaction', () => {
  describe("'stop'", () => {
    it('returns stop when created is before startDate', () => {
      const tx = makeTx(
        new Date('2026-01-01T09:59:00.000Z'),
        'http://label.url',
      );
      expect(filterTransaction(tx, startDate, endDate)).toBe('stop');
    });

    it('returns stop when created is startDate minus 1ms', () => {
      const tx = makeTx(new Date(startDate.getTime() - 1), 'http://label.url');
      expect(filterTransaction(tx, startDate, endDate)).toBe('stop');
    });
  });

  describe("'match'", () => {
    it('returns match when created equals startDate exactly and labelUrl is set', () => {
      const tx = makeTx(new Date(startDate), 'http://label.url');
      expect(filterTransaction(tx, startDate, endDate)).toBe('match');
    });

    it('returns match when created is within window and labelUrl is set', () => {
      const tx = makeTx(
        new Date('2026-01-01T10:30:00.000Z'),
        'http://label.url',
      );
      expect(filterTransaction(tx, startDate, endDate)).toBe('match');
    });

    it('returns match when created equals endDate exactly and labelUrl is set', () => {
      const tx = makeTx(new Date(endDate), 'http://label.url');
      expect(filterTransaction(tx, startDate, endDate)).toBe('match');
    });
  });

  describe("'skip'", () => {
    it('returns skip when within window but labelUrl is undefined', () => {
      const tx = makeTx(new Date('2026-01-01T10:30:00.000Z'), undefined);
      expect(filterTransaction(tx, startDate, endDate)).toBe('skip');
    });

    it('returns skip when within window but labelUrl is empty string', () => {
      const tx = makeTx(new Date('2026-01-01T10:30:00.000Z'), '');
      expect(filterTransaction(tx, startDate, endDate)).toBe('skip');
    });

    it('returns skip when created is after endDate', () => {
      const tx = makeTx(
        new Date('2026-01-01T12:00:00.000Z'),
        'http://label.url',
      );
      expect(filterTransaction(tx, startDate, endDate)).toBe('skip');
    });

    it('returns skip when created is undefined', () => {
      const tx = makeTx(undefined, 'http://label.url');
      expect(filterTransaction(tx, startDate, endDate)).toBe('skip');
    });
  });
});
