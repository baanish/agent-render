import { normalizeEnvelope } from "@/lib/payload/envelope";
import { isPayloadEnvelope, type ParsedPayload } from "@/lib/payload/schema";
import { unpackEnvelope } from "@/lib/payload/wire-format";

/**
 * Checks for a server-injected envelope set by the self-hosted viewer route.
 *
 * When the self-hosted server serves a UUID-based artifact page, it injects the stored
 * payload JSON into `window.__AGENT_RENDER_ENVELOPE__`. This function reads that global,
 * validates the envelope shape, and returns a `ParsedPayload` result compatible with the
 * fragment-decoded path.
 *
 * Returns `null` when no injected envelope is present or when running outside a browser.
 */
export function resolveInjectedEnvelope(): ParsedPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = (window as unknown as Record<string, unknown>).__AGENT_RENDER_ENVELOPE__;
  if (!raw) {
    return null;
  }

  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const unpacked = unpackEnvelope(obj);

    if (!isPayloadEnvelope(unpacked)) {
      return {
        ok: false,
        code: "invalid-envelope",
        message: "The injected payload did not match the expected envelope shape.",
      };
    }

    const normalized = normalizeEnvelope(unpacked);
    if (!normalized.ok) {
      return {
        ok: false,
        code: "invalid-envelope",
        message: normalized.message,
      };
    }

    return {
      ok: true,
      envelope: normalized.envelope,
      rawLength: typeof raw === "string" ? raw.length : JSON.stringify(raw).length,
    };
  } catch {
    return {
      ok: false,
      code: "invalid-json",
      message: "The injected payload could not be parsed as valid JSON.",
    };
  }
}
