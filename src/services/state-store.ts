import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type FetchJob = 'orders' | 'labels';

/** Temp PDFs older than this are stale sentinels from a run whose printed/
 * marker write failed or a pre-migration leftover; the sweep clears them so
 * /tmp does not grow unbounded. Comfortably longer than any cron interval in
 * use. */
const TMP_PDF_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * The persistent state directory: fetch watermarks, print markers, and the
 * daily pickup sentinel. Configurable via STATE_DIR (primarily for tests);
 * defaults to a dotfile under the Pi user's home directory so it survives a
 * reboot, unlike /tmp (tmpfs).
 *
 * An unset or blank STATE_DIR (e.g. the `STATE_DIR=` placeholder in
 * .env.example) must fall back to the default — dotenv parses that as `''`,
 * which is not nullish, so `??` alone would silently resolve to a relative
 * path under the cron job's cwd instead.
 */
export function getStateDir(): string {
  const configured = process.env.STATE_DIR?.trim();
  return configured ? configured : path.join(os.homedir(), '.shippo-state');
}

function printedDir(stateDir: string): string {
  return path.join(stateDir, 'printed');
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function fetchWatermarkPath(stateDir: string, job: FetchJob): string {
  return path.join(stateDir, `${job}-last-fetch`);
}

/**
 * Read the last successful fetch time for a job.
 * @returns The stored timestamp, or null when unset (first run) or the file
 *   content is not a valid date (warned, not thrown — treated as unset so
 *   the run falls back to the normal 2x window rather than failing).
 */
export async function readLastFetch(
  stateDir: string,
  job: FetchJob,
): Promise<Date | null> {
  const filePath = fetchWatermarkPath(stateDir, job);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.warn(
      `Warning: failed to read fetch watermark ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
  const timestamp = new Date(content.trim());
  if (Number.isNaN(timestamp.getTime())) {
    console.warn(
      `Warning: fetch watermark ${filePath} has invalid content, ignoring: ${JSON.stringify(content.trim())}`,
    );
    return null;
  }
  return timestamp;
}

/** Record a job's last successful fetch time. Call with the window's endDate. */
export async function writeLastFetch(
  stateDir: string,
  job: FetchJob,
  date: Date,
): Promise<void> {
  await ensureDir(stateDir);
  await writeFile(fetchWatermarkPath(stateDir, job), date.toISOString());
}

/** Whether a print marker already exists for this key (already printed). */
export async function hasPrintMarker(
  stateDir: string,
  key: string,
): Promise<boolean> {
  try {
    await stat(path.join(printedDir(stateDir), key));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/** Record that an item was printed, so future runs skip it. */
export async function writePrintMarker(
  stateDir: string,
  key: string,
): Promise<void> {
  const dir = printedDir(stateDir);
  await ensureDir(dir);
  await writeFile(path.join(dir, key), '');
}

/**
 * Delete print markers and the pickup sentinel older than maxLookbackMs
 * (they can never be relevant again — the fetch window can never widen past
 * that cap), and stale PDFs older than an hour in tmpDir (a failed marker
 * write, or a leftover from before this migration).
 * @param tmpDir - Directory scanned for stale packing-slip/label PDFs.
 *   Defaults to '/tmp'; overridable so tests never touch the real /tmp.
 */
export async function sweepState(
  stateDir: string,
  now: Date,
  maxLookbackMs: number,
  tmpDir = '/tmp',
): Promise<void> {
  await sweepDirByAge(printedDir(stateDir), now.getTime() - maxLookbackMs);
  await sweepPickupSentinels(stateDir, now.getTime() - maxLookbackMs);
  await sweepTmpPdfs(tmpDir, now.getTime() - TMP_PDF_MAX_AGE_MS);
}

async function sweepDirByAge(dir: string, cutoffMs: number): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    console.warn(
      `Warning: failed to sweep state directory ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const stats = await stat(filePath);
      if (stats.mtimeMs < cutoffMs) {
        await rm(filePath);
      }
    } catch (error) {
      console.warn(
        `Warning: failed to sweep ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function sweepPickupSentinels(
  stateDir: string,
  cutoffMs: number,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(stateDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    console.warn(
      `Warning: failed to sweep state directory ${stateDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith('pickup-requested-')) continue;
    const filePath = path.join(stateDir, entry);
    try {
      const stats = await stat(filePath);
      if (stats.mtimeMs < cutoffMs) {
        await rm(filePath);
      }
    } catch (error) {
      console.warn(
        `Warning: failed to sweep ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function sweepTmpPdfs(tmpDir: string, cutoffMs: number): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(tmpDir);
  } catch (error) {
    console.warn(
      `Warning: failed to sweep ${tmpDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  for (const entry of entries) {
    if (!/^(packing-slip|label)-.*\.pdf$/.test(entry)) continue;
    const filePath = path.join(tmpDir, entry);
    try {
      const stats = await stat(filePath);
      if (stats.mtimeMs < cutoffMs) {
        await rm(filePath);
      }
    } catch (error) {
      console.warn(
        `Warning: failed to sweep ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
