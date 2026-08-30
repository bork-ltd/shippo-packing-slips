// Abort a heartbeat ping that stalls so it cannot delay process exit.
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Ping the dead-man's-switch URL configured via HEALTHCHECK_PING_URL
 * (e.g. a healthchecks.io check). Call only after a successful run — the
 * monitor alerts when an expected ping does not arrive, which is the one
 * mechanism that catches a fully offline or hung Pi.
 *
 * Silent no-op when HEALTHCHECK_PING_URL is unset. Never throws — a ping
 * failure is logged as a warning and must never affect the run's exit code.
 */
export async function sendHeartbeat(): Promise<void> {
  const pingUrl = process.env.HEALTHCHECK_PING_URL;
  if (!pingUrl) {
    return;
  }

  try {
    const res = await fetch(pingUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(
        `Warning: heartbeat ping failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
  } catch (error) {
    console.warn(
      `Warning: heartbeat ping failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
