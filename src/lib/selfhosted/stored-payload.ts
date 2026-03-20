import { UUID_V4_PATTERN } from "./constants.ts";

export type StoredPayloadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const STANDARD_PAYLOAD_PATTERN = /^agent-render=v1\.(plain|lz|deflate)\..+$/;
const ARX_PAYLOAD_PATTERN = /^agent-render=v1\.arx\.\d+\..+$/;

/**
 * Normalizes the stored self-hosted payload string into the fragment body expected by the viewer.
 *
 * Accepts the persisted canonical payload with or without a leading `#`, trims surrounding whitespace,
 * and always returns the fragment body without `#` so storage stays stable across API and server usage.
 */
export function normalizeStoredPayloadString(payload: string): string {
  return payload.trim().replace(/^#/, "");
}

/**
 * Validates that a self-hosted artifact id is a UUID v4 string.
 */
export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/**
 * Performs lightweight validation for stored payload strings before they are persisted in SQLite.
 *
 * Self-hosted mode stores the canonical fragment payload body as-is and reuses the client viewer to decode
 * and render it, so server-side validation focuses on accepting only known outer protocol shapes.
 */
export async function validateStoredPayloadString(payload: string): Promise<StoredPayloadValidationResult> {
  const normalized = normalizeStoredPayloadString(payload);

  if (!normalized) {
    return { ok: false, message: "Stored payload strings cannot be empty." };
  }

  if (STANDARD_PAYLOAD_PATTERN.test(normalized) || ARX_PAYLOAD_PATTERN.test(normalized)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "Stored payload strings must match the shipped agent-render fragment body format.",
  };
}
