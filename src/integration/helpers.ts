import type { Shippo } from 'shippo';
import {
  CarriersEnum,
  DistanceUnitEnum,
  TransactionStatusEnum,
  WeightUnitEnum,
} from 'shippo/models/components';

import { createShippoClient } from '../services/shippo';

export async function setupTestTransaction(): Promise<{
  client: Shippo;
  transactionId: string;
}> {
  const client = createShippoClient();

  // Filter to USPS carrier accounts — other carriers may fail label generation
  // in test mode. This follows the pattern in the Shippo SDK's own test suite.
  const carrierAccountsResponse = await client.carrierAccounts
    .list({ carrier: CarriersEnum.Usps })
    .catch((err) => {
      throw new Error(
        `setupTestTransaction: carrierAccounts.list failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  const carrierAccountIds = (carrierAccountsResponse.results ?? [])
    .map((ca) => ca.objectId)
    .filter((id): id is string => id !== undefined);

  if (!carrierAccountIds.length) {
    throw new Error('No USPS carrier accounts found in test account');
  }

  const shipment = await client.shipments
    .create({
      carrierAccounts: carrierAccountIds,
      addressFrom: {
        name: 'Test Sender',
        street1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94103',
        country: 'US',
      },
      addressTo: {
        name: 'Test Recipient',
        street1: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
      },
      parcels: [
        {
          length: '5',
          width: '5',
          height: '5',
          distanceUnit: DistanceUnitEnum.In,
          weight: '2',
          massUnit: WeightUnitEnum.Lb,
        },
      ],
    })
    .catch((err) => {
      throw new Error(
        `setupTestTransaction: shipments.create failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  if (!shipment.rates?.length) {
    throw new Error('No rates returned for test shipment');
  }

  const rateId = shipment.rates[0].objectId;

  if (!rateId) {
    throw new Error('First rate has no objectId');
  }

  const transaction = await client.transactions
    .create({ rate: rateId })
    .catch((err) => {
      throw new Error(
        `setupTestTransaction: transactions.create failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  if (!transaction.objectId) {
    throw new Error('Transaction was created but has no objectId');
  }

  await waitForTransactionSuccess(client, transaction.objectId);

  return { client, transactionId: transaction.objectId };
}

async function waitForTransactionSuccess(
  client: Shippo,
  transactionId: string,
  timeoutMs = 20_000,
  intervalMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tx = await client.transactions.get(transactionId);

    if (tx.status === TransactionStatusEnum.Success) {
      return;
    }

    if (tx.status === TransactionStatusEnum.Error) {
      throw new Error(
        `Transaction ${transactionId} reached ERROR state — label generation failed in Shippo test mode.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Transaction ${transactionId} did not reach SUCCESS within ${timeoutMs}ms.`,
  );
}

export async function teardownTestTransaction(
  client: Shippo,
  transactionId: string,
): Promise<void> {
  // Only SUCCESS transactions can be refunded — ERROR/VOIDED/etc. have no label to void.
  let status: string | undefined;
  try {
    const tx = await client.transactions.get(transactionId);
    status = tx.status;
  } catch {
    // If we can't fetch the transaction, skip cleanup silently.
    return;
  }

  if (status !== TransactionStatusEnum.Success) {
    return;
  }

  try {
    await client.refunds.create({ transaction: transactionId });
  } catch (error) {
    // Best-effort cleanup — do not fail the test suite, but warn so the failure
    // is visible and the transaction can be manually voided if needed.
    console.warn(
      `[teardownTestTransaction] Failed to void transaction ${transactionId} — ` +
        `manual cleanup may be required in your Shippo test-mode account. ` +
        `Reason: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
