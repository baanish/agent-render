import {
  ArxDecodedPayloadTooLargeError,
  arx2CompressEnvelope,
  arx2DecompressEnvelope,
  arx3CompressEnvelope,
  arx3DecompressEnvelope,
  arxCompressPayloads,
  arxDecompress,
  isExternalArx2OverlayDictionaryLoaded,
  isExternalDictionaryLoaded,
  loadArxDictionary,
  loadArx2OverlayDictionary,
} from "@/lib/payload/arx-codec";
import { packEnvelope } from "@/lib/payload/wire-format";
import {
  compactTagForCodec,
  type PayloadCodec,
  type PayloadEnvelope,
} from "@/lib/payload/schema";

type CandidateFragment = {
  value: string;
  codec: PayloadCodec;
  packed: boolean;
  transportLength: number;
};

type TransportLengthCalculator = (value: string) => number;

let arxDictionaryLoadPromise: Promise<void> | null = null;
let arx2OverlayDictionaryLoadPromise: Promise<void> | null = null;

async function ensureArxDictionaryLoaded(): Promise<void> {
  if (isExternalDictionaryLoaded()) {
    return;
  }

  // Reset the cached promise on failure so a transient dictionary load error can be retried
  // instead of permanently poisoning every arx encode/decode for the page's lifetime.
  arxDictionaryLoadPromise ??= loadArxDictionary()
    .then(() => undefined)
    .catch((error) => {
      arxDictionaryLoadPromise = null;
      throw error;
    });
  await arxDictionaryLoadPromise;
}

async function ensureArx2DictionariesLoaded(): Promise<void> {
  await ensureArxDictionaryLoaded();

  if (isExternalArx2OverlayDictionaryLoaded()) {
    return;
  }

  arx2OverlayDictionaryLoadPromise ??= loadArx2OverlayDictionary()
    .then(() => undefined)
    .catch((error) => {
      arx2OverlayDictionaryLoadPromise = null;
      throw error;
    });
  await arx2OverlayDictionaryLoadPromise;
}

function decodeArxEncodedPayload(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function splitArxFragmentRemainder(remainder: string): {
  parsedDictVersion: number | null;
  versionedPayload: string;
} {
  const thirdDot = remainder.indexOf(".");
  const parsedDictVersion =
    thirdDot > 0 && /^\d+$/.test(remainder.slice(0, thirdDot))
      ? Number.parseInt(remainder.slice(0, thirdDot), 10)
      : null;

  return {
    parsedDictVersion,
    versionedPayload: parsedDictVersion === null ? remainder : remainder.slice(thirdDot + 1),
  };
}

async function decodeArxAttempt(
  codec: Extract<PayloadCodec, "arx" | "arx2" | "arx3">,
  encodedPayload: string,
): Promise<string | PayloadEnvelope> {
  if (codec === "arx") {
    return await arxDecompress(encodedPayload);
  }

  return codec === "arx2"
    ? await arx2DecompressEnvelope(encodedPayload)
    : await arx3DecompressEnvelope(encodedPayload);
}

function normalizeArxDecodeError(error: unknown): Error {
  if (error instanceof ArxDecodedPayloadTooLargeError) {
    throw error;
  }

  return error instanceof Error ? error : new Error("Unknown arx decode error");
}

/**
 * Builds deferred `arx` codec fragment candidates so the core fragment module stays light for non-ARX page loads.
 */
export async function buildArxCandidates(
  envelope: PayloadEnvelope,
  packed: boolean,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  await ensureArxDictionaryLoaded();

  const payloadEnvelope = { ...envelope, codec: "arx" as PayloadCodec };
  const json = JSON.stringify(
    packed ? packEnvelope(payloadEnvelope) : payloadEnvelope,
  );
  const payloads = await arxCompressPayloads(json);
  const makeCandidate = (payload: string): CandidateFragment => {
    const value = `${compactTagForCodec("arx")}${payload}`;
    return {
      value,
      codec: "arx",
      packed,
      transportLength: computeTransportLength(value),
    };
  };
  return [
    makeCandidate(payloads.base76),
    makeCandidate(payloads.base1k),
    makeCandidate(payloads.baseBMP),
    makeCandidate(payloads.base64url),
  ];
}

/**
 * Builds deferred `arx2` codec fragment candidates so tuple compression is loaded only for async ARX workflows.
 */
export async function buildArx2Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  await ensureArx2DictionariesLoaded();

  const payloadEnvelope = { ...envelope, codec: "arx2" as PayloadCodec };
  const payloads = await arx2CompressEnvelope(payloadEnvelope);
  const makeCandidate = (payload: string): CandidateFragment => {
    const value = `${compactTagForCodec("arx2")}${payload}`;
    return {
      value,
      codec: "arx2",
      packed: false,
      transportLength: computeTransportLength(value),
    };
  };
  return [
    makeCandidate(payloads.base76),
    makeCandidate(payloads.base1k),
    makeCandidate(payloads.baseBMP),
    makeCandidate(payloads.base64url),
  ];
}

/**
 * Builds deferred `arx3` codec fragment candidates.
 * ARX3 reuses the ARX2 tuple/overlay bytes; the only difference is how the dense baseBMP wire is
 * budgeted.
 *
 * POLICY (deliberate, owned decision — not an incidental mechanism): the arx3 baseBMP candidate is
 * budgeted by VISIBLE URL length (`value.length`), not by percent-escaped transport length, because
 * the fragment surface preserves Unicode and the visible characters are what a human actually copies
 * from the URL bar. Every other candidate in the shared pool — including arx2's byte-identical
 * baseBMP payload — is measured with `computeTransportLength`, which inflates BMP characters ~9x for
 * their UTF-8 percent-escaped size.
 *
 * CONSEQUENCE: because `selectCandidate` (fragment.ts) picks the global minimum transportLength,
 * arx3 baseBMP is therefore selected ahead of arx2's escaped-byte measurement for the same payload.
 * This is intended — it is how report-like artifacts stay human-copyable — and it means the arx3
 * baseBMP wire essentially always wins over arx2 by the metric, not by a real byte-size difference.
 *
 * CHANGING THIS REQUIRES A MAINTAINER DECISION: switching the arx3 baseBMP budget back to transport
 * length would make arx2 and arx3 measure the same payload identically and would change which wire
 * wins auto-selection. Do not flip the metric to "fix" the divergence without owning that trade-off.
 */
export async function buildArx3Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  await ensureArx2DictionariesLoaded();

  const payloadEnvelope = { ...envelope, codec: "arx3" as PayloadCodec };
  const payloads = await arx3CompressEnvelope(payloadEnvelope);
  const makeCandidate = (payload: string, preferVisibleChars = false): CandidateFragment => {
    const value = `${compactTagForCodec("arx3")}${payload}`;
    return {
      value,
      codec: "arx3",
      packed: false,
      // Deliberate metric choice (see POLICY above): the dense baseBMP wire is budgeted by visible
      // URL length, while every other candidate uses percent-escaped transport length.
      transportLength: preferVisibleChars ? value.length : computeTransportLength(value),
    };
  };
  return [
    makeCandidate(payloads.base76),
    makeCandidate(payloads.base1k),
    makeCandidate(payloads.baseBMP, true),
    makeCandidate(payloads.base64url),
  ];
}

/**
 * Decodes an ARX fragment remainder with the same versioned-payload fallback behavior as the main decoder.
 */
export async function decodeArxFragmentPayload(
  codec: Extract<PayloadCodec, "arx" | "arx2" | "arx3">,
  remainder: string,
): Promise<string | PayloadEnvelope> {
  if (codec === "arx3" || codec === "arx2") {
    await ensureArx2DictionariesLoaded();
  } else {
    await ensureArxDictionaryLoaded();
  }

  let lastError: Error | null = null;
  const { parsedDictVersion, versionedPayload } = splitArxFragmentRemainder(remainder);

  // For a correctly versioned fragment this first attempt (decoding the full remainder, including
  // the "<dictVersion>." prefix) is expected to fail at the decompressor — it exists only for
  // backward compatibility with pre-versioning links whose payload could itself begin with
  // "<digits>.". The versionedPayload attempt below is the real decode path for modern fragments.
  if (parsedDictVersion !== null) {
    try {
      return await decodeArxAttempt(codec, decodeArxEncodedPayload(remainder));
    } catch (error) {
      lastError = normalizeArxDecodeError(error);
    }
  }

  try {
    return await decodeArxAttempt(codec, decodeArxEncodedPayload(versionedPayload));
  } catch (error) {
    lastError = normalizeArxDecodeError(error);
  }

  throw lastError ?? new Error("Failed to decode arx fragment");
}
