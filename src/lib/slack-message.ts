const SHIPPO_ORDER_URL_BASE = 'https://apps.goshippo.com/orders';

// Slack section block text objects cap at 3000 characters.
const SECTION_TEXT_LIMIT = 3000;

/**
 * A Slack incoming-webhook payload. `text` is the notification and
 * screen-reader fallback for the Block Kit `blocks`.
 */
export type SlackMessage = {
  text: string;
  blocks: unknown[];
};

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
 * Wrap detail blocks in a full-width container card with a plain_text title.
 * Emoji in the title must use shortcode form (e.g. ":label:"); unicode emoji
 * do not render in container titles.
 */
function containerBlock(title: string, mrkdwnText: string): unknown {
  return {
    type: 'container',
    title: { type: 'plain_text', text: title, emoji: true },
    width: 'full',
    child_blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: mrkdwnText },
      },
    ],
  };
}

/**
 * Build the Slack message for a printed packing slip.
 * Links the order number to the Shippo UI when an order object ID is available.
 */
export function formatPackingSlipPrintedMessage(params: {
  orderNumber: string;
  recipientName?: string;
  orderObjectId?: string;
}): SlackMessage {
  const { orderNumber, recipientName, orderObjectId } = params;
  const url = shippoOrderUrl(orderObjectId);
  const orderText = `Order ${escapeSlackText(orderNumber)}`;
  const orderRef = url ? `<${url}|${orderText}>` : orderText;
  const recipient = recipientName ? ` — ${escapeSlackText(recipientName)}` : '';
  return {
    text: `Packing slip printed — order ${orderNumber}${recipientName ? ` for ${recipientName}` : ''}`,
    blocks: [
      containerBlock(
        ':page_facing_up: Packing slip printed',
        `${orderRef}${recipient}`,
      ),
    ],
  };
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
}): SlackMessage {
  const { trackingNumber, recipientName } = params;
  const detailParts: string[] = [];
  if (recipientName) {
    detailParts.push(escapeSlackText(recipientName));
  }
  if (trackingNumber) {
    detailParts.push(`tracking \`${escapeSlackText(trackingNumber)}\``);
  }
  const detail = detailParts.length > 0 ? detailParts.join(' — ') : 'Printed';
  const fallbackRecipient = recipientName ? ` for ${recipientName}` : '';
  const fallbackTracking = trackingNumber
    ? ` (tracking ${trackingNumber})`
    : '';
  return {
    text: `Shipping label printed${fallbackRecipient}${fallbackTracking}`,
    blocks: [containerBlock(':label: Shipping label printed', detail)],
  };
}

/**
 * Build the Slack message for an error as an orange callout.
 * @param context - What was being attempted (e.g. "Failed to process order 1234")
 * @param detail - The error message
 */
export function formatErrorMessage(
  context: string,
  detail: string,
): SlackMessage {
  const mrkdwn = `:x: *${escapeSlackText(context)}*\n${escapeSlackText(detail)}`;
  return {
    text: `${context}: ${detail}`,
    blocks: [
      {
        type: 'callout',
        background_color: 'orange',
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: mrkdwn.slice(0, SECTION_TEXT_LIMIT),
            },
          },
        ],
      },
    ],
  };
}
