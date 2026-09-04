import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hasPrintMarker,
  readLastFetch,
  sweepState,
  writeLastFetch,
  writePrintMarker,
} from './state-store';

let stateDir: string;
let tmpDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), 'shippo-state-test-'));
  // A separate fake "/tmp" so sweepState's PDF sweep never touches the
  // machine's real /tmp directory.
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shippo-tmp-test-'));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
  await rm(tmpDir, { recursive: true, force: true });
});

describe('fetch watermarks', () => {
  it('returns null when unset', async () => {
    expect(await readLastFetch(stateDir, 'orders')).toBeNull();
  });

  it('round-trips a written timestamp', async () => {
    const date = new Date('2026-01-01T12:00:00.000Z');
    await writeLastFetch(stateDir, 'orders', date);
    const read = await readLastFetch(stateDir, 'orders');
    expect(read?.toISOString()).toBe(date.toISOString());
  });

  it('keeps orders and labels watermarks independent', async () => {
    await writeLastFetch(
      stateDir,
      'orders',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(await readLastFetch(stateDir, 'labels')).toBeNull();
  });

  it('returns null and warns for unparseable content', async () => {
    const filePath = path.join(stateDir, 'orders-last-fetch');
    await writeFile(filePath, 'not-a-date');
    expect(await readLastFetch(stateDir, 'orders')).toBeNull();
  });

  it('returns null and logs loudly for a non-ENOENT read error', async () => {
    // A directory in place of the watermark file triggers EISDIR on read —
    // an unexpected error distinct from the benign "file doesn't exist yet".
    const filePath = path.join(stateDir, 'orders-last-fetch');
    await mkdir(filePath);
    expect(await readLastFetch(stateDir, 'orders')).toBeNull();
  });

  it('creates the state directory on first write', async () => {
    const nestedDir = path.join(stateDir, 'nested');
    await writeLastFetch(nestedDir, 'orders', new Date());
    await expect(stat(nestedDir)).resolves.toBeDefined();
  });
});

describe('print markers', () => {
  it('reports false when no marker exists', async () => {
    expect(
      await hasPrintMarker(stateDir, 'packing-slip-2026-01-01-ORDER1'),
    ).toBe(false);
  });

  it('reports true after a marker is written', async () => {
    const key = 'packing-slip-2026-01-01-ORDER1';
    await writePrintMarker(stateDir, key);
    expect(await hasPrintMarker(stateDir, key)).toBe(true);
  });
});

describe('sweepState', () => {
  it('removes print markers older than the cap and keeps recent ones', async () => {
    const oldKey = 'label-2026-01-01-OLD';
    const freshKey = 'label-2026-01-01-FRESH';
    await writePrintMarker(stateDir, oldKey);
    await writePrintMarker(stateDir, freshKey);

    const oldPath = path.join(stateDir, 'printed', oldKey);
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(oldPath, past, past);

    await sweepState(stateDir, new Date(), 7 * 24 * 60 * 60 * 1000, tmpDir);

    expect(await hasPrintMarker(stateDir, oldKey)).toBe(false);
    expect(await hasPrintMarker(stateDir, freshKey)).toBe(true);
  });

  it('removes pickup sentinels older than the cap and keeps recent ones', async () => {
    const oldSentinel = path.join(stateDir, 'pickup-requested-2025-12-01');
    const freshSentinel = path.join(stateDir, 'pickup-requested-2026-01-01');
    await writeFile(oldSentinel, '');
    await writeFile(freshSentinel, '');
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(oldSentinel, past, past);

    await sweepState(stateDir, new Date(), 7 * 24 * 60 * 60 * 1000, tmpDir);

    await expect(stat(oldSentinel)).rejects.toThrow();
    await expect(stat(freshSentinel)).resolves.toBeDefined();
  });

  it('removes stale tmpDir PDFs older than an hour and keeps recent ones and non-matching files', async () => {
    const oldPdf = path.join(tmpDir, 'packing-slip-2026-01-01-OLD.pdf');
    const freshPdf = path.join(tmpDir, 'label-2026-01-01-FRESH.pdf');
    const unrelated = path.join(tmpDir, 'not-ours.pdf');
    await writeFile(oldPdf, '');
    await writeFile(freshPdf, '');
    await writeFile(unrelated, '');
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(oldPdf, past, past);
    await utimes(unrelated, past, past);

    await sweepState(stateDir, new Date(), 7 * 24 * 60 * 60 * 1000, tmpDir);

    await expect(stat(oldPdf)).rejects.toThrow();
    await expect(stat(freshPdf)).resolves.toBeDefined();
    // Old but not our naming pattern — must survive the sweep.
    await expect(stat(unrelated)).resolves.toBeDefined();
  });

  it('is a no-op when the state directory does not exist yet', async () => {
    const missingDir = path.join(stateDir, 'never-created');
    await expect(
      sweepState(missingDir, new Date(), 7 * 24 * 60 * 60 * 1000, tmpDir),
    ).resolves.toBeUndefined();
  });

  it('warns and continues when tmpDir does not exist', async () => {
    const missingTmpDir = path.join(tmpDir, 'never-created');
    await expect(
      sweepState(stateDir, new Date(), 7 * 24 * 60 * 60 * 1000, missingTmpDir),
    ).resolves.toBeUndefined();
  });
});
