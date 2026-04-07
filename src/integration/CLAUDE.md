# src/integration

Integration tests that call the real Shippo test-mode API. These are distinct from unit tests in `src/lib/` and `src/services/` — they verify the live API contract, not internal logic.

## Running

```bash
SHIPPO_API_TOKEN=shippo_test_... yarn test:integration
```

Requires a Shippo **test-mode** token (starts with `shippo_test_`). The production `SHIPPO_API_TOKEN` must **not** be used here.

## Test Lifecycle

Each test run creates a fresh Shippo transaction in `beforeAll` and voids it via a refund in `afterAll`. This ensures tests are self-contained and do not depend on pre-existing state in the test account.

See `helpers.ts` for `setupTestTransaction` / `teardownTestTransaction`. These helpers are designed to be reused across future integration test files.

## Key Files

- `helpers.ts` — shared setup/teardown; creates a test shipment → rate → transaction, voids on cleanup
- `shippo-api.test.ts` — tests for `fetchOrders`, `fetchTransactions`, `fetchPickupDetails`

## Adding New Tests

- Import `setupTestTransaction` / `teardownTestTransaction` from `./helpers`
- Use a `beforeAll` with a 30s timeout to accommodate sequential Shippo API calls
- Assert exact values against the known test fixture address (`Test Sender`, `123 Main St`, etc.) rather than just type checks
