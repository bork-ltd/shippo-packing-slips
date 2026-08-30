# src/lib

Pure, deterministic functions with no I/O or side effects. All files in this directory are subject to 100% test coverage enforcement via `vitest.config.ts`.

## Modules

- `filter-transaction.ts` — `filterTransaction(tx, startDate, endDate)` — returns `'match' | 'skip' | 'stop'` for a transaction against a date window
- `slack-message.ts` — pure formatters for Slack notification text (printed slip/label, errors) plus mrkdwn escaping and Shippo order URL derivation
- `time-window.ts` — `calculateTimeWindow(now, timeWindowMinutes)` — computes the aligned UTC lookback window
- `validate-pickup-config.ts` — `validatePickupConfig(rawLocationType, instructions)` — validates pickup scheduling env vars

## Adding new modules

Any new file added here must be pure (no network, no filesystem, no process.env reads, no side effects) and must have a co-located `.test.ts` file with 100% coverage. I/O-bound code belongs in `src/services/` instead.
