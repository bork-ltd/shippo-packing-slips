# Architecture

## Overview

A single Node.js script that runs on a schedule via cron on a Raspberry Pi Zero 2 W. On each run it checks Shippo for recent activity and sends documents to a Knaon thermal printer via CUPS.

## What It Does

Each cron run performs three jobs over a **2x lookback window** (default: last 2 × 60 minutes):

1. **Packing slips** — Fetch PAID orders from Shippo → check sentinel *(skip + delete if found)* → generate PDF → print via `lp` → leave file on disk as sentinel
2. **Shipping labels** — Fetch shipments with Shippo labels → check sentinel *(skip + delete if found)* → download label PDF → print via `lp` → leave file on disk as sentinel
3. **USPS pickup scheduling** — If any new labels were printed this run, resolve the pickup address and carrier account from Shippo and schedule a single pickup for all of them, with a window from tomorrow 08:00 UTC through D+4 18:00 UTC — wide enough to guarantee the next business day falls within it even across a 3-day holiday weekend

Temp files are written to `/tmp`. Files from the prior window are cleaned up when encountered as already-printed sentinels on the current run.

## Design Principles

The script is intentionally stateless — no database, no state file, no external tracking store. Deduplication is achieved using the PDF files already written to `/tmp` as ephemeral sentinels. No additional infrastructure is required.

## Deduplication

### The boundary timing problem

Orders near a cron window boundary may not yet be `PAID` (or not yet synced to the Shippo API) when the cron fires. The next run's window has moved forward and no longer covers that order's timestamp — it is permanently missed.

### Solution: 2x lookback + sentinel files

Both jobs query a **2x window** (e.g., last 2 hours for a 60-minute cron). On each run:

- If the PDF file for an item already exists in `/tmp`, it was printed in the previous run → skip it and delete the sentinel
- If the file does not exist, print it and leave the file on disk for the next run to detect

Under normal operation, this ensures every item in the trailing window gets a second chance to be processed without reprinting items that already went through.

### Trade-offs and edge cases

| Scenario | Behavior |
|---|---|
| Pi reboots between print run and cleanup run | `/tmp` is tmpfs and is cleared on reboot; items in the lookback zone may reprint once — acceptable trade-off for stateless operation |
| `printPDF` fails after file write succeeds | Sentinel may or may not be on disk depending on whether the write completed before the error; next run skips if found, retries if not — consistent with existing no-retry behavior |
| Manual re-run within same window | Second run finds sentinels, skips all — correct |
| Order cancelled before lookback cleanup | Not returned by API; sentinel sits in `/tmp` until OS cleans it — benign |
| Label download fails partway | No sentinel left (write failed); next run retries — correct |

## Stack

- **Runtime**: Node.js 24 (TypeScript, bundled via `@vercel/ncc`)
- **PDF generation**: PDFKit (packing slips only; shipping labels are fetched as PDFs from Shippo)
- **Printing**: CUPS (`lp` command)
- **API**: Shippo SDK

## Source Structure

```
src/
  index.ts           ← single entry point, orchestrates all three jobs
  lib/
    pdf-generator.ts ← generatePackingSlip()
    printer.ts       ← printPDF() via CUPS lp command
    shippo.ts        ← fetchOrders(), fetchTransactions(), fetchPickupDetails(), schedulePickup()
```


## Deployment

The script runs on a **Raspberry Pi Zero 2 W** (aarch64, 512MB RAM) connected via USB to the Knaon thermal printer.

### CD Pipeline

On every merge to `main`, GitHub Actions:
1. Bundles `src/index.ts` and all dependencies into a single JS file using `@vercel/ncc`
2. Publishes the bundle and its required assets as GitHub Release assets:
   - `index.js` — the bundle
   - `*.afm` + `sRGB_IEC61966_2_1.icc` — PDFKit font metrics and color profile

Inter font files (`Inter-Regular.ttf`, `Inter-Bold.ttf`) are **not** published in the release — they are sourced directly from the [rsms/inter](https://github.com/rsms/inter) GitHub releases and placed on the Pi once during provisioning.

### Pi Cron Job

The Pi's system timezone must be set to UTC to avoid DST-related cron skips or double-fires:

```bash
sudo timedatectl set-timezone UTC
```

The cron schedule must match `CRON_TIME_WINDOW_MINUTES`. The script floors each run to the nearest window boundary anchored to UTC midnight, so the window is deterministic regardless of when within the interval the script starts. `CRON_TIME_WINDOW_MINUTES` must evenly divide 1440 (minutes in a day) — the script exits with an error otherwise.

The command must `cd` to the home directory first so that `dotenv` finds `~/.env`. A `PATH` line is required because cron's default PATH (`/usr/bin:/bin`) does not include `/usr/local/bin` where the `node` symlink lives.

Example for a 30-minute window (`CRON_TIME_WINDOW_MINUTES=30`):

```
PATH=/usr/local/bin:/usr/bin:/bin
0,30 * * * * cd "$HOME" && node "$HOME/bundle/index.js" >> "$HOME/cron.log" 2>&1
```

To install or edit: `crontab -e`. Output is appended to `~/cron.log`.

To update the bundle after a new release, run `update-shippo` (alias configured during provisioning — see below).

No git, yarn, or npm required on the Pi — only `node`, `curl`, and `unzip` (for initial provisioning).

### Pi Provisioning (one-time setup)

On first setup, the bundle directory must contain all static assets before the cron job runs. These files never change and only need to be downloaded once:

Add the `update-shippo` alias to `~/.bashrc` so future updates can be run with a single command:

```bash
echo "alias update-shippo='curl -fsSL https://github.com/brianespinosa/shippo-packing-slips/releases/latest/download/index.js -o ~/bundle/index.js'" >> ~/.bashrc
source ~/.bashrc
```

After installing Node.js, create a stable symlink so `node` is available on cron's default PATH:

```bash
sudo ln -sf "$(which node)" /usr/local/bin/node
```

Re-run this command after upgrading Node.js.

```bash
mkdir -p ~/bundle

# PDFKit assets (from this project's GitHub releases)
RELEASE_BASE=https://github.com/brianespinosa/shippo-packing-slips/releases/latest/download
for f in Helvetica.afm Helvetica-Bold.afm Helvetica-BoldOblique.afm Helvetica-Oblique.afm \
          Times-Roman.afm Times-Bold.afm Times-Italic.afm Times-BoldItalic.afm \
          Courier.afm Courier-Bold.afm Courier-Oblique.afm Courier-BoldOblique.afm \
          Symbol.afm ZapfDingbats.afm sRGB_IEC61966_2_1.icc; do
  curl -fsSL "$RELEASE_BASE/$f" -o ~/bundle/"$f"
done

# Inter fonts (from rsms/inter GitHub releases — fetches latest version dynamically)
INTER_ZIP_URL=$(curl -fsSL \
  -H "User-Agent: shippo-packing-slips" \
  "https://api.github.com/repos/rsms/inter/releases/latest" \
  | grep -o '"browser_download_url":"[^"]*\.zip"' \
  | grep -o 'https://[^"]*')
curl -fsSL "$INTER_ZIP_URL" -o /tmp/inter.zip
unzip -p /tmp/inter.zip extras/ttf/Inter-Regular.ttf > ~/bundle/Inter-Regular.ttf
unzip -p /tmp/inter.zip extras/ttf/Inter-Bold.ttf > ~/bundle/Inter-Bold.ttf
rm /tmp/inter.zip
```

### Environment

The script requires a `~/.env` file in the Pi user's home directory (not `~/bundle/`). `dotenv` resolves `.env` relative to the working directory, and the cron job runs from `~`.

```
SHIPPO_API_TOKEN=shippo_live_...
CUPS_PRINTER_NAME=Knaon
COMPANY_NAME=...
```

See `.env.example` for all available variables, including the optional
`SLACK_WEBHOOK_URL` (per-print and per-error notifications) and
`HEALTHCHECK_PING_URL` (dead-man's-switch pinged on successful runs; set the
monitor's period to match `CRON_TIME_WINDOW_MINUTES` plus a few minutes of
grace so a missed ping alerts when the Pi is offline or hung without
false-alarming on a single transient blip).

## Printer

- **Hardware**: Knaon thermal printer (USB)
- **Format**: 4x6 inch labels
- **Interface**: CUPS (`lp -d <printer-name>`)
- **Color**: Black and white only (thermal printer hardware limitation; no software conversion)
