# shippo-packing-slips

[![Biome](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/biome.yml/badge.svg)](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/biome.yml)
[![Typecheck](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/typecheck.yml/badge.svg)](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/typecheck.yml)
[![Unit Tests](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/unit-tests.yml)
[![Integration Tests](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/brianespinosa/shippo-packing-slips/actions/workflows/integration-tests.yml)

Raspberry Pi scripts to print packing slips, shipping labels, and schedule USPS pickups at regular intervals using the Shippo API

## Requirements

- Node.js 24
- A Shippo account with a production API token
- CUPS with the Knaon printer configured

## Local Development

```bash
yarn install
cp .env.example .env.local  # add your SHIPPO_API_TOKEN
yarn generate               # fetch orders and generate PDFs
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHIPPO_API_TOKEN` | Yes | | Shippo production API token |
| `CUPS_PRINTER_NAME` | Yes | | CUPS destination name for the printer (e.g. `Knaon`) |
| `COMPANY_NAME` | Yes | | Company name rendered in bold on packing slip header |
| `CRON_TIME_WINDOW_MINUTES` | No | `60` | Minutes to look back on each cron run |
| `COMPANY_ADDRESS_LINE_1` | No | | First address line |
| `COMPANY_ADDRESS_LINE_2` | No | | Second address line |
| `COMPANY_ADDRESS_LINE_3` | No | | Third address line |
| `COMPANY_LOGO_PATH` | No | | Absolute path to logo image |
| `PICKUP_BUILDING_LOCATION_TYPE` | No | `Front Door` | Where parcels will be available for pickup (see `.env.example` for valid values) |
| `PICKUP_INSTRUCTIONS` | No | | Courier instructions; required when `PICKUP_BUILDING_LOCATION_TYPE` is `Other` |
| `INCLUDE_ALL_ORDER_STATUSES` | No | `false` | Set to `true` to fetch all order statuses instead of only `PAID` |
| `SLACK_WEBHOOK_URL` | No | | Slack incoming webhook URL; when set, posts a message for each printed packing slip, printed label, and error |
| `HEALTHCHECK_PING_URL` | No | | Dead-man's-switch ping URL (e.g. healthchecks.io); pinged only after a successful run |

Values in `.env.local` override `.env`.

### Scripts

| Command | Description |
|---|---|
| `yarn build` | Compile TypeScript |
| `yarn generate` | Build and run the main script |

## Deployment

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full deployment model, provisioning instructions, and cron setup.
