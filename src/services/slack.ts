import type { SlackMessage } from '../lib/slack-message';

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
    });
    if (!res.ok) {
      console.warn(
        `Warning: Slack notification failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
  } catch (error) {
    console.warn(
      `Warning: Slack notification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
