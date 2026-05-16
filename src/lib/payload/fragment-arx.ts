import {
  ArxDecodedPayloadTooLargeError,
  arx2CompressEnvelope,
  arx2DecompressEnvelope,
  arx3CompressEnvelope,
  arx3DecompressEnvelope,
  arxCompressPayloads,
  arxDecompress,
  getActiveDictVersion,
  isExternalArx2OverlayDictionaryLoaded,
  isExternalDictionaryLoaded,
  loadArxDictionary,
  loadArx2OverlayDictionary,
} from "@/lib/payload/arx-codec";
import { packEnvelope } from "@/lib/payload/wire-format";
import {
  PAYLOAD_FRAGMENT_KEY,
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

  arxDictionaryLoadPromise ??= loadArxDictionary().then(() => undefined);
  await arxDictionaryLoadPromise;
}

async function ensureArx2DictionariesLoaded(): Promise<void> {
  await ensureArxDictionaryLoaded();

  if (isExternalArx2OverlayDictionaryLoaded()) {
    return;
  }

  arx2OverlayDictionaryLoadPromise ??= loadArx2OverlayDictionary().then(
    () => undefined,
  );
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
  const dictVersion = getActiveDictVersion();
  const payloads = await arxCompressPayloads(json);
  const makeCandidate = (payload: string): CandidateFragment => {
    const value = `${PAYLOAD_FRAGMENT_KEY}=v1.arx.${dictVersion}.${payload}`;
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
  const dictVersion = getActiveDictVersion();
  const payloads = await arx2CompressEnvelope(payloadEnvelope);
  const makeCandidate = (payload: string): CandidateFragment => {
    const value = `${PAYLOAD_FRAGMENT_KEY}=v1.arx2.${dictVersion}.${payload}`;
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
 * ARX3 uses the ARX2 tuple/overlay bytes, then lets the dense baseBMP wire compete by visible
 * URL length so large report-like artifacts can stay human-copyable when the surface preserves
 * Unicode fragments.
 */
export async function buildArx3Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  await ensureArx2DictionariesLoaded();

  const payloadEnvelope = { ...envelope, codec: "arx3" as PayloadCodec };
  const dictVersion = getActiveDictVersion();
  const payloads = await arx3CompressEnvelope(payloadEnvelope);
  const makeCandidate = (payload: string, preferVisibleChars = false): CandidateFragment => {
    const value = `${PAYLOAD_FRAGMENT_KEY}=v1.arx3.${dictVersion}.${payload}`;
    return {
      value,
      codec: "arx3",
      packed: false,
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
