import type { Shippo } from 'shippo';
import { DistanceUnitEnum, WeightUnitEnum } from 'shippo/models/components';

import { createShippoClient } from '../services/shippo';

export async function setupTestTransaction(): Promise<{
  client: Shippo;
  transactionId: string;
}> {
  const client = createShippoClient();

  const shipment = await client.shipments
    .create({
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
          length: '10',
          width: '10',
          height: '10',
          distanceUnit: DistanceUnitEnum.In,
          weight: '2',
          massUnit: WeightUnitEnum.Lb,
        },
      ],
      async: false,
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
    .create({ rate: rateId, async: false })
    .catch((err) => {
      throw new Error(
        `setupTestTransaction: transactions.create failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  if (!transaction.objectId) {
    throw new Error('Transaction was created but has no objectId');
  }

  return { client, transactionId: transaction.objectId };
}

export async function teardownTestTransaction(
  client: Shippo,
  transactionId: string,
): Promise<void> {
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
