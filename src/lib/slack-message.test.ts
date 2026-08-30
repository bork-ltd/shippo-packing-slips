import { describe, expect, it } from 'vitest';

import {
  escapeSlackText,
  formatErrorMessage,
  formatLabelPrintedMessage,
  formatPackingSlipPrintedMessage,
  shippoOrderUrl,
} from './slack-message';

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
  it('links the order number when an object ID is available', () => {
    expect(
      formatPackingSlipPrintedMessage({
        orderNumber: '1234',
        recipientName: 'Jane Doe',
        orderObjectId: 'abc123',
      }),
    ).toBe(
      ':page_facing_up: Packing slip printed — order <https://apps.goshippo.com/orders/abc123|1234> for Jane Doe',
    );
  });

  it('falls back to plain text without an object ID', () => {
    expect(
      formatPackingSlipPrintedMessage({
        orderNumber: '1234',
        recipientName: 'Jane Doe',
      }),
    ).toBe(':page_facing_up: Packing slip printed — order 1234 for Jane Doe');
  });

  it('omits the recipient when no name is available', () => {
    expect(formatPackingSlipPrintedMessage({ orderNumber: '1234' })).toBe(
      ':page_facing_up: Packing slip printed — order 1234',
    );
  });

  it('escapes mrkdwn characters in order number and name', () => {
    expect(
      formatPackingSlipPrintedMessage({
        orderNumber: '<1234>',
        recipientName: 'Jane & Co',
      }),
    ).toBe(
      ':page_facing_up: Packing slip printed — order &lt;1234&gt; for Jane &amp; Co',
    );
  });
});

describe('formatLabelPrintedMessage', () => {
  it('includes recipient and tracking number when available', () => {
    expect(
      formatLabelPrintedMessage({
        trackingNumber: '9400111899560000000000',
        recipientName: 'Jane Doe',
      }),
    ).toBe(
      ':label: Shipping label printed for Jane Doe (tracking 9400111899560000000000)',
    );
  });

  it('omits recipient when no name is available', () => {
    expect(formatLabelPrintedMessage({ trackingNumber: '9400' })).toBe(
      ':label: Shipping label printed (tracking 9400)',
    );
  });

  it('omits tracking when no tracking number is available', () => {
    expect(formatLabelPrintedMessage({ recipientName: 'Jane Doe' })).toBe(
      ':label: Shipping label printed for Jane Doe',
    );
  });

  it('handles neither recipient nor tracking', () => {
    expect(formatLabelPrintedMessage({})).toBe(
      ':label: Shipping label printed',
    );
  });
});

describe('formatErrorMessage', () => {
  it('joins context and detail', () => {
    expect(formatErrorMessage('Failed to process order 1234', 'HTTP 500')).toBe(
      ':x: Failed to process order 1234: HTTP 500',
    );
  });

  it('escapes mrkdwn characters', () => {
    expect(formatErrorMessage('Fatal error', 'fetch failed <ECONNRESET>')).toBe(
      ':x: Fatal error: fetch failed &lt;ECONNRESET&gt;',
    );
  });
});
