# Architecture

## Overview

A single Node.js script that runs on a schedule via cron on a Raspberry Pi Zero 2 W. On each run it checks Shippo for recent activity and sends documents to a Knaon thermal printer via CUPS.

## What It Does

Each cron run performs three jobs over a **fetch window per job**, widened when either job's last successful fetch is older than the normal window (see [Resilience to outages](#resilience-to-outages)). Packing slips and labels use different normal windows (see [Two different lookback windows](#two-different-lookback-windows)):

1. **Packing slips** — Fetch orders from Shippo (server-side `PAID`/`UNKNOWN` filter, unless `INCLUDE_ALL_ORDER_STATUSES=true`; client-side `isPrintableOrder` gates each one: `PAID` always prints, `UNKNOWN` prints only when `shopApp` is `Shippo` — an order created directly via the API/dashboard, e.g. duplicated to reprint a fulfillment, never receives a shop integration's payment webhook so never leaves `UNKNOWN` on its own; a terminal status — `SHIPPED`/`PARTIALLY_FULFILLED`/`CANCELLED`/`REFUNDED` — always excludes) → check print marker *(skip if found)* → generate PDF → print via `lp` → record print marker
2. **Shipping labels** — Fetch transactions with Shippo labels not yet scanned by the carrier (`trackingStatus` is `PRE_TRANSIT`, `UNKNOWN`, or absent) → check print marker *(skip if found)* → download label PDF → print via `lp` → record print marker
3. **USPS pickup scheduling** — If any new labels were printed this run, resolve the pickup address and carrier account from Shippo and schedule a single pickup for all of them, with a window from tomorrow 08:00 UTC through D+4 18:00 UTC — wide enough to guarantee the next business day falls within it even across a 3-day holiday weekend

PDFs are written to `/tmp` only as scratch space for `lp` and deleted right after a successful print; the durable dedup record is a marker file in the persistent state directory (see below), not the PDF's presence.

## Design Principles

The script has never been fully stateless — the `/tmp` sentinel-file dedup below predates this document — and now explicitly keeps two small pieces of durable state instead: a **fetch watermark** per job (last successful fetch time, for outage recovery) and a **print marker** per item (dedup), both under one directory, still no database. Order/label **status** is the outermost safety net: it is checked on every fetch regardless of state, so even a total loss of the state directory cannot reprint something Shippo already reports as shipped, cancelled, refunded, or in the carrier's hands.

## Persistent state directory

Configurable via `STATE_DIR`; defaults to `~/.shippo-state` on the Pi user's home directory (not `/tmp`, which is tmpfs and clears on reboot — see [Resilience to outages](#resilience-to-outages) for why that matters). See `src/services/state-store.ts`.

| Path | Purpose |
|---|---|
| `orders-last-fetch` | ISO-8601 timestamp of the packing-slips job's last successful fetch |
| `labels-last-fetch` | same, for the labels job |
| `printed/<key>` | zero-byte marker per printed slip/label, keyed by `<kind>-<date>-<id>` (`src/lib/sentinel-key.ts`) |
| `pickup-requested-YYYY-MM-DD` | daily pickup sentinel |

A sweep on every run (`sweepState`) deletes markers and the pickup sentinel older than `MAX_LOOKBACK_MINUTES` (they can never be relevant again — the fetch window can never widen past that cap), and any `/tmp` packing-slip/label PDF older than an hour (a stale leftover from a run whose marker write failed).

## Deduplication

### The boundary timing problem

Orders near a cron window boundary may not yet be `PAID` (or not yet synced to the Shippo API) when the cron fires — and for some shop integrations this can take hours, not seconds. The next run's window has moved forward and no longer covers that order's `placed_at` — it is permanently missed. See [Two different lookback windows](#two-different-lookback-windows) for how the orders job's baseline window is sized to absorb this.

### Solution: baseline lookback + print markers

Both jobs query at least their normal baseline window (see [Two different lookback windows](#two-different-lookback-windows)). On each run:

- If a print marker for an item already exists, it was printed in a previous run → skip it
- If not, print it and record the marker

Under normal operation, this ensures every item in the trailing window gets a second chance to be processed without reprinting items that already went through.

## Two different lookback windows

`calculateFetchWindow` (`src/lib/time-window.ts`) computes a **baseline** window per job, then widens it for outage recovery (below). The baseline itself differs by job, because the two jobs have different failure modes:

- **Labels** use the historical **2x `CRON_TIME_WINDOW_MINUTES`** window (e.g. last 2 hours for a 60-minute cron). We create labels ourselves — there's no external sync lag, so 2x is only there to survive one missed run at a cron-interval boundary.
- **Packing slips (orders)** use a much wider **`ORDERS_LOOKBACK_MINUTES`** window (default 1440 minutes / 24 hours), independent of `CRON_TIME_WINDOW_MINUTES`. A shop integration (Etsy, Shopify, ...) can take **hours** to sync an order's status to `PAID` after its `placed_at`, and the fetch filters on `placed_at` — once a run's window slides past an order's `placed_at`, that order can never be matched again on its own, even though nothing ever errored (observed directly: an Etsy order took over 3 hours to sync as `PAID`, and a tight window silently missed it with no error and no Slack alert — there was nothing to error on, since the order simply never appeared in any fetch's results). `endDate` still floors to the deterministic `CRON_TIME_WINDOW_MINUTES` boundary either way; only how far `startDate` reaches back differs.

## Resilience to outages

The baseline window alone only survives one missed run for labels, or up to `ORDERS_LOOKBACK_MINUTES` of sync/processing lag for orders — beyond that, two consecutive fetch failures (or a sync delay longer than the baseline) permanently lose anything that falls out of the window before a run succeeds again. Each job instead tracks its own last-successful-fetch watermark (`orders-last-fetch` / `labels-last-fetch`). On every run, the window starts at the earlier of the job's normal baseline boundary and that watermark, capped at `MAX_LOOKBACK_MINUTES` (default 7 days) so a very long outage can't trigger an unbounded catch-up fetch — see `calculateFetchWindow` in `src/lib/time-window.ts`.

A **missing or unparseable watermark file is treated as maximally stale**, not as "first run, assume healthy" — it widens straight to the `MAX_LOOKBACK_MINUTES` cap, same as an outage that long. This is deliberate: it makes the watermark file itself a manual recovery lever. Deleting `orders-last-fetch`/`labels-last-fetch` (or the whole state directory) forces the next run to fetch and print every non-terminal order/label in the last `MAX_LOOKBACK_MINUTES` — useful to force a reprint of anything that errored out, or to recover after wiping state for any other reason. It also means **the very first run ever** (a fresh Pi provision, or the first run after this feature was deployed) does the same 7-day catch-up, not a quiet baseline window — deploy or provision with that in mind.

There is deliberately **no in-process retry with backoff**. Cron already fires every `CRON_TIME_WINDOW_MINUTES`, and that's the retry; a failed fetch does not send a Slack alert either, since that would fire on every tick of an outage — the `HEALTHCHECK_PING_URL` dead-man's-switch (skipped on any failing run) is the single source of truth for "something is down." A failed fetch leaves its watermark unchanged, so the very next run's window widens automatically once the outage clears.

Because the widened window can pull in items well outside a normal baseline reprint radius, the status filters described in [What It Does](#what-it-does) are load-bearing here: they are what stops a multi-day catch-up from reprinting a slip for an order that shipped last week, or a label whose package the carrier has already scanned.

### Trade-offs and edge cases

| Scenario | Behavior |
|---|---|
| Pi reboots mid-run | `/tmp` PDFs are lost (tmpfs), but print markers and fetch watermarks live in the persistent state directory and survive — nothing reprints solely because of a reboot |
| `printPDF` fails after the PDF was written | No print marker was recorded; next run retries — consistent with existing no-retry behavior |
| Manual re-run within same window | Second run finds the print markers, skips all — correct |
| Order cancelled before lookback cleanup | Excluded by the terminal-status filter regardless of markers |
| Label download fails partway | No print marker recorded (write failed); next run retries — correct |
| A job's fetch fails for longer than `MAX_LOOKBACK_MINUTES` | Orders/labels older than the cap are not automatically recovered — reconcile manually via the Shippo dashboard |
| Watermark file deleted (deliberately or by an operator wiping state) | Treated as maximally stale — next run widens to `MAX_LOOKBACK_MINUTES` and reprints every non-terminal order/label in that window that lacks a print marker |
| First run ever (fresh provision, or first run after this feature ships) | Same as above: no watermark file exists yet, so it widens to `MAX_LOOKBACK_MINUTES` rather than the normal baseline window |
| An order's `PAID` sync lands after the orders window has already slid past its `placed_at` | Missed with no error and no Slack alert (nothing to error on — the order just never appears in a fetch's results); `ORDERS_LOOKBACK_MINUTES` is sized to absorb typical sync lag, but a sync delay longer than that still needs a manual state wipe to recover, same as any other permanently-missed item |

## Stack

- **Runtime**: Node.js 24 (TypeScript, bundled via `@vercel/ncc`)
- **PDF generation**: PDFKit (packing slips only; shipping labels are fetched as PDFs from Shippo)
- **Printing**: CUPS (`lp` command)
- **API**: Shippo SDK

## Source Structure

```
src/
  index.ts               ← single entry point, orchestrates all three jobs
  lib/
    time-window.ts       ← calculateTimeWindow(), calculateFetchWindow()
    filter-order.ts       ← isTerminalOrderStatus()
    filter-transaction.ts ← filterTransaction() (date window + carrier-scan status)
    sentinel-key.ts       ← buildSentinelKey()
  services/
    pdf-generator.ts     ← generatePackingSlip()
    printer.ts           ← printPDF() via CUPS lp command
    shippo.ts            ← fetchOrders(), fetchTransactions(), fetchPickupDetails(), schedulePickup()
    state-store.ts        ← fetch watermarks, print markers, sweepState()
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

The Pi's system timezone must be UTC to avoid DST-related cron skips or double-fires. This is set durably during provisioning (see below); verify with:

```bash
timedatectl  # Time zone must show Etc/UTC
```

If a Pi is ever found on another timezone, correct it immediately with `sudo timedatectl set-timezone UTC` and fix the provisioning config so it cannot recur.

The cron schedule must match `CRON_TIME_WINDOW_MINUTES`. The script floors each run to the nearest window boundary anchored to UTC midnight, so the window is deterministic regardless of when within the interval the script starts. `CRON_TIME_WINDOW_MINUTES` must evenly divide 1440 (minutes in a day) — the script exits with an error otherwise.

The command must `cd` to the home directory first so that `dotenv` finds `~/.env`. A `PATH` line is required because cron's default PATH (`/usr/bin:/bin`) does not include `/usr/local/bin` where the `node` symlink lives.

Example for a 5-minute window (`CRON_TIME_WINDOW_MINUTES=5`, the current production setting):

```
PATH=/usr/local/bin:/usr/bin:/bin
*/5 * * * * cd "$HOME" && node "$HOME/bundle/index.js" >> "$HOME/cron.log" 2>&1
```

To install or edit: `crontab -e`. Output is appended to `~/cron.log`.

#### Log rotation

Nothing rotates `~/cron.log` by default — the system logrotate config only covers `/var/log`. Growth is slow (roughly 600 bytes per quiet run), but the file grows unbounded, so provisioning installs a logrotate drop-in keeping a rolling year of small compressed monthly archives:

```bash
sudo tee /etc/logrotate.d/shippo-cron > /dev/null <<'EOF'
/home/bje/cron.log {
  monthly
  rotate 12
  compress
  missingok
  notifempty
  copytruncate
}
EOF
```

`copytruncate` is required: each cron run appends directly to the file and cannot be signaled to reopen a renamed log, so logrotate must copy then truncate in place.

To update the bundle after a new release, run `update-shippo` (alias configured during provisioning — see below).

No git, yarn, or npm required on the Pi — only `node`, `curl`, and `unzip` (for initial provisioning).

### Pi Provisioning (one-time setup)

#### Timezone: UTC via cloud-init

Raspberry Pi OS provisions headless setup with cloud-init. Set the timezone declaratively in `/boot/firmware/user-data` so it defaults to UTC on first boot and is restored whenever cloud-init re-runs (e.g. after bumping the `instance-id` in `/boot/firmware/meta-data` to regenerate network config, as in the 2026-06-09 recovery):

```yaml
# /boot/firmware/user-data (cloud-init)
timezone: Etc/UTC
```

When imaging with Raspberry Pi Imager, do NOT let its OS customization set a local timezone — it writes the imaging machine's timezone into this same file. Verify after first boot with `timedatectl`.

#### Bundle assets

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
`SLACK_WEBHOOK_URL` (per-print and per-error notifications — never sent for a
fetch failure specifically, see [Resilience to outages](#resilience-to-outages)),
`HEALTHCHECK_PING_URL` (dead-man's-switch pinged on successful runs; set the
monitor's period to match `CRON_TIME_WINDOW_MINUTES` plus a few minutes of
grace so a missed ping alerts when the Pi is offline or hung without
false-alarming on a single transient blip), `ORDERS_LOOKBACK_MINUTES` (normal
baseline lookback for the orders fetch, default 24 hours — see [Two different
lookback windows](#two-different-lookback-windows)), `MAX_LOOKBACK_MINUTES`
(cap on how far a widened fetch window can reach back, default 7 days), and
`STATE_DIR` (persistent state directory, default `~/.shippo-state`).

## Printer

- **Hardware**: Knaon thermal printer (USB)
- **Format**: 4x6 inch labels
- **Interface**: CUPS (`lp -d <printer-name>`)
- **Color**: Black and white only (thermal printer hardware limitation; no software conversion)
