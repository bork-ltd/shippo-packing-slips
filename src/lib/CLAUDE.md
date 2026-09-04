# src/lib

Pure, deterministic functions with no I/O or side effects. All files in this directory are subject to 100% test coverage enforcement via `vitest.config.ts`.

## Modules

- `filter-order.ts` — `isTerminalOrderStatus(status)` — true for SHIPPED/PARTIALLY_FULFILLED/CANCELLED/REFUNDED (never print a slip for these, even with INCLUDE_ALL_ORDER_STATUSES); `isPrintableOrder(status, shopApp)` — true for PAID, or UNKNOWN when shopApp is 'Shippo' (an order created directly via the API/dashboard, which never receives a shop integration's payment webhook)
- `filter-transaction.ts` — `filterTransaction(tx, startDate, endDate)` — returns `'match' | 'skip' | 'stop'` for a transaction against a date window and carrier tracking status (skips TRANSIT/DELIVERED/RETURNED/FAILURE)
- `sentinel-key.ts` — `buildSentinelKey(kind, date, rawId)` — shared dedup key for the /tmp PDF filename and its print marker
- `slack-message.ts` — pure formatters for Slack notification text (printed slip/label, errors) plus mrkdwn escaping and Shippo order URL derivation
- `time-window.ts` — `calculateTimeWindow(now, timeWindowMinutes)` computes the aligned UTC lookback window; `calculateFetchWindow(now, timeWindowMinutes, lastFetch, maxLookbackMinutes)` widens it to cover a gap since the last successful fetch, capped
- `validate-pickup-config.ts` — `validatePickupConfig(rawLocationType, instructions)` — validates pickup scheduling env vars

## Adding new modules

Any new file added here must be pure (no network, no filesystem, no process.env reads, no side effects) and must have a co-located `.test.ts` file with 100% coverage. I/O-bound code belongs in `src/services/` instead.
