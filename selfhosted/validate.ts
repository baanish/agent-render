/** Maximum length allowed for a stored payload string. */
const MAX_PAYLOAD_LENGTH = 500_000;

/** Result of payload validation. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validate that a payload string is acceptable for storage.
 *
 * Checks that the value is a non-empty string within the maximum length budget.
 * Does not perform full decode/envelope validation — that happens client-side
 * when the viewer renders the payload.
 *
 * @param payload - The raw payload string to validate.
 * @returns A validation result indicating success or the reason for rejection.
 */
export function validatePayload(payload: unknown): ValidationResult {
  if (typeof payload !== "string") {
    return { ok: false, message: "Payload must be a string." };
  }

  if (payload.length === 0) {
    return { ok: false, message: "Payload must not be empty." };
  }

  if (payload.length > MAX_PAYLOAD_LENGTH) {
    return {
      ok: false,
      message: `Payload exceeds the maximum allowed length of ${MAX_PAYLOAD_LENGTH.toLocaleString()} characters.`,
    };
  }

  return { ok: true };
}
