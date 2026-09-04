import path from 'node:path';

/**
 * Whether a pickup scheduling error is Shippo/USPS reporting that a pickup
 * already exists. This is a benign condition — additional packages left at
 * the pickup location are collected with the existing pickup — so callers
 * should treat it as "already scheduled", not a failure.
 *
 * Covers two distinct error shapes seen from the API: the account-level
 * "you already requested a pickup today" message, and the transaction-level
 * "Transaction <id> already has a pickup scheduled" message returned when a
 * transaction was manually re-included in a later pickup request.
 * @param message - The error message from the pickup API call
 */
export function isDuplicatePickupError(message: string): boolean {
  return /already (requested a USPS pickup|has a pickup scheduled)/i.test(
    message,
  );
}

/**
 * Sentinel file path marking that a pickup request succeeded (or was reported
 * as a duplicate) on the given UTC date. Lives in the persistent state
 * directory alongside the print markers and fetch watermarks, so a reboot
 * cannot cause a redundant pickup attempt.
 * @param now - Time of the current run
 * @param stateDir - The persistent state directory (see src/services/state-store.ts)
 */
export function pickupSentinelPath(now: Date, stateDir: string): string {
  return path.join(
    stateDir,
    `pickup-requested-${now.toISOString().slice(0, 10)}`,
  );
}
