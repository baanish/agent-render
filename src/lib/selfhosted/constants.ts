/** Default sliding time-to-live for self-hosted stored payloads: 24 hours in milliseconds. */
export const SELFHOSTED_TTL_MS = 24 * 60 * 60 * 1000;

/** Prefix-free UUID v4 matcher used by the self-hosted artifact API and route handling. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
