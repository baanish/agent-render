import {
  ArxDecodedPayloadTooLargeError,
  arx2CompressEnvelope,
  arx2DecompressEnvelope,
  arx3CompressEnvelope,
  arx3DecompressEnvelope,
  arxCompressPayloads,
  arxDecompress,
  getActiveArx2OverlayVersion,
  getActiveDictVersion,
  isExternalArx2OverlayDictionaryLoaded,
  isExternalDictionaryLoaded,
  loadArxDictionary,
  loadArx2OverlayDictionary,
  type ArxWirePayloads,
} from "@/lib/payload/arx-codec";
import { packEnvelope } from "@/lib/payload/wire-format";
import {
  compactTagForCodec,
  type ArxCodec,
  type PayloadCodec,
  type PayloadEnvelope,
} from "@/lib/payload/schema";

export type CandidateFragment = {
  value: string;
  codec: PayloadCodec;
  packed: boolean;
  transportLength: number;
};

type TransportLengthCalculator = (value: string) => number;

/** The four wire encodings every arx builder produces, in candidate order. */
const WIRE_ORDER = ["base76", "base1k", "baseBMP", "base64url"] as const satisfies readonly (keyof ArxWirePayloads)[];

/**
 * Turn an arx codec's four wire payloads into tagged candidates. Shared by all three arx builders,
 * which previously each re-spelled the tag prefix + transport-length + four-candidate list.
 *
 * `bmpUsesVisibleLength` budgets the dense baseBMP wire by visible URL length instead of percent-
 * escaped transport length — see the POLICY note on buildArx3Candidates for why arx3 does this.
 */
function wirePayloadsToCandidates(
  codec: ArxCodec,
  packed: boolean,
  payloads: ArxWirePayloads,
  computeTransportLength: TransportLengthCalculator,
  bmpUsesVisibleLength = false,
): CandidateFragment[] {
  const tag = compactTagForCodec(codec);
  return WIRE_ORDER.map((wire) => {
    const value = `${tag}${payloads[wire]}`;
    return {
      value,
      codec,
      packed,
      transportLength:
        bmpUsesVisibleLength && wire === "baseBMP" ? value.length : computeTransportLength(value),
    };
  });
}

let arxDictionaryLoadPromise: Promise<void> | null = null;
let arx2OverlayDictionaryLoadPromise: Promise<void> | null = null;

// Compact ARX fragments (tags `a`/`b`/`c`) do NOT carry a dictionary version — the tag implies the
// CURRENT dictionary, which keeps links short. The safety cost is that a build must not decode with
// a dictionary NEWER than it was built for (a CDN/asset split serving a future dictionary, or a
// version bump), because it would lack the new slots and could produce a structurally-valid-but-
// wrong envelope. We pin the newest supported version and reject anything newer so decode hard-fails
// instead of mis-decoding. The built-in fallback dictionary (version 0) and the current external
// dictionary (version 1) are both <= this and remain usable. Bumping a dictionary version is
// therefore a wire change that also requires new compact tags and updating
// tests/arx-dictionary-pin.test.ts.
const EXPECTED_ARX_DICTIONARY_VERSION = 1;
const EXPECTED_ARX2_OVERLAY_VERSION = 1;

function assertArxDictionaryNotNewerThanExpected(): void {
  const version = getActiveDictVersion();
  if (version > EXPECTED_ARX_DICTIONARY_VERSION) {
    throw new Error(
      `Active arx dictionary version ${version} is newer than this build supports (${EXPECTED_ARX_DICTIONARY_VERSION}); refusing to decode with a forward-incompatible dictionary.`,
    );
  }
}

function assertArx2OverlayNotNewerThanExpected(): void {
  const version = getActiveArx2OverlayVersion();
  if (version > EXPECTED_ARX2_OVERLAY_VERSION) {
    throw new Error(
      `Active arx2 overlay dictionary version ${version} is newer than this build supports (${EXPECTED_ARX2_OVERLAY_VERSION}); refusing to decode with a forward-incompatible dictionary.`,
    );
  }
}

async function ensureArxDictionaryLoaded(): Promise<void> {
  if (!isExternalDictionaryLoaded()) {
    arxDictionaryLoadPromise ??= loadArxDictionary()
      .then((version) => {
        if (version < 0) {
          // The external fetch failed and the built-in fallback is now active. Don't cache this, so
          // a later call can retry the external dictionary once the endpoint recovers; the current
          // call still proceeds (degraded) on the built-in dictionary rather than being poisoned.
          arxDictionaryLoadPromise = null;
        }
      })
      .catch((error) => {
        arxDictionaryLoadPromise = null;
        throw error;
      });
    await arxDictionaryLoadPromise;
  }

  // Runs for both fetched and injected (sync) dictionaries so a forward-incompatible skew can't slip
  // through whichever way the dictionary was loaded.
  assertArxDictionaryNotNewerThanExpected();
}

async function ensureArx2DictionariesLoaded(): Promise<void> {
  await ensureArxDictionaryLoaded();

  if (!isExternalArx2OverlayDictionaryLoaded()) {
    // Same retry-on-failure contract as the base dictionary (loadArx2OverlayDictionary also resolves
    // -1 on a transient fetch failure rather than rejecting).
    arx2OverlayDictionaryLoadPromise ??= loadArx2OverlayDictionary()
      .then((version) => {
        if (version < 0) {
          arx2OverlayDictionaryLoadPromise = null;
        }
      })
      .catch((error) => {
        arx2OverlayDictionaryLoadPromise = null;
        throw error;
      });
    await arx2OverlayDictionaryLoadPromise;
  }

  assertArx2OverlayNotNewerThanExpected();
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
  codec: ArxCodec,
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
  return wirePayloadsToCandidates("arx", packed, payloads, computeTransportLength);
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
  return wirePayloadsToCandidates("arx2", false, payloads, computeTransportLength);
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
  // The `true` budgets the dense baseBMP wire by visible URL length — see the POLICY note above.
  return wirePayloadsToCandidates("arx3", false, payloads, computeTransportLength, true);
}

/**
 * Decodes an ARX fragment remainder with the same versioned-payload fallback behavior as the main decoder.
 */
export async function decodeArxFragmentPayload(
  codec: ArxCodec,
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
