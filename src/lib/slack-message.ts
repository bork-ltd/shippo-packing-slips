const SHIPPO_ORDER_URL_BASE = 'https://apps.goshippo.com/orders';
const TWEMOJI_URL_BASE =
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

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

/** An "*Order:* <link|number>" mrkdwn section, linked when possible. */
function orderSection(orderNumber: string, orderObjectId?: string): unknown {
  const url = shippoOrderUrl(orderObjectId);
  const orderText = escapeSlackText(orderNumber);
  const orderRef = url ? `<${url}|${orderText}>` : orderText;
  return mrkdwnSection(`*Order:* ${orderRef}`);
}

function mrkdwnSection(text: string): unknown {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

/**
 * A standard-width container card with a header divider and a Twemoji icon.
 * Container titles do not render unicode emoji, hence the image icon.
 */
function containerBlock(params: {
  title: string;
  subtitle?: string;
  emojiCodepoint: string;
  emojiAltText: string;
  childBlocks: unknown[];
}): unknown {
  const { title, subtitle, emojiCodepoint, emojiAltText, childBlocks } = params;
  return {
    type: 'container',
    width: 'standard',
    has_header_divider: true,
    title: { type: 'plain_text', text: title },
    ...(subtitle ? { subtitle: { type: 'plain_text', text: subtitle } } : {}),
    icon: {
      type: 'image',
      image_url: `${TWEMOJI_URL_BASE}/${emojiCodepoint}.png`,
      alt_text: emojiAltText,
    },
    child_blocks: childBlocks,
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
  totalItems?: number;
}): SlackMessage {
  const { orderNumber, recipientName, orderObjectId, totalItems } = params;
  const childBlocks = [orderSection(orderNumber, orderObjectId)];
  if (totalItems !== undefined) {
    childBlocks.push(mrkdwnSection(`*Total Items:* ${totalItems}`));
  }
  return {
    text: `Packing slip printed — order ${orderNumber}${recipientName ? ` for ${recipientName}` : ''}`,
    blocks: [
      containerBlock({
        title: recipientName ?? `Order ${orderNumber}`,
        subtitle: 'Packing slip printed',
        emojiCodepoint: '1f4e6',
        emojiAltText: 'package emoji',
        childBlocks,
      }),
    ],
  };
}

/**
 * Build the Slack message for a printed shipping label.
 * Order details are best-effort: the Shippo SDK cannot trace a transaction
 * back to its order, so they are resolved separately via the raw API and may
 * be absent.
 */
export function formatLabelPrintedMessage(params: {
  trackingNumber?: string;
  recipientName?: string;
  orderNumber?: string;
  orderObjectId?: string;
}): SlackMessage {
  const { trackingNumber, recipientName, orderNumber, orderObjectId } = params;
  const childBlocks: unknown[] = [];
  if (orderNumber) {
    childBlocks.push(orderSection(orderNumber, orderObjectId));
  }
  if (trackingNumber) {
    childBlocks.push(
      mrkdwnSection(`*Tracking:* \`${escapeSlackText(trackingNumber)}\``),
    );
  }
  if (childBlocks.length === 0) {
    childBlocks.push(mrkdwnSection('Printed'));
  }
  const fallbackRecipient = recipientName ? ` for ${recipientName}` : '';
  const fallbackTracking = trackingNumber
    ? ` (tracking ${trackingNumber})`
    : '';
  return {
    text: `Shipping label printed${fallbackRecipient}${fallbackTracking}`,
    blocks: [
      containerBlock({
        title: recipientName ?? 'Shipping label',
        subtitle: 'Shipping label printed',
        emojiCodepoint: '1f3f7',
        emojiAltText: 'label emoji',
        childBlocks,
      }),
    ],
  };
}

/**
 * Build the Slack message for an error: an "Error" container holding an
 * orange callout with the error output in a code block.
 * @param context - What was being attempted (e.g. "Failed to process order 1234")
 * @param detail - The error message
 */
export function formatErrorMessage(
  context: string,
  detail: string,
): SlackMessage {
  const codeContent = escapeSlackText(`${context}\n${detail}`).slice(
    0,
    // Leave room for the code fence markers within the section limit.
    SECTION_TEXT_LIMIT - 6,
  );
  return {
    text: `${context}: ${detail}`,
    blocks: [
      containerBlock({
        title: 'Error',
        emojiCodepoint: '1f6a8',
        emojiAltText: 'alert emoji',
        childBlocks: [
          {
            type: 'callout',
            background_color: 'orange',
            child_blocks: [mrkdwnSection(`\`\`\`${codeContent}\`\`\``)],
          },
        ],
      }),
    ],
  };
}
