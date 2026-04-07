import { access, constants, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { OrderStatusEnum } from 'shippo/models/components';
import { calculateTimeWindow } from './lib/time-window';
import { validatePickupConfig } from './lib/validate-pickup-config';
import { generatePackingSlip } from './services/pdf-generator';
import { printPDF } from './services/printer';
import {
  fetchOrders,
  fetchPickupDetails,
  fetchTransactions,
  schedulePickup,
} from './services/shippo';

// Load environment variables (.env.local overrides .env)
dotenv.config();
dotenv.config({ override: true, path: '.env.local' });

async function runPackingSlipsJob(
  startDate: Date,
  endDate: Date,
): Promise<{ success: number; errors: number; skipped: number }> {
  console.log('Fetching orders and generating packing slips...');

  const statusFilter =
    process.env.INCLUDE_ALL_ORDER_STATUSES === 'true'
      ? undefined
      : [OrderStatusEnum.Paid];

  try {
    const orders = await fetchOrders(startDate, endDate, statusFilter);

    if (orders.length === 0) {
      console.log('No orders found in the specified date range.\n');
      return { success: 0, errors: 0, skipped: 0 };
    }

    console.log(`✓ Found ${orders.length} order(s)\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      const orderNumber = order.orderNumber || order.objectId || 'unknown';
      const sanitizedOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_');

      // Extract and format the order date as YYYY-MM-DD
      let datePrefix = 'unknown-date';
      if (order.placedAt) {
        const orderDate = new Date(order.placedAt);
        const year = orderDate.getFullYear();
        const month = String(orderDate.getMonth() + 1).padStart(2, '0');
        const day = String(orderDate.getDate()).padStart(2, '0');
        datePrefix = `${year}-${month}-${day}`;
      }

      const outputPath = path.join(
        '/tmp',
        `packing-slip-${datePrefix}-${sanitizedOrderNumber}.pdf`,
      );

      try {
        try {
          await access(outputPath, constants.F_OK);
          // File exists — was submitted to the print queue in a previous run
          console.log(
            `↩ Skipped (already printed): ${path.basename(outputPath)}`,
          );
          console.log(`  Order: ${orderNumber}`);
          console.log('');
          try {
            await unlink(outputPath);
          } catch (cleanupError) {
            const code =
              (cleanupError as NodeJS.ErrnoException).code ?? 'unknown';
            const msg =
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError);
            console.warn(
              `  Warning: failed to delete sentinel file ${outputPath} [${code}]: ${msg}`,
            );
          }
          // skippedCount counts items identified as already submitted to the
          // print queue, regardless of whether sentinel cleanup succeeded.
          skippedCount++;
          continue;
        } catch (accessError) {
          if ((accessError as NodeJS.ErrnoException).code !== 'ENOENT') {
            const code =
              (accessError as NodeJS.ErrnoException).code ?? 'unknown';
            throw new Error(
              `Sentinel check failed for ${path.basename(outputPath)} [${code}]: ${accessError instanceof Error ? accessError.message : String(accessError)}`,
            );
          }
          // ENOENT — file does not exist; proceed to generate and print
        }

        await generatePackingSlip(order, outputPath);
        console.log(`✓ Generated: ${path.basename(outputPath)}`);
        console.log(`  Order: ${orderNumber}`);
        console.log(`  Status: ${order.orderStatus || 'UNKNOWN'}`);
        console.log(`  Items: ${order.lineItems?.length || 0}`);
        console.log(`  Ship to: ${order.toAddress?.name || 'N/A'}`);

        await printPDF(outputPath);
        console.log(`  Printed: ${path.basename(outputPath)}`);
        // Leave file on disk as deduplication sentinel for the lookback window
        console.log('');
        successCount++;
      } catch (error) {
        // A partial or empty file may have been written to outputPath before
        // the error was thrown. It will be cleaned up by the OS eventually
        // since it is in /tmp.
        console.error(`✗ Failed to process order ${orderNumber}`);
        if (error instanceof Error) {
          console.error(`  Error: ${error.message}`);
        } else {
          console.error(`  Error:`, error);
        }
        console.log('');
        errorCount++;
      }
    }

    return { success: successCount, errors: errorCount, skipped: skippedCount };
  } catch (error) {
    console.error('✗ Failed to fetch or process orders\n');
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    return { success: 0, errors: 1, skipped: 0 };
  }
}

async function runLabelsJob(
  startDate: Date,
  endDate: Date,
): Promise<{
  success: number;
  errors: number;
  skipped: number;
  printedTransactionIds: string[];
}> {
  console.log('Fetching transactions and downloading labels...');

  try {
    const transactions = await fetchTransactions(startDate, endDate);

    if (transactions.length === 0) {
      console.log('No labels found in the specified date range.\n');
      return { success: 0, errors: 0, skipped: 0, printedTransactionIds: [] };
    }

    console.log(`✓ Found ${transactions.length} label(s)\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const printedTransactionIds: string[] = [];

    for (const tx of transactions) {
      const objectId = (tx.objectId || 'unknown').replace(
        /[^a-zA-Z0-9-_]/g,
        '_',
      );
      const labelUrl = tx.labelUrl as string;

      // Extract and format the transaction date as YYYY-MM-DD
      let datePrefix = 'unknown-date';
      if (tx.objectCreated) {
        const txDate = tx.objectCreated;
        const year = txDate.getFullYear();
        const month = String(txDate.getMonth() + 1).padStart(2, '0');
        const day = String(txDate.getDate()).padStart(2, '0');
        datePrefix = `${year}-${month}-${day}`;
      }

      const outputPath = path.join(
        '/tmp',
        `label-${datePrefix}-${objectId}.pdf`,
      );

      try {
        try {
          await access(outputPath, constants.F_OK);
          // File exists — was submitted to the print queue in a previous run
          console.log(
            `↩ Skipped (already printed): ${path.basename(outputPath)}`,
          );
          console.log(`  Tracking: ${tx.trackingNumber || 'N/A'}`);
          console.log('');
          try {
            await unlink(outputPath);
          } catch (cleanupError) {
            const code =
              (cleanupError as NodeJS.ErrnoException).code ?? 'unknown';
            const msg =
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError);
            console.warn(
              `  Warning: failed to delete sentinel file ${outputPath} [${code}]: ${msg}`,
            );
          }
          // skippedCount counts items identified as already submitted to the
          // print queue, regardless of whether sentinel cleanup succeeded.
          skippedCount++;
          continue;
        } catch (accessError) {
          if ((accessError as NodeJS.ErrnoException).code !== 'ENOENT') {
            const code =
              (accessError as NodeJS.ErrnoException).code ?? 'unknown';
            throw new Error(
              `Sentinel check failed for ${path.basename(outputPath)} [${code}]: ${accessError instanceof Error ? accessError.message : String(accessError)}`,
            );
          }
          // ENOENT — file does not exist; proceed to download and print
        }

        const res = await fetch(labelUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        await writeFile(outputPath, Buffer.from(await res.arrayBuffer()));
        console.log(`✓ Downloaded: ${path.basename(outputPath)}`);
        console.log(`  Tracking: ${tx.trackingNumber || 'N/A'}`);

        await printPDF(outputPath);
        console.log(`  Printed: ${path.basename(outputPath)}`);
        // Leave file on disk as deduplication sentinel for the lookback window
        console.log('');
        successCount++;
        if (tx.objectId) {
          printedTransactionIds.push(tx.objectId);
        }
      } catch (error) {
        // A partial or empty file may have been written to outputPath before
        // the error was thrown. It will be cleaned up by the OS eventually
        // since it is in /tmp.
        console.error(`✗ Failed to process label for transaction ${objectId}`);
        if (error instanceof Error) {
          console.error(`  Error: ${error.message}`);
        } else {
          console.error(`  Error:`, error);
        }
        console.log('');
        errorCount++;
      }
    }

    return {
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
      printedTransactionIds,
    };
  } catch (error) {
    console.error('✗ Failed to fetch or process labels\n');
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    return { success: 0, errors: 1, skipped: 0, printedTransactionIds: [] };
  }
}

async function runPickupJob(transactionIds: string[]): Promise<{
  scheduled: boolean;
  confirmationCode?: string;
  confirmedStartTime?: string;
  confirmedEndTime?: string;
  error?: string;
}> {
  if (transactionIds.length === 0) {
    return { scheduled: false };
  }

  const configResult = validatePickupConfig(
    process.env.PICKUP_BUILDING_LOCATION_TYPE,
    process.env.PICKUP_INSTRUCTIONS,
  );
  if (!configResult.valid) {
    console.error(`✗ ${configResult.error}`);
    return { scheduled: false, error: configResult.error };
  }
  const { buildingLocationType } = configResult;

  try {
    // All transactions in a run share the same carrier account and from_address.
    // Resolve both from the first transaction; all IDs are passed to the single pickup request.
    const { carrierAccount, address } = await fetchPickupDetails(
      transactionIds[0],
    );

    // Window: tomorrow 08:00 UTC through D+4 18:00 UTC.
    // Covers the next guaranteed business day even across a 3-day weekend with a holiday.
    const now = new Date();
    const startTime = new Date(now);
    startTime.setUTCDate(startTime.getUTCDate() + 1);
    startTime.setUTCHours(8, 0, 0, 0);
    const endTime = new Date(now);
    endTime.setUTCDate(endTime.getUTCDate() + 4);
    endTime.setUTCHours(18, 0, 0, 0);

    const pickup = await schedulePickup({
      carrierAccount,
      transactions: transactionIds,
      requestedStartTime: startTime,
      requestedEndTime: endTime,
      location: {
        buildingLocationType,
        instructions: process.env.PICKUP_INSTRUCTIONS,
        address,
      },
    });

    return {
      scheduled: true,
      confirmationCode: pickup.confirmationCode,
      confirmedStartTime: pickup.confirmedStartTime,
      confirmedEndTime: pickup.confirmedEndTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Pickup scheduling failed: ${message}`);
    return { scheduled: false, error: message };
  }
}

async function run() {
  // Verify API token is configured
  const apiToken = process.env.SHIPPO_API_TOKEN;
  if (!apiToken) {
    console.error('Error: SHIPPO_API_TOKEN not found in environment');
    console.error('Please add your production API token');
    process.exit(2);
  }

  if (!process.env.COMPANY_NAME) {
    console.error('Error: COMPANY_NAME not found in environment');
    process.exit(2);
  }

  if (!process.env.CUPS_PRINTER_NAME) {
    console.error('Error: CUPS_PRINTER_NAME not found in environment');
    process.exit(2);
  }

  // Calculate a date window aligned to the nearest interval boundary.
  // CRON_TIME_WINDOW_MINUTES must evenly divide 1440 (minutes in a day) so that
  // boundaries are fixed points in time anchored to UTC midnight, making the window
  // deterministic regardless of when within the interval the script actually starts.
  const timeWindowMinutes = parseInt(
    process.env.CRON_TIME_WINDOW_MINUTES ?? '60',
    10,
  );
  let startDate: Date;
  let endDate: Date;
  try {
    ({ startDate, endDate } = calculateTimeWindow(
      new Date(),
      timeWindowMinutes,
    ));
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  console.log('Date range (2x lookback window):');
  console.log('  Start:', startDate.toISOString());
  console.log('  End:  ', endDate.toISOString());
  console.log('');

  const slipResults = await runPackingSlipsJob(startDate, endDate);
  const labelResults = await runLabelsJob(startDate, endDate);
  const pickupResult = await runPickupJob(labelResults.printedTransactionIds);

  const combinedErrors = slipResults.errors + labelResults.errors;

  let pickupSummary: string;
  if (labelResults.printedTransactionIds.length === 0) {
    pickupSummary = 'not scheduled (no new labels this run)';
  } else if (pickupResult.scheduled) {
    const confirmation = pickupResult.confirmationCode
      ? ` (confirmation: ${pickupResult.confirmationCode})`
      : '';
    const window =
      pickupResult.confirmedStartTime && pickupResult.confirmedEndTime
        ? ` — ${pickupResult.confirmedStartTime} to ${pickupResult.confirmedEndTime}`
        : '';
    pickupSummary = `scheduled${confirmation}${window}`;
  } else {
    pickupSummary = `FAILED — ${pickupResult.error}`;
  }

  console.log('='.repeat(50));
  console.log('Summary:');
  console.log(
    `  Packing slips: ${slipResults.success} printed, ${slipResults.skipped} skipped (lookback), ${slipResults.errors} errors`,
  );
  console.log(
    `  Labels:        ${labelResults.success} downloaded, ${labelResults.skipped} skipped (lookback), ${labelResults.errors} errors`,
  );
  console.log(`  Pickup:        ${pickupSummary}`);
  console.log('='.repeat(50));

  process.exit(combinedErrors > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
