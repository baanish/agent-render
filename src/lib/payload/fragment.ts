import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { normalizeEnvelope } from "@/lib/payload/envelope";
import { packEnvelope, unpackEnvelope } from "@/lib/payload/wire-format";
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
  transportLength: number;
};

const BINARY_STRING_CHUNK_SIZE = 0x8000;
const DEFAULT_SYNC_CODEC_PRIORITY: readonly PayloadCodec[] = ["deflate", "lz", "plain"];
const DEFAULT_ASYNC_CODEC_PRIORITY: readonly PayloadCodec[] = ["arx2", "arx", "deflate", "lz", "plain"];
const PACKED_WIRE_MODES: readonly boolean[] = [true, false];
const UNPACKED_ONLY_WIRE_MODES: readonly boolean[] = [false];
const supportedCodecSet = new Set<string>(codecs);

function isChatSafeAsciiFragmentCodePoint(cp: number): boolean {
  return (
    (cp >= 48 && cp <= 57) ||
    (cp >= 65 && cp <= 90) ||
    (cp >= 97 && cp <= 122) ||
    cp === 35 || // #
    cp === 45 || // -
    cp === 46 || // .
    cp === 61 || // =
    cp === 95 || // _
    cp === 126 // ~
  );
}

/**
 * Computes the serialized length of a fragment value after conservative transport escaping.
 *
 * We count non-ASCII code points by their UTF-8 percent-encoded size, and we also treat
 * ASCII punctuation outside the URL-unreserved fragment subset as escape-prone because many
 * chat/link surfaces rewrite those characters even when a browser would accept them in-place.
 * This keeps auto-selection aligned with the product's chat-safe fragment goal, allowing the
 * `B.` base64url ARX wire shape to win when punctuation-heavy base76 would grow after sharing.
 */
function computeTransportLength(value: string): number {
  let len = 0;
  for (let i = 0; i < value.length; i++) {
    const cp = value.codePointAt(i)!;
    if (cp < 128) {
      len += isChatSafeAsciiFragmentCodePoint(cp) ? 1 : 3;
    } else if (cp < 0x800) {
      len += 6; // 2 UTF-8 bytes → %XX%XX
    } else if (cp < 0x10000) {
      len += 9; // 3 UTF-8 bytes → %XX%XX%XX
    } else {
      len += 12; // 4 UTF-8 bytes → %XX%XX%XX%XX (surrogate pair)
      i++; // skip low surrogate
    }
  }
  return len;
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BINARY_STRING_CHUNK_SIZE)));
  }
  const binary = chunks.join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
    case "arx2":
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
    case "arx2":
      throw new Error("arx codec requires async decoding — use decodeFragmentAsync instead.");
  }
}

function buildFragment(envelope: PayloadEnvelope, codec: PayloadCodec, packed: boolean): CandidateFragment {
  const payloadEnvelope = { ...envelope, codec };
  const json = JSON.stringify(packed ? packEnvelope(payloadEnvelope) : payloadEnvelope);
  const value = `${PAYLOAD_FRAGMENT_KEY}=v1.${codec}.${encodePayload(json, codec)}`;
  // Non-ARX codecs produce ASCII-only output, so transport length equals string length.
  return { value, codec, packed, transportLength: value.length };
}

function dedupeCodecs(requested: readonly PayloadCodec[]): PayloadCodec[] {
  const seen = new Set<PayloadCodec>();
  const unique: PayloadCodec[] = [];

  for (const codec of requested) {
    if (seen.has(codec)) {
      continue;
    }

    seen.add(codec);
    unique.push(codec);
  }

  return unique;
}

function getCandidateCodecs(options: EncodeOptions, defaultPriority: readonly PayloadCodec[]): readonly PayloadCodec[] {
  if (options.codec) {
    return [options.codec];
  }

  if (options.preferCompressed === false) {
    return ["plain"];
  }

  return options.codecPriority ? dedupeCodecs(options.codecPriority) : defaultPriority;
}

function getSyncCandidateCodecs(options: EncodeOptions): readonly PayloadCodec[] {
  const candidates = getCandidateCodecs(options, DEFAULT_SYNC_CODEC_PRIORITY);
  const syncCandidates: PayloadCodec[] = [];

  for (const codec of candidates) {
    if (codec !== "arx" && codec !== "arx2") {
      syncCandidates.push(codec);
    }
  }

  return syncCandidates.length === 0 && candidates.length === 1 ? candidates : syncCandidates;
}

function getAsyncCandidateCodecs(options: EncodeOptions): readonly PayloadCodec[] {
  return getCandidateCodecs(options, DEFAULT_ASYNC_CODEC_PRIORITY);
}

function buildCandidates(envelope: PayloadEnvelope, options: EncodeOptions): CandidateFragment[] {
  const codecsToTry = getSyncCandidateCodecs(options);
  const wireModes = options.preferPacked === false ? UNPACKED_ONLY_WIRE_MODES : PACKED_WIRE_MODES;
  const candidates: CandidateFragment[] = [];

  for (const codec of codecsToTry) {
    for (const packed of wireModes) {
      candidates.push(buildFragment(envelope, codec, packed));
    }
  }

  return candidates;
}

async function buildArxCandidates(envelope: PayloadEnvelope, packed: boolean): Promise<CandidateFragment[]> {
  const { buildArxCandidates: buildDeferredArxCandidates } = await import("@/lib/payload/fragment-arx");
  return buildDeferredArxCandidates(envelope, packed, computeTransportLength);
}

async function buildArx2Candidates(envelope: PayloadEnvelope): Promise<CandidateFragment[]> {
  const { buildArx2Candidates: buildDeferredArx2Candidates } = await import("@/lib/payload/fragment-arx");
  return buildDeferredArx2Candidates(envelope, computeTransportLength);
}

async function buildCandidatesAsync(envelope: PayloadEnvelope, options: EncodeOptions): Promise<CandidateFragment[]> {
  const codecsToTry = getAsyncCandidateCodecs(options);
  const wireModes = options.preferPacked === false ? UNPACKED_ONLY_WIRE_MODES : PACKED_WIRE_MODES;
  const candidates: CandidateFragment[] = [];

  for (const codec of codecsToTry) {
    if (codec === "arx2") {
      candidates.push(...await buildArx2Candidates(envelope));
      continue;
    }

    for (const packed of wireModes) {
      if (codec === "arx") {
        candidates.push(...await buildArxCandidates(envelope, packed));
      } else {
        candidates.push(buildFragment(envelope, codec, packed));
      }
    }
  }

  return candidates;
}

function selectCandidate(candidates: CandidateFragment[], budget?: number): CandidateFragment {
  if (candidates.length === 0) {
    throw new Error("No payload codec candidates are available.");
  }

  let shortest = candidates[0];
  let shortestInBudget: CandidateFragment | null = null;

  for (const candidate of candidates) {
    if (candidate.transportLength < shortest.transportLength) {
      shortest = candidate;
    }

    if (
      typeof budget === "number" &&
      candidate.transportLength <= budget &&
      (!shortestInBudget || candidate.transportLength < shortestInBudget.transportLength)
    ) {
      shortestInBudget = candidate;
    }
  }

  if (typeof budget !== "number") {
    return shortest;
  }

  return shortestInBudget ?? shortest;
}

/**
 * Encodes a payload envelope into the fragment body expected after `#`, for example
 * `agent-render=v1.deflate.<payload>`.
 *
 * The sync encoder supports `plain`, `lz`, and `deflate` codecs. If options explicitly
 * require `arx`, this function throws because `arx` compression is async-only.
 *
 * Candidate encodings are generated across enabled codecs (and packed/unpacked wire
 * transport variants) and the shortest transport length is selected, or the shortest option
 * that fits `targetMaxFragmentLength` when provided.
 */
export function encodeEnvelope(envelope: PayloadEnvelope, options: EncodeOptions = {}): string {
  const selected = selectCandidate(buildCandidates(envelope, options), options.targetMaxFragmentLength);
  return selected.value;
}

/**
 * Async variant of {@link encodeEnvelope} that also supports `arx` candidates.
 *
 * Returns the fragment body string expected after `#`, for example
 * `agent-render=v1.arx.<dictVersion>.<payload>` for `arx`, or
 * `agent-render=v1.<codec>.<payload>` for `plain|lz|deflate`.
 *
 * Like the sync version, candidate encodings are generated across enabled codecs and packed
 * transport variants, then the smallest transport representation is selected (or the smallest
 * candidate within `targetMaxFragmentLength`, when available).
 */
export async function encodeEnvelopeAsync(envelope: PayloadEnvelope, options: EncodeOptions = {}): Promise<string> {
  const candidates = await buildCandidatesAsync(envelope, options);
  const selected = selectCandidate(candidates, options.targetMaxFragmentLength);
  return selected.value;
}

type ParsedFragmentHeader =
  | { ok: false; errorResponse: ParsedPayload }
  | { ok: true; fragment: string; version: string; codec: PayloadCodec; encoded: string; fragmentLength: number };

type DecodeOptions = {
  /** Skip the fragment transport size budget check (for server-injected payloads). */
  skipFragmentBudget?: boolean;
};

function parseFragmentHeader(hash: string, options?: DecodeOptions): ParsedFragmentHeader {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!fragment) {
    return { ok: false, errorResponse: { ok: false, code: "empty", message: "Add a fragment payload to start rendering artifacts." } };
  }

  if (!options?.skipFragmentBudget && fragment.length > MAX_FRAGMENT_LENGTH) {
    return { ok: false, errorResponse: { ok: false, code: "too-large", message: `This payload exceeds the supported fragment budget of ${MAX_FRAGMENT_LENGTH.toLocaleString()} characters.` } };
  }

  const separatorIndex = fragment.indexOf("=");
  const key = separatorIndex === -1 ? fragment : fragment.slice(0, separatorIndex);
  const value = separatorIndex === -1 ? "" : fragment.slice(separatorIndex + 1);

  if (key !== PAYLOAD_FRAGMENT_KEY || !value) {
    return { ok: false, errorResponse: { ok: false, code: "missing-key", message: `Expected a fragment starting with #${PAYLOAD_FRAGMENT_KEY}=...` } };
  }

  const firstDot = value.indexOf(".");
  const secondDot = value.indexOf(".", firstDot + 1);

  if (firstDot <= 0 || secondDot <= firstDot + 1 || secondDot >= value.length - 1) {
    return { ok: false, errorResponse: { ok: false, code: "invalid-format", message: "The fragment format is invalid. Expected v1.<codec>.<payload>." } };
  }

  const version = value.slice(0, firstDot);
  const codecRaw = value.slice(firstDot + 1, secondDot);
  const encoded = value.slice(secondDot + 1);

  if (version !== "v1") {
    return { ok: false, errorResponse: { ok: false, code: "invalid-format", message: "The fragment format is invalid. Expected v1.<codec>.<payload>." } };
  }

  if (!supportedCodecSet.has(codecRaw)) {
    return { ok: false, errorResponse: { ok: false, code: "invalid-format", message: `Unsupported codec "${codecRaw}". Supported codecs are ${codecs.join(", ")}.` } };
  }

  return { ok: true, fragment, version, codec: codecRaw as PayloadCodec, encoded, fragmentLength: fragment.length };
}

/**
 * Decodes a fragment string (with or without leading `#`) into a parsed payload result.
 *
 * Expected fragment format is `#agent-render=v1.<codec>.<payload>`. Validation first enforces
 * fragment-key and shape checks and the global fragment size budget. On failure, returns a
 * structured `ParsedPayload` error (`empty`, `missing-key`, `invalid-format`, `too-large`,
 * `invalid-json`, `decoded-too-large`, or `invalid-envelope`) instead of throwing.
 *
 * Sync decoding supports `plain`, `lz`, and `deflate` codecs only. `arx` fragments return an
 * `invalid-format` result instructing callers to use {@link decodeFragmentAsync}.
 */
export function decodeFragment(hash: string): ParsedPayload {
  const header = parseFragmentHeader(hash);
  if (!header.ok) {
    return header.errorResponse;
  }

  const { fragment, codec, encoded } = header;

  if (codec === "arx" || codec === "arx2") {
    return {
      ok: false,
      code: "invalid-format",
      message: "arx codecs require async decoding — use decodeFragmentAsync instead.",
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

/**
 * Async fragment decoder that supports all codecs, including `arx`.
 *
 * Accepted input follows `#agent-render=v1...` where non-`arx` payloads use
 * `v1.<codec>.<payload>`, and `arx` supports `v1.arx.<dictVersion>.<payload>` (plus legacy
 * fallback forms). This decoder applies the same header and fragment-size checks as the sync
 * path, then enforces decoded payload size limits before JSON parsing and envelope validation.
 *
 * Pass `{ skipFragmentBudget: true }` to bypass the fragment transport size check,
 * for example when decoding server-injected payloads that are not constrained by URL length.
 *
 * Returns structured `ParsedPayload` error responses for malformed fragments or invalid
 * envelopes, rather than throwing decode errors.
 */
export async function decodeFragmentAsync(hash: string, options?: DecodeOptions): Promise<ParsedPayload> {
  const header = parseFragmentHeader(hash, options);
  if (!header.ok) {
    return header.errorResponse;
  }

  const { fragment, codec, encoded: remainder } = header;
  let parsed: unknown;

  try {
    let decodedJson: string | null;

    if (codec === "arx" || codec === "arx2") {
      const { decodeArxFragmentPayload } = await import("@/lib/payload/fragment-arx");
      const decodedFromAttempt = await decodeArxFragmentPayload(codec, remainder);

      if (codec === "arx2") {
        parsed = decodedFromAttempt;
        decodedJson = null;
      } else {
        decodedJson = decodedFromAttempt as string;
      }
    } else {
      decodedJson = decodePayload(remainder, codec);
    }

    if (parsed === undefined && decodedJson === null) {
      throw new Error("Decoded payload was empty.");
    }

    if (decodedJson !== null && decodedJson.length > MAX_DECODED_PAYLOAD_LENGTH) {
      return { ok: false, code: "decoded-too-large", message: `The decoded payload exceeds the supported limit of ${MAX_DECODED_PAYLOAD_LENGTH.toLocaleString()} characters.` };
    }

    if (decodedJson !== null) {
      parsed = JSON.parse(decodedJson);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "ArxDecodedPayloadTooLargeError") {
      return { ok: false, code: "decoded-too-large", message: error.message };
    }
    return { ok: false, code: "invalid-json", message: "The fragment payload could not be decoded as valid JSON." };
  }

  return resolveEnvelope(parsed, fragment.length);
}
