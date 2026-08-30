import type { SlackMessage } from '../lib/slack-message';

// Abort a webhook post that stalls; undici would otherwise wait ~300s and
// notifications are awaited serially, so a blackholing endpoint could stall
// the whole run.
const SLACK_TIMEOUT_MS = 10_000;

/**
 * Send a message to the Slack incoming webhook configured via SLACK_WEBHOOK_URL.
 *
 * Silent no-op when SLACK_WEBHOOK_URL is unset. Never throws — a notification
 * failure is logged as a warning and must never crash the job or mask the
 * original error being reported.
 * @param message - Webhook payload (see src/lib/slack-message.ts formatters)
 */
export async function sendSlackNotification(
  message: SlackMessage,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      body: JSON.stringify(message),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Slack returns diagnostic bodies on 4xx (e.g. invalid_blocks).
      const body = await res.text().catch(() => '');
      console.warn(
        `Warning: Slack notification failed for "${message.text}": HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
      );
    }
  } catch (error) {
    console.warn(
      `Warning: Slack notification failed for "${message.text}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
