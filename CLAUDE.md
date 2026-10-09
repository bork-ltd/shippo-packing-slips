# shippo-packing-slips

See `README.md` for the repository overview and `docs/ARCHITECTURE.md` for the integration strategy. Area-specific guidance lives in subdirectory `CLAUDE.md` files; keep this root file minimal.

## Shippo API specification

Always read the local spec, `reference/shippo-api.yaml`, instead of fetching
https://docs.goshippo.com/spec/shippoapi/public-api.yaml. The spec is 904KB and truncates when fetched with web tools.

`GET /orders` (`reference/shippo-api.yaml:9102`) is the key endpoint: query params `start_date`, `end_date`, `order_status[]`, `shop_app`, `page`; dates are ISO 8601 UTC (e.g. `2026-02-02T14:00:00`).
