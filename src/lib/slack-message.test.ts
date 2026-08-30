import { describe, expect, it } from 'vitest';

import {
  escapeSlackText,
  formatErrorMessage,
  formatLabelPrintedMessage,
  formatPackingSlipPrintedMessage,
  shippoOrderUrl,
} from './slack-message';

function sectionText(message: { blocks: unknown[] }): string {
  const block = message.blocks[0] as {
    child_blocks: { text: { text: string } }[];
  };
  return block.child_blocks[0].text.text;
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
  it('builds a full-width container with a linked order and fallback text', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      recipientName: 'Jane Doe',
      orderObjectId: 'abc123',
    });
    expect(message.text).toBe('Packing slip printed — order 1234 for Jane Doe');
    expect(message.blocks).toEqual([
      {
        type: 'container',
        title: {
          type: 'plain_text',
          text: ':page_facing_up: Packing slip printed',
          emoji: true,
        },
        width: 'full',
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '<https://apps.goshippo.com/orders/abc123|Order 1234> — Jane Doe',
            },
          },
        ],
      },
    ]);
  });

  it('falls back to plain order text without an object ID', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '1234',
      recipientName: 'Jane Doe',
    });
    expect(sectionText(message)).toBe('Order 1234 — Jane Doe');
  });

  it('omits the recipient when no name is available', () => {
    const message = formatPackingSlipPrintedMessage({ orderNumber: '1234' });
    expect(sectionText(message)).toBe('Order 1234');
    expect(message.text).toBe('Packing slip printed — order 1234');
  });

  it('escapes mrkdwn characters in order number and name', () => {
    const message = formatPackingSlipPrintedMessage({
      orderNumber: '<1234>',
      recipientName: 'Jane & Co',
    });
    expect(sectionText(message)).toBe('Order &lt;1234&gt; — Jane &amp; Co');
  });
});

describe('formatLabelPrintedMessage', () => {
  it('includes recipient and tracking number when available', () => {
    const message = formatLabelPrintedMessage({
      trackingNumber: '9400111899560000000000',
      recipientName: 'Jane Doe',
    });
    expect(message.text).toBe(
      'Shipping label printed for Jane Doe (tracking 9400111899560000000000)',
    );
    expect(message.blocks).toEqual([
      {
        type: 'container',
        title: {
          type: 'plain_text',
          text: ':label: Shipping label printed',
          emoji: true,
        },
        width: 'full',
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Jane Doe — tracking `9400111899560000000000`',
            },
          },
        ],
      },
    ]);
  });

  it('omits recipient when no name is available', () => {
    const message = formatLabelPrintedMessage({ trackingNumber: '9400' });
    expect(sectionText(message)).toBe('tracking `9400`');
    expect(message.text).toBe('Shipping label printed (tracking 9400)');
  });

  it('omits tracking when no tracking number is available', () => {
    const message = formatLabelPrintedMessage({ recipientName: 'Jane Doe' });
    expect(sectionText(message)).toBe('Jane Doe');
    expect(message.text).toBe('Shipping label printed for Jane Doe');
  });

  it('uses placeholder detail when neither recipient nor tracking exists', () => {
    const message = formatLabelPrintedMessage({});
    expect(sectionText(message)).toBe('Printed');
    expect(message.text).toBe('Shipping label printed');
  });
});

describe('formatErrorMessage', () => {
  it('builds an orange callout with bold context and fallback text', () => {
    const message = formatErrorMessage(
      'Failed to process order 1234',
      'HTTP 500',
    );
    expect(message.text).toBe('Failed to process order 1234: HTTP 500');
    expect(message.blocks).toEqual([
      {
        type: 'callout',
        background_color: 'orange',
        child_blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':x: *Failed to process order 1234*\nHTTP 500',
            },
          },
        ],
      },
    ]);
  });

  it('escapes mrkdwn characters', () => {
    const message = formatErrorMessage(
      'Fatal error',
      'fetch failed <ECONNRESET>',
    );
    expect(sectionText(message)).toBe(
      ':x: *Fatal error*\nfetch failed &lt;ECONNRESET&gt;',
    );
  });

  it('truncates section text to the 3000-character Slack limit', () => {
    const message = formatErrorMessage('Fatal error', 'x'.repeat(4000));
    expect(sectionText(message)).toHaveLength(3000);
    expect(message.text).toBe(`Fatal error: ${'x'.repeat(4000)}`);
  });
});
