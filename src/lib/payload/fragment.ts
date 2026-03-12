import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { normalizeEnvelope } from "@/lib/payload/envelope";
import { packEnvelope, unpackEnvelope } from "@/lib/payload/wire-format";
import { arxCompress, arxCompressUnicode, arxCompressBMP, arxDecompress } from "@/lib/payload/arx-codec";
import {
  codecs,
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
  preferPacked?: boolean;
  targetMaxFragmentLength?: number;
  codecPriority?: PayloadCodec[];
};

type CandidateFragment = {
  value: string;
  codec: PayloadCodec;
  packed: boolean;
};

function toBase64UrlBytes(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(input: string): string {
  return toBase64UrlBytes(new TextEncoder().encode(input));
}

function fromBase64Url(input: string): string {
  return new TextDecoder().decode(fromBase64UrlBytes(input));
}

function encodePayload(json: string, codec: PayloadCodec): string {
  switch (codec) {
    case "plain":
      return toBase64Url(json);
    case "lz":
      return compressToEncodedURIComponent(json);
    case "deflate":
      return toBase64UrlBytes(deflateSync(strToU8(json)));
    case "arx":
      throw new Error("arx codec requires async encoding — use encodeEnvelopeAsync instead.");
  }
}

function decodePayload(encoded: string, codec: PayloadCodec): string | null {
  switch (codec) {
    case "plain":
      return fromBase64Url(encoded);
    case "lz":
      return decompressFromEncodedURIComponent(encoded);
    case "deflate":
      return strFromU8(inflateSync(fromBase64UrlBytes(encoded)));
    case "arx":
      throw new Error("arx codec requires async decoding — use decodeFragmentAsync instead.");
  }
}

function buildFragment(envelope: PayloadEnvelope, codec: PayloadCodec, packed: boolean): string {
  const payloadEnvelope = { ...envelope, codec };
  const json = JSON.stringify(packed ? packEnvelope(payloadEnvelope) : payloadEnvelope);
  return `${PAYLOAD_FRAGMENT_KEY}=v1.${codec}.${encodePayload(json, codec)}`;
}

function getCandidateCodecs(options: EncodeOptions): PayloadCodec[] {
  if (options.codec) {
    return [options.codec];
  }

  if (options.preferCompressed === false) {
    return ["plain"];
  }

  const requested = options.codecPriority ?? ["deflate", "lz", "plain"];
  return requested.filter((codec, index) => requested.indexOf(codec) === index);
}

function getSyncCandidateCodecs(options: EncodeOptions): PayloadCodec[] {
  return getCandidateCodecs(options).filter((c) => c !== "arx");
}

function getAsyncCandidateCodecs(options: EncodeOptions): PayloadCodec[] {
  if (options.codec) {
    return [options.codec];
  }

  if (options.preferCompressed === false) {
    return ["plain"];
  }

  const requested = options.codecPriority ?? ["arx", "deflate", "lz", "plain"];
  return requested.filter((codec, index) => requested.indexOf(codec) === index);
}

function buildCandidates(envelope: PayloadEnvelope, options: EncodeOptions): CandidateFragment[] {
  const codecsToTry = getSyncCandidateCodecs(options);
  const wireModes = options.preferPacked === false ? [false] : [true, false];
  const candidates: CandidateFragment[] = [];

  for (const codec of codecsToTry) {
    for (const packed of wireModes) {
      candidates.push({
        value: buildFragment(envelope, codec, packed),
        codec,
        packed,
      });
    }
  }

  return candidates;
}

async function buildArxCandidates(envelope: PayloadEnvelope, packed: boolean): Promise<CandidateFragment[]> {
  const payloadEnvelope = { ...envelope, codec: "arx" as PayloadCodec };
  const json = JSON.stringify(packed ? packEnvelope(payloadEnvelope) : payloadEnvelope);
  const [ascii, unicode, bmp] = await Promise.all([
    arxCompress(json),
    arxCompressUnicode(json),
    arxCompressBMP(json),
  ]);
  return [
    { value: `${PAYLOAD_FRAGMENT_KEY}=v1.arx.${ascii}`, codec: "arx", packed },
    { value: `${PAYLOAD_FRAGMENT_KEY}=v1.arx.${unicode}`, codec: "arx", packed },
    { value: `${PAYLOAD_FRAGMENT_KEY}=v1.arx.${bmp}`, codec: "arx", packed },
  ];
}

async function buildCandidatesAsync(envelope: PayloadEnvelope, options: EncodeOptions): Promise<CandidateFragment[]> {
  const codecsToTry = getAsyncCandidateCodecs(options);
  const wireModes = options.preferPacked === false ? [false] : [true, false];
  const candidates: CandidateFragment[] = [];

  for (const codec of codecsToTry) {
    for (const packed of wireModes) {
      if (codec === "arx") {
        candidates.push(...await buildArxCandidates(envelope, packed));
      } else {
        candidates.push({
          value: buildFragment(envelope, codec, packed),
          codec,
          packed,
        });
      }
    }
  }

  return candidates;
}

function selectCandidate(candidates: CandidateFragment[], budget?: number): CandidateFragment {
  if (candidates.length === 0) {
    throw new Error("No payload codec candidates are available.");
  }

  const sorted = [...candidates].sort((a, b) => a.value.length - b.value.length);
  if (typeof budget !== "number") {
    return sorted[0];
  }

  const inBudget = sorted.find((candidate) => candidate.value.length <= budget);
  return inBudget ?? sorted[0];
}

export function encodeEnvelope(envelope: PayloadEnvelope, options: EncodeOptions = {}): string {
  const selected = selectCandidate(buildCandidates(envelope, options), options.targetMaxFragmentLength);
  return selected.value;
}

export async function encodeEnvelopeAsync(envelope: PayloadEnvelope, options: EncodeOptions = {}): Promise<string> {
  const candidates = await buildCandidatesAsync(envelope, options);
  const selected = selectCandidate(candidates, options.targetMaxFragmentLength);
  return selected.value;
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

  const firstDot = value.indexOf(".");
  const secondDot = value.indexOf(".", firstDot + 1);

  if (firstDot <= 0 || secondDot <= firstDot + 1 || secondDot >= value.length - 1) {
    return {
      ok: false,
      code: "invalid-format",
      message: "The fragment format is invalid. Expected v1.<codec>.<payload>.",
    };
  }

  const version = value.slice(0, firstDot);
  const codecRaw = value.slice(firstDot + 1, secondDot);
  const encoded = value.slice(secondDot + 1);

  if (version !== "v1") {
    return {
      ok: false,
      code: "invalid-format",
      message: "The fragment format is invalid. Expected v1.<codec>.<payload>.",
    };
  }

  if (!codecs.includes(codecRaw as PayloadCodec)) {
    return {
      ok: false,
      code: "invalid-format",
      message: `Unsupported codec "${codecRaw}". Supported codecs are ${codecs.join(", ")}.`,
    };
  }

  const codec = codecRaw as PayloadCodec;

  if (codec === "arx") {
    return {
      ok: false,
      code: "invalid-format",
      message: "arx codec requires async decoding — use decodeFragmentAsync instead.",
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

  return resolveEnvelope(parsed, fragment.length);
}

function resolveEnvelope(parsed: unknown, rawLength: number): ParsedPayload {
  const decodedEnvelope = unpackEnvelope(parsed);

  if (!isPayloadEnvelope(decodedEnvelope)) {
    return {
      ok: false,
      code: "invalid-envelope",
      message: "The decoded JSON did not match the payload envelope.",
    };
  }

  const normalized = normalizeEnvelope(decodedEnvelope);
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
    rawLength,
  };
}

export async function decodeFragmentAsync(hash: string): Promise<ParsedPayload> {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!fragment) {
    return { ok: false, code: "empty", message: "Add a fragment payload to start rendering artifacts." };
  }

  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    return { ok: false, code: "too-large", message: `This payload exceeds the supported fragment budget of ${MAX_FRAGMENT_LENGTH.toLocaleString()} characters.` };
  }

  const [key, value] = fragment.split("=", 2);

  if (key !== PAYLOAD_FRAGMENT_KEY || !value) {
    return { ok: false, code: "missing-key", message: `Expected a fragment starting with #${PAYLOAD_FRAGMENT_KEY}=...` };
  }

  const firstDot = value.indexOf(".");
  const secondDot = value.indexOf(".", firstDot + 1);

  if (firstDot <= 0 || secondDot <= firstDot + 1 || secondDot >= value.length - 1) {
    return { ok: false, code: "invalid-format", message: "The fragment format is invalid. Expected v1.<codec>.<payload>." };
  }

  const version = value.slice(0, firstDot);
  const codecRaw = value.slice(firstDot + 1, secondDot);
  const encoded = value.slice(secondDot + 1);

  if (version !== "v1") {
    return { ok: false, code: "invalid-format", message: "The fragment format is invalid. Expected v1.<codec>.<payload>." };
  }

  if (!codecs.includes(codecRaw as PayloadCodec)) {
    return { ok: false, code: "invalid-format", message: `Unsupported codec "${codecRaw}". Supported codecs are ${codecs.join(", ")}.` };
  }

  const codec = codecRaw as PayloadCodec;
  let parsed: unknown;

  try {
    let decodedJson: string | null;

    if (codec === "arx") {
      decodedJson = await arxDecompress(encoded);
    } else {
      decodedJson = decodePayload(encoded, codec);
    }

    if (decodedJson === null) {
      throw new Error("Decoded payload was empty.");
    }

    if (decodedJson.length > MAX_DECODED_PAYLOAD_LENGTH) {
      return { ok: false, code: "decoded-too-large", message: `The decoded payload exceeds the supported limit of ${MAX_DECODED_PAYLOAD_LENGTH.toLocaleString()} characters.` };
    }

    parsed = JSON.parse(decodedJson);
  } catch {
    return { ok: false, code: "invalid-json", message: "The fragment payload could not be decoded as valid JSON." };
  }

  return resolveEnvelope(parsed, fragment.length);
}
