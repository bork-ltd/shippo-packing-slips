const SHIPPO_ORDER_URL_BASE = 'https://apps.goshippo.com/orders';

/**
 * Escape text for Slack mrkdwn per https://docs.slack.dev/messaging/formatting-message-text
 * Only &, <, and > are control characters in Slack message text.
 */
export function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Derive the Shippo web app URL for an order.
 * @param orderObjectId - The Shippo order object ID
 * @returns URL string, or undefined when no object ID is available
 */
export function shippoOrderUrl(
  orderObjectId: string | undefined,
): string | undefined {
  if (!orderObjectId) {
    return undefined;
  }
  return `${SHIPPO_ORDER_URL_BASE}/${orderObjectId}`;
}

/**
 * Build the Slack message for a printed packing slip.
 * Links the order number to the Shippo UI when an order object ID is available.
 */
export function formatPackingSlipPrintedMessage(params: {
  orderNumber: string;
  recipientName?: string;
  orderObjectId?: string;
}): string {
  const { orderNumber, recipientName, orderObjectId } = params;
  const url = shippoOrderUrl(orderObjectId);
  const orderText = escapeSlackText(orderNumber);
  const orderRef = url ? `<${url}|${orderText}>` : orderText;
  const recipient = recipientName
    ? ` for ${escapeSlackText(recipientName)}`
    : '';
  return `:page_facing_up: Packing slip printed — order ${orderRef}${recipient}`;
}

/**
 * Build the Slack message for a printed shipping label.
 * Transactions cannot be traced back to an order via the Shippo API, so this
 * message carries the tracking number plus the recipient name when one could
 * be resolved from the shipment.
 */
export function formatLabelPrintedMessage(params: {
  trackingNumber?: string;
  recipientName?: string;
}): string {
  const { trackingNumber, recipientName } = params;
  const recipient = recipientName
    ? ` for ${escapeSlackText(recipientName)}`
    : '';
  const tracking = trackingNumber
    ? ` (tracking ${escapeSlackText(trackingNumber)})`
    : '';
  return `:label: Shipping label printed${recipient}${tracking}`;
}

/**
 * Build the Slack message for an error.
 * @param context - What was being attempted (e.g. "Failed to process order 1234")
 * @param detail - The error message
 */
export function formatErrorMessage(context: string, detail: string): string {
  return `:x: ${escapeSlackText(context)}: ${escapeSlackText(detail)}`;
}
