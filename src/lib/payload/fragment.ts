import { normalizeEnvelope } from "@/lib/payload/envelope";
import {
  MAX_DECODED_PAYLOAD_LENGTH,
  MAX_FRAGMENT_LENGTH,
  PAYLOAD_FRAGMENT_KEY,
  type ParsedPayload,
  type PayloadCodec,
  type PayloadEnvelope,
  isPayloadEnvelope,
} from "@/lib/payload/schema";

type EncodeOptions = {
  codec?: PayloadCodec;
  preferCompressed?: boolean;
};

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

function encodePayload(json: string): string {
  return toBase64Url(json);
}

function decodePayload(encoded: string, codec: PayloadCodec): string | null {
  if (codec === "lz") {
    return null;
  }

  return fromBase64Url(encoded);
}

function buildFragment(envelope: PayloadEnvelope, codec: PayloadCodec): string {
  const payloadEnvelope = { ...envelope, codec };
  const json = JSON.stringify(payloadEnvelope);
  return `${PAYLOAD_FRAGMENT_KEY}=v1.${codec}.${encodePayload(json)}`;
}

export function encodeEnvelope(envelope: PayloadEnvelope, options: EncodeOptions = {}): string {
  if (options.codec === "lz") {
    return buildFragment(envelope, "plain");
  }

  if (options.codec) {
    return buildFragment(envelope, options.codec);
  }

  const plainFragment = buildFragment(envelope, "plain");
  if (options.preferCompressed === false) {
    return plainFragment;
  }

  return plainFragment;
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

  if (codec !== "plain" && codec !== "lz") {
    return {
      ok: false,
      code: "invalid-format",
      message: `Unsupported codec "${codec}". Supported codecs are plain and lz.`,
    };
  }

  if (codec === "lz") {
    return {
      ok: false,
      code: "invalid-format",
      message: 'Unsupported codec "lz". Please re-share using codec "plain".',
    };
  }

  let parsed: unknown;

  try {
    const decodedJson = decodePayload(encoded, codec);
    if (decodedJson === null) {
      throw new Error("Decoded payload was empty.");
    }

    if (decodedJson.length > MAX_DECODED_PAYLOAD_LENGTH) {
      return {
        ok: false,
        code: "decoded-too-large",
        message: `The decoded payload exceeds the supported limit of ${MAX_DECODED_PAYLOAD_LENGTH.toLocaleString()} characters.`,
      };
    }

    parsed = JSON.parse(decodedJson);
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
      message: "The decoded JSON did not match the payload envelope.",
    };
  }

  const normalized = normalizeEnvelope(parsed);
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
    rawLength: fragment.length,
  };
}
