import { MAX_FRAGMENT_LENGTH, PAYLOAD_FRAGMENT_KEY, type ParsedPayload, type PayloadEnvelope, isPayloadEnvelope } from "@/lib/payload/schema";

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeEnvelope(envelope: PayloadEnvelope): string {
  const json = JSON.stringify(envelope);
  return `${PAYLOAD_FRAGMENT_KEY}=v1.${envelope.codec}.${toBase64Url(json)}`;
}

export function decodeFragment(hash: string): ParsedPayload {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!fragment) {
    return {
      ok: false,
      code: "empty",
      message: "Add a fragment payload to start rendering artifacts.",
    };
  }

  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    return {
      ok: false,
      code: "too-large",
      message: `This payload exceeds the supported fragment budget of ${MAX_FRAGMENT_LENGTH.toLocaleString()} characters.`,
    };
  }

  const [key, value] = fragment.split("=", 2);

  if (key !== PAYLOAD_FRAGMENT_KEY || !value) {
    return {
      ok: false,
      code: "missing-key",
      message: `Expected a fragment starting with #${PAYLOAD_FRAGMENT_KEY}=...`,
    };
  }

  const [version, codec, encoded] = value.split(".", 3);

  if (version !== "v1" || !codec || !encoded) {
    return {
      ok: false,
      code: "invalid-format",
      message: "The fragment format is invalid. Expected v1.<codec>.<payload>.",
    };
  }

  if (codec !== "plain") {
    return {
      ok: false,
      code: "invalid-format",
      message: `Unsupported codec \"${codec}\". Phase 1 currently supports plain payloads only.`,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fromBase64Url(encoded));
  } catch {
    return {
      ok: false,
      code: "invalid-json",
      message: "The fragment payload could not be decoded as valid JSON.",
    };
  }

  if (!isPayloadEnvelope(parsed)) {
    return {
      ok: false,
      code: "invalid-envelope",
      message: "The decoded JSON did not match the Phase 1 payload envelope.",
    };
  }

  return {
    ok: true,
    envelope: parsed,
    rawLength: fragment.length,
  };
}
