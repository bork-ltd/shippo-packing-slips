import { Shippo } from 'shippo';
import type {
  AddressCompleteCreateRequest,
  Order,
  OrderStatusEnum,
  Pickup,
  PickupBase,
  Transaction,
} from 'shippo/models/components';
import { TransactionStatusEnum } from 'shippo/models/components';

export type { Pickup, PickupBase };

export type PickupDetails = {
  carrierAccount: string;
  address: AddressCompleteCreateRequest;
};

/**
 * Initialize Shippo client with API token from environment
 *
 * Uses SHIPPO_API_TOKEN which should be the production token.
 * Test scripts should override this with SHIPPO_TEST_API_TOKEN.
 */
export function createShippoClient(): Shippo {
  const apiToken = process.env.SHIPPO_API_TOKEN;

  if (!apiToken) {
    throw new Error('SHIPPO_API_TOKEN environment variable is required');
  }

  return new Shippo({
    apiKeyHeader: apiToken,
  });
}

/**
 * Fetch orders from Shippo within a specified date range
 * @param startDate - Start of date range (orders placed after this time)
 * @param endDate - End of date range (orders placed before this time)
 * @param orderStatus - Optional array of order statuses to filter by (e.g., [OrderStatusEnum.Paid])
 * @returns Array of order objects from Shippo
 */
export async function fetchOrders(
  startDate: Date,
  endDate: Date,
  orderStatus?: OrderStatusEnum[],
): Promise<Order[]> {
  const client = createShippoClient();

  // Convert dates to ISO 8601 format (required by Shippo API)
  const startDateISO = startDate.toISOString();
  const endDateISO = endDate.toISOString();

  try {
    const allOrders: Order[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Fetch orders for current page
      const response = await client.orders.list({
        endDate: endDateISO,
        orderStatus,
        page,
        results: 25, // Default page size
        startDate: startDateISO,
      });

      // Add orders from this page to our collection
      if (response.results && response.results.length > 0) {
        allOrders.push(...response.results);
      }

      // Check if there are more pages
      // The 'next' field contains a URL if there are more results
      hasMore = !!response.next;
      page++;
    }

    return allOrders;
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to fetch orders from Shippo: ${error.message}`);
    }
    throw new Error('Failed to fetch orders from Shippo: Unknown error');
  }
}

/**
 * Fetch successful transactions from Shippo within a specified date range.
 * The API does not support server-side date filtering, so we paginate newest-first
 * and stop once results fall before startDate.
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (inclusive)
 * @returns Array of Transaction objects within the date range that have a truthy labelUrl
 */
export async function fetchTransactions(
  startDate: Date,
  endDate: Date,
): Promise<Transaction[]> {
  const client = createShippoClient();

  try {
    const matched: Transaction[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await client.transactions.list({
        objectStatus: TransactionStatusEnum.Success,
        page,
        results: 25,
      });

      const pageResults = response.results ?? [];

      for (const tx of pageResults) {
        const created = tx.objectCreated;

        // Results are newest-first; stop paging once we're before the window
        if (created && created < startDate) {
          console.log(
            `  Stopping pagination: reached transaction before window (${created.toISOString()})`,
          );
          hasMore = false;
          break;
        }

        if (
          created &&
          created >= startDate &&
          created <= endDate &&
          tx.labelUrl
        ) {
          matched.push(tx);
        }
      }

      if (hasMore) {
        hasMore = !!response.next;
        page++;
      }
    }

    return matched;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch transactions from Shippo: ${error.message}`,
      );
    }
    throw new Error('Failed to fetch transactions from Shippo: Unknown error');
  }
}

/**
 * Resolve pickup details (carrier account + sender address) for a given transaction.
 * Walks the chain: transaction → rate → shipment → address_from.
 * @param transactionId - The Shippo transaction object ID
 * @returns Carrier account ID and the sender address for use in a pickup request
 */
export async function fetchPickupDetails(
  transactionId: string,
): Promise<PickupDetails> {
  const client = createShippoClient();

  try {
    const transaction = await client.transactions.get(transactionId);
    const transactionRate = transaction.rate;

    if (!transactionRate) {
      throw new Error('Transaction has no rate');
    }

    const rateId =
      typeof transactionRate === 'string'
        ? transactionRate
        : transactionRate.objectId;

    if (!rateId) {
      throw new Error('Unable to resolve rate ID from transaction');
    }

    const rate = await client.rates.get(rateId);

    if (!rate.carrierAccount) {
      throw new Error('Rate has no carrier account');
    }

    const shipment = await client.shipments.get(rate.shipment);
    const from = shipment.addressFrom;

    return {
      carrierAccount: rate.carrierAccount,
      address: {
        name: from.name ?? '',
        company: from.company,
        street1: from.street1 ?? '',
        street2: from.street2,
        street3: from.street3,
        city: from.city ?? '',
        state: from.state ?? '',
        zip: from.zip ?? '',
        country: from.country,
        phone: from.phone,
        email: from.email,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch pickup details: ${error.message}`);
    }
    throw new Error('Failed to fetch pickup details: Unknown error');
  }
}

/**
 * Schedule a carrier pickup for one or more existing transactions via the Shippo pickups API.
 * The carrier is determined by the carrier account embedded in the request.
 * @param request - PickupBase object containing carrier account, location, time window, and transaction IDs
 * @returns Pickup object with status, confirmation code, and carrier-confirmed time windows
 */
export async function schedulePickup(request: PickupBase): Promise<Pickup> {
  const client = createShippoClient();

  try {
    return await client.pickups.create(request);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to schedule pickup: ${error.message}`);
    }
    throw new Error('Failed to schedule pickup: Unknown error');
  }
}
