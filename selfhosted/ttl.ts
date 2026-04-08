/** Default time-to-live duration in milliseconds (24 hours). */
export const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Compute an ISO 8601 expiration timestamp 24 hours from now.
 *
 * Used when creating or refreshing artifact TTL in the database.
 * Returns a UTC datetime string suitable for SQLite text comparison.
 */
export function computeExpiresAt(): string {
  return new Date(Date.now() + TTL_MS).toISOString();
}

/**
 * Check whether an ISO 8601 expiration timestamp is in the past.
 *
 * @param expiresAt - ISO 8601 datetime string to evaluate.
 * @returns `true` when the timestamp is before the current time.
 */
export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
