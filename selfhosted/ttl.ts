/** Default sliding time-to-live duration in hours (7 days). */
export const DEFAULT_TTL_HOURS = 7 * 24;

function configuredTtlHours(value: string | undefined): number {
  if (value === undefined) return DEFAULT_TTL_HOURS;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("AGENT_RENDER_TTL_HOURS must be a positive integer.");
  }

  const hours = Number(value);
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(hours * 60 * 60 * 1000)) {
    throw new Error("AGENT_RENDER_TTL_HOURS must be a positive integer.");
  }
  return hours;
}

/** Configured time-to-live duration in milliseconds. */
export const TTL_MS = configuredTtlHours(process.env.AGENT_RENDER_TTL_HOURS) * 60 * 60 * 1000;

/**
 * Compute an ISO 8601 expiration timestamp one configured TTL from now.
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
