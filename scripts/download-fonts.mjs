#!/usr/bin/env node
/**
 * Downloads Inter-Regular.ttf and Inter-Bold.ttf from the latest rsms/inter
 * GitHub release into dist/bundle/ (default) — where the ncc bundle expects
 * to find them — or another directory passed as the first CLI argument (e.g.
 * `dist/services`, where a plain `tsc` build's pdf-generator.js looks).
 *
 * Skips download if both files are already present (e.g. after a clean build
 * where fonts haven't changed).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, '..', 'dist', 'bundle');
const TMP_ZIP = '/tmp/inter-font.zip';
const TMP_EXTRACT = '/tmp/inter-font-extract';

// Verify unzip is available before proceeding
try {
  execFileSync('unzip', ['--version'], { stdio: 'ignore' });
} catch {
  throw new Error(
    '`unzip` is required but not found. ' +
      'Install it with: sudo apt install unzip (Linux) or brew install unzip (macOS)',
  );
}

mkdirSync(OUTDIR, { recursive: true });

const regularDest = path.join(OUTDIR, 'Inter-Regular.ttf');
const boldDest = path.join(OUTDIR, 'Inter-Bold.ttf');

if (existsSync(regularDest) && existsSync(boldDest)) {
  console.log('Inter fonts already present, skipping download.');
  process.exit(0);
}

console.log('Fetching latest Inter release from GitHub...');
const apiRes = await fetch(
  'https://api.github.com/repos/rsms/inter/releases/latest',
  { headers: { 'User-Agent': 'shippo-packing-slips' } },
);
if (!apiRes.ok) {
  throw new Error(`GitHub API error: ${apiRes.status} ${apiRes.statusText}`);
}
const release = await apiRes.json();

const zipAsset = release.assets?.find((a) => a.name.endsWith('.zip'));
if (!zipAsset) {
  throw new Error(
    `No zip asset found in release ${release.tag_name}. ` +
      `Available: ${release.assets?.map((a) => a.name).join(', ')}`,
  );
}

console.log(`Downloading ${zipAsset.name}...`);
const zipRes = await fetch(zipAsset.browser_download_url);
if (!zipRes.ok) {
  throw new Error(`Download failed: ${zipRes.status} ${zipRes.statusText}`);
}
await writeFile(TMP_ZIP, Buffer.from(await zipRes.arrayBuffer()));

rmSync(TMP_EXTRACT, { recursive: true, force: true });
mkdirSync(TMP_EXTRACT, { recursive: true });
execFileSync('unzip', ['-q', TMP_ZIP, '-d', TMP_EXTRACT]);

/**
 * Recursively find a file by name within a directory.
 * @param {string} dir
 * @param {string} name
 * @returns {string | null}
 */
function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

const regularSrc = findFile(TMP_EXTRACT, 'Inter-Regular.ttf');
const boldSrc = findFile(TMP_EXTRACT, 'Inter-Bold.ttf');

if (!regularSrc || !boldSrc) {
  throw new Error('Could not find Inter TTF files in the release zip');
}

await copyFile(regularSrc, regularDest);
await copyFile(boldSrc, boldDest);

rmSync(TMP_EXTRACT, { recursive: true, force: true });
rmSync(TMP_ZIP, { force: true });

console.log(`✓ Inter fonts downloaded to ${OUTDIR}/`);
