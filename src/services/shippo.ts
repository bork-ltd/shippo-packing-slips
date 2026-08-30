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

import { filterTransaction } from '../lib/filter-transaction';

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
        const result = filterTransaction(tx, startDate, endDate);
        if (result === 'stop') {
          hasMore = false;
          break;
        }
        if (result === 'match') {
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

export type TransactionOrderInfo = {
  orderNumber?: string;
  orderObjectId?: string;
  recipientName?: string;
};

/**
 * Best-effort lookup of the order a label transaction belongs to.
 * The SDK strips the order → transactions linkage (order.transactions items
 * parse to empty objects), so this pages the raw /orders endpoint and matches
 * the transaction object ID. The endpoint cannot filter by transaction and
 * returns recent orders first (observed behavior; ordering is not documented
 * in the API spec), so the search covers the ~75 most recent orders (3 pages
 * of 25).
 * @param transactionId - The Shippo transaction object ID
 * @returns Order number, object ID, and recipient name; or undefined when no
 *   searched order references the transaction
 */
export async function fetchOrderForTransaction(
  transactionId: string,
): Promise<TransactionOrderInfo | undefined> {
  const apiToken = process.env.SHIPPO_API_TOKEN;
  if (!apiToken) {
    throw new Error('SHIPPO_API_TOKEN environment variable is required');
  }

  type RawOrder = {
    object_id?: string;
    order_number?: string;
    to_address?: { name?: string };
    transactions?: { object_id?: string }[];
  };

  const maxPages = 3;
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(
        `https://api.goshippo.com/orders?results=25&page=${page}`,
        {
          headers: { Authorization: `ShippoToken ${apiToken}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
        );
      }
      const data = (await res.json()) as {
        next?: string | null;
        results?: RawOrder[];
      };

      for (const order of data.results ?? []) {
        const match = order.transactions?.some(
          (tx) => tx.object_id === transactionId,
        );
        if (match) {
          return {
            orderNumber: order.order_number,
            orderObjectId: order.object_id,
            recipientName: order.to_address?.name,
          };
        }
      }

      if (!data.next) {
        return undefined;
      }
      if (page === maxPages) {
        // Distinguish "gave up" from "no order references this transaction".
        console.warn(
          `Warning: order lookup for transaction ${transactionId} gave up after ${maxPages} pages with more orders remaining`,
        );
      }
    }
    return undefined;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch order for transaction ${transactionId}: ${error.message}`,
        { cause: error },
      );
    }
    throw new Error(
      `Failed to fetch order for transaction ${transactionId}: Unknown error`,
    );
  }
}

/**
 * Resolve the recipient (ship-to) name for a transaction.
 * Walks the chain: transaction → rate → shipment → address_to.
 * There is no direct transaction → order lookup, so when the order search
 * (fetchOrderForTransaction) misses, the ship-to name from the shipment chain
 * is the closest available identity for label notifications.
 * @param transactionId - The Shippo transaction object ID
 * @returns The recipient name, or undefined when the shipment has none
 */
export async function fetchRecipientName(
  transactionId: string,
): Promise<string | undefined> {
  const client = createShippoClient();

  try {
    const transaction = await client.transactions.get(transactionId);
    const transactionRate = transaction.rate;

    const rateId =
      typeof transactionRate === 'string'
        ? transactionRate
        : transactionRate?.objectId;

    if (!rateId) {
      throw new Error('Unable to resolve rate ID from transaction');
    }

    const rate = await client.rates.get(rateId);
    const shipment = await client.shipments.get(rate.shipment);

    return shipment.addressTo.name ?? undefined;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch recipient name for transaction ${transactionId}: ${error.message}`,
        { cause: error },
      );
    }
    throw new Error(
      `Failed to fetch recipient name for transaction ${transactionId}: Unknown error`,
    );
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
