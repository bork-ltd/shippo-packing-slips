import { describe, expect, it } from 'vitest';

import {
  escapeSlackText,
  formatErrorMessage,
  formatLabelPrintedMessage,
  formatPackingSlipPrintedMessage,
  shippoOrderUrl,
} from './slack-message';

type Container = {
  type: string;
  width: string;
  has_header_divider: boolean;
  title: { type: string; text: string };
  subtitle?: { type: string; text: string };
  icon: { type: string; image_url: string; alt_text: string };
  child_blocks: { type: string; text?: { text: string } }[];
};

function container(message: { blocks: unknown[] }): Container {
  return message.blocks[0] as Container;
}

function childTexts(message: { blocks: unknown[] }): (string | undefined)[] {
  return container(message).child_blocks.map((block) => block.text?.text);
}

describe('escapeSlackText', () => {
  it('escapes Slack mrkdwn control characters', () => {
    expect(escapeSlackText('a & b <c> d')).toBe('a &amp; b &lt;c&gt; d');
  });

  it('returns plain text unchanged', () => {
    expect(escapeSlackText('order 1234')).toBe('order 1234');
  });

  it('escapes every occurrence', () => {
    expect(escapeSlackText('<<&&>>')).toBe('&lt;&lt;&amp;&amp;&gt;&gt;');
  });
});

describe('shippoOrderUrl', () => {
  it('builds the order URL from an object ID', () => {
    expect(shippoOrderUrl('abc123')).toBe(
      'https://apps.goshippo.com/orders/abc123',
    );
  });

  it('returns undefined when the object ID is undefined', () => {
    expect(shippoOrderUrl(undefined)).toBeUndefined();
  });

  it('returns undefined when the object ID is empty', () => {
    expect(shippoOrderUrl('')).toBeUndefined();
  });
});

describe('formatPackingSlipPrintedMessage', () => {
  it('builds the full container card with linked order and item count', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      recipientName: 'Jane Doe',
      orderObjectId: 'abc123',
      totalItems: 5,
    });
    expect(message.text).toBe('Packing slip printed — order 1234 for Jane Doe');
    expect(message.blocks).toEqual([
      {
        type: 'container',
        width: 'standard',
        has_header_divider: true,
        title: { type: 'plain_text', text: 'Jane Doe' },
        subtitle: { type: 'plain_text', text: 'Packing slip printed' },
        icon: {
          type: 'image',
          image_url:
            'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4e6.png',
          alt_text: 'package emoji',
        },
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Order:* <https://apps.goshippo.com/orders/abc123|1234>',
            },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '*Total Items:* 5' },
          },
        ],
      },
    ]);
  });

  it('renders an unlinked order without an object ID', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      recipientName: 'Jane Doe',
      totalItems: 2,
    });
    expect(childTexts(message)).toEqual(['*Order:* 1234', '*Total Items:* 2']);
  });

  it('falls back to the order number as title without a recipient', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      totalItems: 1,
    });
    expect(container(message).title.text).toBe('Order 1234');
    expect(message.text).toBe('Packing slip printed — order 1234');
  });

  it('omits the item count when not provided', () => {
    const message = formatPackingSlipPrintedMessage({ orderNumber: '1234' });
    expect(childTexts(message)).toEqual(['*Order:* 1234']);
  });

  it('renders a zero item count rather than omitting it', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      totalItems: 0,
    });
    expect(childTexts(message)).toEqual(['*Order:* 1234', '*Total Items:* 0']);
  });

  it('escapes mrkdwn characters in the order number', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '<1234>',
    });
    expect(childTexts(message)).toEqual(['*Order:* &lt;1234&gt;']);
  });
});

describe('formatLabelPrintedMessage', () => {
  it('builds the full container card with order link and tracking', () => {
    const message = formatLabelPrintedMessage({
      trackingNumber: '9400111899560000000000',
      recipientName: 'Jane Doe',
      orderNumber: '1234',
      orderObjectId: 'abc123',
    });
    expect(message.text).toBe(
      'Shipping label printed for Jane Doe (tracking 9400111899560000000000)',
    );
    expect(message.blocks).toEqual([
      {
        type: 'container',
        width: 'standard',
        has_header_divider: true,
        title: { type: 'plain_text', text: 'Jane Doe' },
        subtitle: { type: 'plain_text', text: 'Shipping label printed' },
        icon: {
          type: 'image',
          image_url:
            'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3f7.png',
          alt_text: 'label emoji',
        },
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Order:* <https://apps.goshippo.com/orders/abc123|1234>',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Tracking:* `9400111899560000000000`',
            },
          },
        ],
      },
    ]);
  });

  it('omits the order line when no order was resolved', () => {
    const message = formatLabelPrintedMessage({
      trackingNumber: '9400',
      recipientName: 'Jane Doe',
    });
    expect(childTexts(message)).toEqual(['*Tracking:* `9400`']);
  });

  it('falls back to a generic title without a recipient', () => {
    const message = formatLabelPrintedMessage({ trackingNumber: '9400' });
    expect(container(message).title.text).toBe('Shipping label');
    expect(message.text).toBe('Shipping label printed (tracking 9400)');
  });

  it('uses placeholder detail when nothing was resolved', () => {
    const message = formatLabelPrintedMessage({});
    expect(childTexts(message)).toEqual(['Printed']);
    expect(message.text).toBe('Shipping label printed');
  });
});

describe('formatErrorMessage', () => {
  it('builds an Error card holding an orange callout with a code block', () => {
    const message = formatErrorMessage(
      'Failed to process order 1234',
      'HTTP 500',
    );
    expect(message.text).toBe('Failed to process order 1234: HTTP 500');
    expect(message.blocks).toEqual([
      {
        type: 'container',
        width: 'standard',
        has_header_divider: true,
        title: { type: 'plain_text', text: 'Error' },
        icon: {
          type: 'image',
          image_url:
            'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6a8.png',
          alt_text: 'alert emoji',
        },
        child_blocks: [
          {
            type: 'callout',
            background_color: 'orange',
            child_blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '```Failed to process order 1234\nHTTP 500```',
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('has no subtitle', () => {
    const message = formatErrorMessage('Fatal error', 'boom');
    expect(container(message).subtitle).toBeUndefined();
  });

  it('escapes mrkdwn characters inside the code block', () => {
    const message = formatErrorMessage(
      'Fatal error',
      'fetch failed <ECONNRESET>',
    );
    const callout = container(message).child_blocks[0] as unknown as {
      child_blocks: { text: { text: string } }[];
    };
    expect(callout.child_blocks[0].text.text).toBe(
      '```Fatal error\nfetch failed &lt;ECONNRESET&gt;```',
    );
  });

  it('truncates the code block within the 3000-character section limit, keeping the fences and adding a marker', () => {
    const message = formatErrorMessage('Fatal error', 'x'.repeat(4000));
    const callout = container(message).child_blocks[0] as unknown as {
      child_blocks: { text: { text: string } }[];
    };
    const text = callout.child_blocks[0].text.text;
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(text.startsWith('```Fatal error')).toBe(true);
    expect(text.endsWith('… (truncated)```')).toBe(true);
    expect(message.text).toBe(`Fatal error: ${'x'.repeat(4000)}`);
  });

  it('does not leave a partially sliced HTML entity at the truncation point', () => {
    // Fill so that the escaped '&' of a trailing '&amp;' lands right at the cut.
    const detail = `${'x'.repeat(2960)}${'&'.repeat(20)}`;
    const message = formatErrorMessage('E', detail);
    const callout = container(message).child_blocks[0] as unknown as {
      child_blocks: { text: { text: string } }[];
    };
    const text = callout.child_blocks[0].text.text;
    expect(text).not.toMatch(/&[a-z]{0,3}\n… \(truncated\)```$/);
    expect(text.endsWith('… (truncated)```')).toBe(true);
  });

  it('does not truncate content at or under the limit', () => {
    const message = formatErrorMessage('E', 'short detail');
    const callout = container(message).child_blocks[0] as unknown as {
      child_blocks: { text: { text: string } }[];
    };
    expect(callout.child_blocks[0].text.text).toBe('```E\nshort detail```');
  });
});
