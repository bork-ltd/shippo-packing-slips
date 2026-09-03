import { access, constants, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { OrderStatusEnum } from 'shippo/models/components';
import {
  isDuplicatePickupError,
  pickupSentinelPath,
} from './lib/duplicate-pickup';
import { isTerminalOrderStatus } from './lib/filter-order';
import { buildSentinelKey } from './lib/sentinel-key';
import {
  formatErrorMessage,
  formatLabelPrintedMessage,
  formatPackingSlipPrintedMessage,
  formatRunLogContext,
} from './lib/slack-message';
import { calculateFetchWindow, type TimeWindow } from './lib/time-window';
import { validatePickupConfig } from './lib/validate-pickup-config';
import { sendHeartbeat } from './services/healthcheck';
import { generatePackingSlip } from './services/pdf-generator';
import { printPDF } from './services/printer';
import {
  fetchOrderForTransaction,
  fetchOrders,
  fetchPickupDetails,
  fetchRecipientName,
  fetchTransactions,
  schedulePickup,
  type TransactionOrderInfo,
} from './services/shippo';
import { sendSlackNotification } from './services/slack';
import {
  getStateDir,
  hasPrintMarker,
  readLastFetch,
  sweepState,
  writeLastFetch,
  writePrintMarker,
} from './services/state-store';

// Load environment variables (.env.local overrides .env)
dotenv.config();
dotenv.config({ override: true, path: '.env.local' });

/**
 * An error notification queued during a job. Sent only after the run's
 * Summary block is known, so `formatErrorMessage` can attach the same
 * "Date range" and "Summary" context that lands in cron.log.
 */
type QueuedError = { context: string; detail: string; timestamp: string };

async function runPackingSlipsJob(
  stateDir: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  success: number;
  errors: number;
  skipped: number;
  errorNotifications: QueuedError[];
}> {
  console.log('Fetching orders and generating packing slips...');
  const errorNotifications: QueuedError[] = [];

  const statusFilter =
    process.env.INCLUDE_ALL_ORDER_STATUSES === 'true'
      ? undefined
      : [OrderStatusEnum.Paid];

  // Fetch failures are isolated from the processing loop below: no Slack
  // alert (would fire on every cron tick of an outage — the heartbeat
  // monitor is the source of truth for "something is down"), and the fetch
  // watermark is left unchanged so the next run's window widens to cover
  // the gap (see calculateFetchWindow, src/lib/time-window.ts).
  let fetchedOrders: Awaited<ReturnType<typeof fetchOrders>>;
  try {
    fetchedOrders = await fetchOrders(startDate, endDate, statusFilter);
  } catch (error) {
    console.error('✗ Failed to fetch orders from Shippo (will retry next run)');
    console.error(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log('');
    return { success: 0, errors: 1, skipped: 0, errorNotifications: [] };
  }
  await writeLastFetch(stateDir, 'orders', endDate);

  // Regardless of INCLUDE_ALL_ORDER_STATUSES, never print a slip for an
  // order that has already shipped, been cancelled, or been refunded —
  // otherwise a widened catch-up window would reprint completed work.
  const orders = fetchedOrders.filter(
    (order) => !isTerminalOrderStatus(order.orderStatus),
  );

  if (orders.length === 0) {
    console.log('No orders found in the specified date range.\n');
    return { success: 0, errors: 0, skipped: 0, errorNotifications };
  }

  console.log(`✓ Found ${orders.length} order(s)\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  try {
    for (const order of orders) {
      const orderNumber = order.orderNumber || order.objectId || 'unknown';
      const key = buildSentinelKey(
        'packing-slip',
        order.placedAt ? new Date(order.placedAt) : undefined,
        orderNumber,
      );
      const outputPath = path.join('/tmp', `${key}.pdf`);

      try {
        if (await hasPrintMarker(stateDir, key)) {
          console.log(`↩ Skipped (already printed): ${key}`);
          console.log(`  Order: ${orderNumber}`);
          console.log('');
          skippedCount++;
          continue;
        }

        await generatePackingSlip(order, outputPath);
        console.log(`✓ Generated: ${path.basename(outputPath)}`);
        console.log(`  Order: ${orderNumber}`);
        console.log(`  Status: ${order.orderStatus || 'UNKNOWN'}`);
        console.log(`  Items: ${order.lineItems?.length || 0}`);
        console.log(`  Ship to: ${order.toAddress?.name || 'N/A'}`);

        await printPDF(outputPath);
        console.log(`  Printed: ${path.basename(outputPath)}`);
        await writePrintMarker(stateDir, key);
        // Best-effort: the durable marker above is now the source of truth
        // for dedup, so a failed cleanup here only costs disk space.
        await unlink(outputPath).catch(() => {});
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
        errorNotifications.push({
          context: `Failed to process order ${orderNumber}`,
          detail: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      // Outside the try so a notification-path bug cannot fall into the
      // catch above and misreport a printed order as a failure.
      await sendSlackNotification(
        formatPackingSlipPrintedMessage({
          orderNumber,
          orderObjectId: order.objectId,
          recipientName: order.toAddress?.name ?? undefined,
          totalItems: (order.lineItems ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0,
          ),
        }),
      );
    }

    return {
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
      errorNotifications,
    };
  } catch (error) {
    console.error('✗ Failed to process orders\n');
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    errorNotifications.push({
      context: 'Packing slips job failed',
      detail: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return {
      success: successCount,
      errors: errorCount + 1,
      skipped: skippedCount,
      errorNotifications,
    };
  }
}

async function runLabelsJob(
  stateDir: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  success: number;
  errors: number;
  skipped: number;
  printedTransactionIds: string[];
  errorNotifications: QueuedError[];
}> {
  console.log('Fetching transactions and downloading labels...');
  const errorNotifications: QueuedError[] = [];

  // See runPackingSlipsJob for why fetch failures are isolated: no Slack
  // alert, watermark left unchanged so the next run's window widens.
  let transactions: Awaited<ReturnType<typeof fetchTransactions>>;
  try {
    transactions = await fetchTransactions(startDate, endDate);
  } catch (error) {
    console.error(
      '✗ Failed to fetch transactions from Shippo (will retry next run)',
    );
    console.error(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log('');
    return {
      success: 0,
      errors: 1,
      skipped: 0,
      printedTransactionIds: [],
      errorNotifications: [],
    };
  }
  await writeLastFetch(stateDir, 'labels', endDate);

  if (transactions.length === 0) {
    console.log('No labels found in the specified date range.\n');
    return {
      success: 0,
      errors: 0,
      skipped: 0,
      printedTransactionIds: [],
      errorNotifications,
    };
  }

  console.log(`✓ Found ${transactions.length} label(s)\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const printedTransactionIds: string[] = [];

  try {
    for (const tx of transactions) {
      const objectId = tx.objectId || 'unknown';
      const labelUrl = tx.labelUrl as string;
      const key = buildSentinelKey('label', tx.objectCreated, objectId);
      const outputPath = path.join('/tmp', `${key}.pdf`);

      try {
        if (await hasPrintMarker(stateDir, key)) {
          console.log(`↩ Skipped (already printed): ${key}`);
          console.log(`  Tracking: ${tx.trackingNumber || 'N/A'}`);
          console.log('');
          skippedCount++;
          continue;
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
        await writePrintMarker(stateDir, key);
        // Best-effort: the durable marker above is now the source of truth
        // for dedup, so a failed cleanup here only costs disk space.
        await unlink(outputPath).catch(() => {});
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
        errorNotifications.push({
          context: `Failed to process label for transaction ${objectId}`,
          detail: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      // Outside the try so a notification-path bug cannot fall into the
      // catch above and misreport a printed label as a failure. The
      // order/recipient lookups are best-effort; their failures are warned
      // and must not count against the label run.
      let orderInfo: TransactionOrderInfo | undefined;
      if (tx.objectId) {
        try {
          orderInfo = await fetchOrderForTransaction(tx.objectId);
        } catch (lookupError) {
          console.warn(
            `  Warning: ${lookupError instanceof Error ? lookupError.message : String(lookupError)}`,
          );
        }
        if (!orderInfo?.recipientName) {
          try {
            const recipientName = await fetchRecipientName(tx.objectId);
            orderInfo = { ...orderInfo, recipientName };
          } catch (lookupError) {
            console.warn(
              `  Warning: ${lookupError instanceof Error ? lookupError.message : String(lookupError)}`,
            );
          }
        }
      }
      await sendSlackNotification(
        formatLabelPrintedMessage({
          orderNumber: orderInfo?.orderNumber,
          orderObjectId: orderInfo?.orderObjectId,
          recipientName: orderInfo?.recipientName,
          trackingNumber: tx.trackingNumber,
        }),
      );
    }

    return {
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
      printedTransactionIds,
      errorNotifications,
    };
  } catch (error) {
    console.error('✗ Failed to process labels\n');
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    errorNotifications.push({
      context: 'Labels job failed',
      detail: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return {
      success: successCount,
      errors: errorCount + 1,
      skipped: skippedCount,
      printedTransactionIds,
      errorNotifications,
    };
  }
}

async function runPickupJob(
  stateDir: string,
  transactionIds: string[],
): Promise<{
  scheduled: boolean;
  alreadyScheduled?: boolean;
  confirmationCode?: string;
  confirmedStartTime?: string;
  confirmedEndTime?: string;
  error?: string;
}> {
  if (transactionIds.length === 0) {
    return { scheduled: false };
  }

  // One pickup request per UTC day: USPS rejects further requests and collects
  // additional packages with the existing pickup. The sentinel avoids the
  // redundant API attempt; it lives in the persistent state directory so a
  // reboot cannot cause a redundant attempt (answered by the duplicate-pickup
  // response below in the rare case it still happens).
  const sentinelPath = pickupSentinelPath(new Date(), stateDir);
  try {
    await access(sentinelPath, constants.F_OK);
    console.log(
      '↩ Pickup already requested today; packages will be collected with the existing pickup.',
    );
    return { scheduled: false, alreadyScheduled: true };
  } catch {
    // No sentinel — proceed to schedule
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

    await writePickupSentinel(sentinelPath);
    return {
      scheduled: true,
      confirmationCode: pickup.confirmationCode,
      confirmedStartTime: pickup.confirmedStartTime,
      confirmedEndTime: pickup.confirmedEndTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (isDuplicatePickupError(message)) {
      console.log(
        '↩ USPS reports a pickup was already requested today; packages will be collected with the existing pickup.',
      );
      await writePickupSentinel(sentinelPath);
      return { scheduled: false, alreadyScheduled: true };
    }
    console.error(`✗ Pickup scheduling failed: ${message}`);
    return { scheduled: false, error: message };
  }
}

/** Best-effort write of the daily pickup sentinel; failure only costs a redundant API attempt later today. */
async function writePickupSentinel(sentinelPath: string): Promise<void> {
  try {
    await writeFile(sentinelPath, '');
  } catch (error) {
    console.warn(
      `  Warning: failed to write pickup sentinel ${sentinelPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
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

  const stateDir = getStateDir();

  // Calculate a date window aligned to the nearest interval boundary, widened
  // to cover any gap since each job's last successful fetch (capped at
  // MAX_LOOKBACK_MINUTES). CRON_TIME_WINDOW_MINUTES must evenly divide 1440
  // (minutes in a day) so that boundaries are fixed points in time anchored
  // to UTC midnight, making the baseline window deterministic regardless of
  // when within the interval the script actually starts.
  const timeWindowMinutes = parseInt(
    process.env.CRON_TIME_WINDOW_MINUTES ?? '60',
    10,
  );
  const maxLookbackMinutes = parseInt(
    process.env.MAX_LOOKBACK_MINUTES ?? '10080', // 7 days
    10,
  );
  const now = new Date();
  let ordersWindow: TimeWindow;
  let labelsWindow: TimeWindow;
  try {
    const [ordersLastFetch, labelsLastFetch] = await Promise.all([
      readLastFetch(stateDir, 'orders'),
      readLastFetch(stateDir, 'labels'),
    ]);
    ordersWindow = calculateFetchWindow(
      now,
      timeWindowMinutes,
      ordersLastFetch,
      maxLookbackMinutes,
    );
    labelsWindow = calculateFetchWindow(
      now,
      timeWindowMinutes,
      labelsLastFetch,
      maxLookbackMinutes,
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  console.log('Date range:');
  console.log(
    `  Packing slips: ${ordersWindow.startDate.toISOString()} to ${ordersWindow.endDate.toISOString()}`,
  );
  console.log(
    `  Labels:        ${labelsWindow.startDate.toISOString()} to ${labelsWindow.endDate.toISOString()}`,
  );
  console.log('');

  const slipResults = await runPackingSlipsJob(
    stateDir,
    ordersWindow.startDate,
    ordersWindow.endDate,
  );
  const labelResults = await runLabelsJob(
    stateDir,
    labelsWindow.startDate,
    labelsWindow.endDate,
  );
  const pickupResult = await runPickupJob(
    stateDir,
    labelResults.printedTransactionIds,
  );
  await sweepState(stateDir, now, maxLookbackMinutes * 60 * 1000);

  const combinedErrors = slipResults.errors + labelResults.errors;

  // Error notifications queued by the jobs above are sent once the Summary
  // block below is known, so each one can carry the same "Date range" and
  // "Summary" context that lands in cron.log.
  const pendingErrorNotifications: QueuedError[] = [
    ...slipResults.errorNotifications,
    ...labelResults.errorNotifications,
  ];

  let pickupSummary: string;
  if (labelResults.printedTransactionIds.length === 0) {
    pickupSummary = 'not scheduled (no new labels this run)';
  } else if (pickupResult.alreadyScheduled) {
    pickupSummary =
      'already requested today — packages will be collected with the existing pickup';
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
    pendingErrorNotifications.push({
      context: 'Pickup scheduling failed',
      detail: pickupResult.error ?? 'Unknown error',
      timestamp: new Date().toISOString(),
    });
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

  const logContext = formatRunLogContext({
    ordersWindow,
    labelsWindow,
    packingSlips: {
      success: slipResults.success,
      skipped: slipResults.skipped,
      errors: slipResults.errors,
    },
    labels: {
      success: labelResults.success,
      skipped: labelResults.skipped,
      errors: labelResults.errors,
    },
    pickupSummary,
  });
  for (const notification of pendingErrorNotifications) {
    await sendSlackNotification(
      formatErrorMessage(notification.context, notification.detail, {
        timestamp: notification.timestamp,
        logContext,
      }),
    );
  }

  // A pickup that should have been scheduled but wasn't is a run failure,
  // matching the Slack FAILED notification above. A pickup already requested
  // earlier today is not a failure — USPS collects additional packages with
  // the existing pickup.
  const pickupFailed =
    labelResults.printedTransactionIds.length > 0 &&
    !pickupResult.scheduled &&
    !pickupResult.alreadyScheduled;
  const runFailed = combinedErrors > 0 || pickupFailed;

  // Heartbeat only on a clean run — a failing run must NOT ping, so the
  // monitor's missed-ping alert also fires when every run is erroring.
  if (!runFailed) {
    await sendHeartbeat();
  }

  process.exit(runFailed ? 1 : 0);
}

run().catch(async (error) => {
  console.error('Fatal error:', error);
  // Reaching process.exit(1) depends on sendSlackNotification never
  // throwing; a rejection here would skip the exit code.
  await sendSlackNotification(
    formatErrorMessage(
      'Fatal error',
      error instanceof Error ? error.message : String(error),
    ),
  );
  process.exit(1);
});
