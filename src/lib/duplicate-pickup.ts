/**
 * Whether a pickup scheduling error is USPS reporting that a pickup was
 * already requested for today. This is a benign condition — additional
 * packages left at the pickup location are collected with the existing
 * pickup — so callers should treat it as "already scheduled", not a failure.
 * @param message - The error message from the pickup API call
 */
export function isDuplicatePickupError(message: string): boolean {
  return /already requested a USPS pickup/i.test(message);
}

/**
 * Sentinel file path marking that a pickup request succeeded (or was reported
 * as a duplicate) on the given UTC date. Lives in /tmp like the print
 * sentinels: cleared on reboot, in which case one redundant pickup attempt is
 * made and answered by the duplicate-pickup response.
 * @param now - Time of the current run
 */
export function pickupSentinelPath(now: Date): string {
  return `/tmp/pickup-requested-${now.toISOString().slice(0, 10)}`;
}
