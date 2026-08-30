# src/services

I/O-bound modules used by `src/index.ts`. All modules here interact with external systems (Shippo API, CUPS, filesystem) and are covered by integration tests rather than unit tests.

## Modules

- `pdf-generator.ts` — `generatePackingSlip(order, outputPath)` — writes a PDFKit packing slip to a temp path
- `printer.ts` — `printPDF(filePath)` — submits a PDF to CUPS via `lp`; requires `CUPS_PRINTER_NAME` env var
- `shippo.ts` — `fetchOrders()`, `fetchTransactions()`, `fetchPickupDetails()`, `fetchRecipientName()`, `schedulePickup()` — Shippo API calls; requires `SHIPPO_API_TOKEN` env var. See JSDoc in `shippo.ts` for function-level details.
- `slack.ts` — `sendSlackNotification(text)` — posts to the Slack incoming webhook in `SLACK_WEBHOOK_URL`; silent no-op when unset, never throws

## Printer notes

- `lp` must be installed on the system (`apt install cups` on the Pi)
- `lp` submits to the CUPS queue and returns before the document physically prints
- `CUPS_PRINTER_NAME` is validated at startup in `src/index.ts` (exit 2) and again inside `printPDF`
- Run `lpstat -p` to list available printer names; `lpstat -o` to see queued jobs
- To tune print flags for the Knaon 4x6 format, add args to the `lp` array in `printer.ts`

## Adding new modules

Any new file here should interact with external systems. Pure logic extracted from a service belongs in `src/lib/` instead.
