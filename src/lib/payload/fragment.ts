import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { normalizeEnvelope } from "@/lib/payload/envelope";
import { packEnvelope, unpackEnvelope } from "@/lib/payload/wire-format";
import {
  arxCompress,
  arxCompressUnicode,
  arxCompressBMP,
  arxCompressBase64url,
  arxDecompress,
  getActiveDictVersion,
  uint8ArrayToBase64Url,
  base64UrlToUint8Array,
} from "@/lib/payload/arx-codec";
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

/**
 * Fast lookup: chat-safe ASCII chars that survive transport without percent-encoding.
 * Covers A-Z, a-z, 0-9, and the punctuation subset `-._~=#`.
 */
const CHAT_SAFE = new Uint8Array(128);
for (let c = 0x30; c <= 0x39; c++) CHAT_SAFE[c] = 1; // 0-9
for (let c = 0x41; c <= 0x5a; c++) CHAT_SAFE[c] = 1; // A-Z
for (let c = 0x61; c <= 0x7a; c++) CHAT_SAFE[c] = 1; // a-z
CHAT_SAFE[0x2d] = 1; // -
CHAT_SAFE[0x2e] = 1; // .
CHAT_SAFE[0x5f] = 1; // _
CHAT_SAFE[0x7e] = 1; // ~
CHAT_SAFE[0x3d] = 1; // =
CHAT_SAFE[0x23] = 1; // #

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
      len += CHAT_SAFE[cp] ? 1 : 3;
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

function toBase64Url(input: string): string {
  return uint8ArrayToBase64Url(new TextEncoder().encode(input));
}

function fromBase64Url(input: string): string {
  return new TextDecoder().decode(base64UrlToUint8Array(input));
}

function encodePayload(json: string, codec: PayloadCodec): string {
  switch (codec) {
    case "plain":
      return toBase64Url(json);
    case "lz":
      return compressToEncodedURIComponent(json);
    case "deflate":
      return uint8ArrayToBase64Url(deflateSync(strToU8(json)));
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
      return strFromU8(inflateSync(base64UrlToUint8Array(encoded)));
    case "arx":
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
  const candidates = getCandidateCodecs(options);

  if (candidates.length === 1 && candidates[0] === "arx") {
    return ["arx"];
  }

  return candidates.filter((c) => c !== "arx");
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
      candidates.push(buildFragment(envelope, codec, packed));
    }
  }

  return candidates;
}

async function buildArxCandidates(envelope: PayloadEnvelope, packed: boolean): Promise<CandidateFragment[]> {
  const payloadEnvelope = { ...envelope, codec: "arx" as PayloadCodec };
  const json = JSON.stringify(packed ? packEnvelope(payloadEnvelope) : payloadEnvelope);
  const dictVersion = getActiveDictVersion();
  const [ascii, unicode, bmp, b64url] = await Promise.all([
    arxCompress(json),
    arxCompressUnicode(json),
    arxCompressBMP(json),
    arxCompressBase64url(json),
  ]);
  const makeCandidate = (payload: string): CandidateFragment => {
    const value = `${PAYLOAD_FRAGMENT_KEY}=v1.arx.${dictVersion}.${payload}`;
    return { value, codec: "arx", packed, transportLength: computeTransportLength(value) };
  };
  return [makeCandidate(ascii), makeCandidate(unicode), makeCandidate(bmp), makeCandidate(b64url)];
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

  const sorted = [...candidates].sort((a, b) => a.transportLength - b.transportLength);
  if (typeof budget !== "number") {
    return sorted[0];
  }

  const inBudget = sorted.find((candidate) => candidate.transportLength <= budget);
  return inBudget ?? sorted[0];
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

function parseFragmentHeader(hash: string): ParsedFragmentHeader {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!fragment) {
    return { ok: false, errorResponse: { ok: false, code: "empty", message: "Add a fragment payload to start rendering artifacts." } };
  }

  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    return { ok: false, errorResponse: { ok: false, code: "too-large", message: `This payload exceeds the supported fragment budget of ${MAX_FRAGMENT_LENGTH.toLocaleString()} characters.` } };
  }

  const [key, value] = fragment.split("=", 2);

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

  if (!codecs.includes(codecRaw as PayloadCodec)) {
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

function decodeArxEncodedPayload(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}


function resolveArxDictVersion(version: number | null): boolean {
  if (version === null) {
    return true;
  }

  return version === getActiveDictVersion();
}

/**
 * Async fragment decoder that supports all codecs, including `arx`.
 *
 * Accepted input follows `#agent-render=v1...` where non-`arx` payloads use
 * `v1.<codec>.<payload>`, and `arx` supports `v1.arx.<dictVersion>.<payload>` (plus legacy
 * fallback forms). This decoder applies the same header and fragment-size checks as the sync
 * path, then enforces decoded payload size limits before JSON parsing and envelope validation.
 *
 * Returns structured `ParsedPayload` error responses for malformed fragments or invalid
 * envelopes, rather than throwing decode errors.
 */
export async function decodeFragmentAsync(hash: string): Promise<ParsedPayload> {
  const header = parseFragmentHeader(hash);
  if (!header.ok) {
    return header.errorResponse;
  }

  const { fragment, codec, encoded: remainder } = header;
  let parsed: unknown;

  try {
    let decodedJson: string | null;

    if (codec === "arx") {
      const thirdDot = remainder.indexOf(".");
      const parsedDictVersion =
        thirdDot > 0 && /^\d+$/.test(remainder.slice(0, thirdDot))
          ? Number.parseInt(remainder.slice(0, thirdDot), 10)
          : null;
      const versionedPayload = parsedDictVersion === null ? remainder : remainder.slice(thirdDot + 1);
      const fallbackPayload = remainder;
      const useVersionedPayload = resolveArxDictVersion(parsedDictVersion);
      const decodeAttempts = useVersionedPayload && parsedDictVersion !== null
        ? [decodeArxEncodedPayload(fallbackPayload), decodeArxEncodedPayload(versionedPayload)]
        : useVersionedPayload
          ? [decodeArxEncodedPayload(versionedPayload)]
          : [decodeArxEncodedPayload(fallbackPayload), decodeArxEncodedPayload(versionedPayload)];

      let lastError: Error | null = null;
      let decodedFromAttempt: string | null = null;

      for (const encodedAttempt of decodeAttempts) {
        try {
          decodedFromAttempt = await arxDecompress(encodedAttempt);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error("Unknown arx decode error");
        }
      }

      if (decodedFromAttempt === null) {
        throw lastError ?? new Error("Failed to decode arx fragment");
      }

      decodedJson = decodedFromAttempt;
    } else {
      decodedJson = decodePayload(remainder, codec);
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
