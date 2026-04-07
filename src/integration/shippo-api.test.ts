import { TransactionStatusEnum } from 'shippo/models/components';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  fetchOrders,
  fetchPickupDetails,
  fetchTransactions,
} from '../services/shippo';
import { setupTestTransaction, teardownTestTransaction } from './helpers';

let testSetup: Awaited<ReturnType<typeof setupTestTransaction>>;

beforeAll(async () => {
  if (!process.env.SHIPPO_API_TOKEN) {
    throw new Error(
      'SHIPPO_API_TOKEN is required for integration tests. ' +
        'Set a Shippo test-mode token (shippo_test_...) in the environment.',
    );
  }
  testSetup = await setupTestTransaction();
}, 60_000);

afterAll(async () => {
  if (testSetup) {
    await teardownTestTransaction(testSetup.client, testSetup.transactionId);
  } else {
    console.warn(
      '[afterAll] testSetup is undefined — teardown skipped. ' +
        'If a transaction was created before beforeAll failed, it may need manual cleanup.',
    );
  }
});

describe('fetchTransactions', () => {
  let recentResults: Awaited<ReturnType<typeof fetchTransactions>>;
  let windowStart: Date;
  let windowEnd: Date;

  beforeAll(async () => {
    windowEnd = new Date();
    windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    recentResults = await fetchTransactions(windowStart, windowEnd);
  });

  it('returns an array for a recent time window', () => {
    expect(Array.isArray(recentResults)).toBe(true);
  });

  it('all returned transactions have labelUrl set', () => {
    for (const tx of recentResults) {
      expect(tx.labelUrl).toBeTruthy();
    }
  });

  it('all returned transactions have objectCreated defined', () => {
    for (const tx of recentResults) {
      expect(tx.objectCreated).toBeDefined();
    }
  });

  it('all returned transactions fall within the requested date range', () => {
    for (const tx of recentResults) {
      expect(tx.objectCreated?.getTime()).toBeGreaterThanOrEqual(
        windowStart.getTime(),
      );
      expect(tx.objectCreated?.getTime()).toBeLessThanOrEqual(
        windowEnd.getTime(),
      );
    }
  });

  it('all returned transactions have SUCCESS status', () => {
    for (const tx of recentResults) {
      expect(tx.status).toBe(TransactionStatusEnum.Success);
    }
  });

  it('returns an empty array for a future time window', async () => {
    const futureStart = new Date('2099-01-01T00:00:00.000Z');
    const futureEnd = new Date('2099-01-02T00:00:00.000Z');
    const results = await fetchTransactions(futureStart, futureEnd);
    expect(results).toEqual([]);
  });
});

describe('fetchOrders', () => {
  it('returns an array for a recent time window', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const results = await fetchOrders(start, end);
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns an empty array for a future time window', async () => {
    const futureStart = new Date('2099-01-01T00:00:00.000Z');
    const futureEnd = new Date('2099-01-02T00:00:00.000Z');
    const results = await fetchOrders(futureStart, futureEnd);
    expect(results).toEqual([]);
  });
});

describe('fetchPickupDetails', () => {
  it('resolves carrierAccount and address from test transaction', async () => {
    if (!testSetup) {
      throw new Error('testSetup not initialized — beforeAll likely failed');
    }
    const details = await fetchPickupDetails(testSetup.transactionId);
    expect(typeof details.carrierAccount).toBe('string');
    expect(details.carrierAccount.length).toBeGreaterThan(0);
    expect(details.address.name).toBe('Test Sender');
    expect(details.address.street1).toBe('123 Main St');
    expect(details.address.city).toBe('San Francisco');
    expect(details.address.state).toBe('CA');
    expect(details.address.zip).toBe('94103');
  });

  it('throws a descriptive error for an unknown transaction ID', async () => {
    await expect(
      fetchPickupDetails('nonexistent-transaction-id-00000'),
    ).rejects.toThrow('Failed to fetch pickup details');
  });
});
