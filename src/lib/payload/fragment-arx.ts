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
import {
  arx4CompressEnvelope,
  arx4DecompressEnvelope,
  CURATED_PRIOR_IDS,
  EXPECTED_ARX4_PRIORS_VERSION,
  getActiveArx4PriorsVersion,
  loadArx4Priors,
} from "@/lib/payload/arx4-codec";
import { packEnvelope } from "@/lib/payload/wire-format";
import {
  compactTagForCodec,
  type ArxCodec,
  type PayloadCodec,
  type PayloadEnvelope,
} from "@/lib/payload/schema";

/**
 * One wire encoding, measured under both selection budgets so a single pool can serve both surfaces
 * without re-running the codec (arx4's context mixer costs ~770 ms for a 60 KB artifact).
 */
export type CandidateFragment = {
  value: string;
  codec: PayloadCodec;
  packed: boolean;
  /** Default budget: percent-escaped transport length, except the arx3/arx4 baseBMP wire. */
  transportLength: number;
  /** Budget for surfaces that URL-serialize the fragment: every wire percent-escaped. */
  urlSerializedLength: number;
};

type TransportLengthCalculator = (value: string) => number;

/** The four wire encodings every arx builder produces, in candidate order. */
const WIRE_ORDER = ["base76", "base1k", "baseBMP", "base64url"] as const satisfies readonly (keyof ArxWirePayloads)[];

/**
 * Turn an arx codec's four wire payloads into tagged candidates. Shared by all three arx builders,
 * which previously each re-spelled the tag prefix + transport-length + four-candidate list.
 *
 * `bmpUsesVisibleLength` gives the dense baseBMP wire its DEFAULT budget in visible URL characters
 * instead of percent-escaped transport length — see the POLICY note on buildArx3Candidates for why
 * arx3 and arx4 do this. `urlSerializedLength` is unaffected, so the caller can still budget that
 * same candidate by transport length for a URL-serializing surface.
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
    const urlSerializedLength = computeTransportLength(value);
    return {
      value,
      codec,
      packed,
      transportLength:
        bmpUsesVisibleLength && wire === "baseBMP" ? value.length : urlSerializedLength,
      urlSerializedLength,
    };
  });
}

let arxDictionaryLoadPromise: Promise<void> | null = null;
let arx2OverlayDictionaryLoadPromise: Promise<void> | null = null;
let arx4PriorsLoadPromise: Promise<void> | null = null;

// Compact ARX fragments (tags `a`/`b`/`c`/`e`) do NOT carry a dictionary version — the tag implies
// the CURRENT dictionary, which keeps links short. The safety cost is that a build must not decode
// with a dictionary NEWER than it was built for (a CDN/asset split serving a future dictionary, or a
// version bump), because it would lack the new slots and could produce a structurally-valid-but-
// wrong envelope. We pin the newest supported version and reject anything newer so decode hard-fails
// instead of mis-decoding. The built-in fallback dictionary (version 0) and the current external
// dictionary (version 1) are both <= this and remain usable. Bumping a dictionary version is
// therefore a wire change that also requires new compact tags and updating
// tests/arx-dictionary-pin.test.ts. arx4 depends on the same pin twice over, since its context-mixer
// prior is derived from the dictionary slot text as well as its substitution stage.
const EXPECTED_ARX_DICTIONARY_VERSION = 1;
const EXPECTED_ARX2_OVERLAY_VERSION = 1;
// The arx4 priors asset is pinned the same way and for the same reason, except that it tolerates no
// older version either: it has no built-in fallback table, so every version but the expected one is a
// corpus this build's fragments were never coded against. That pin lives on the codec that codes with
// it (EXPECTED_ARX4_PRIORS_VERSION in arx4-codec.ts); this module only drives the loader toward it.
//
// arx4 holds its DICTIONARIES to that same exact standard, which is where it parts ways with
// arx/arx2/arx3. They tolerate the built-in fallback (version 0) because substitution alone degrades
// predictably; arx4 also primes its context mixer on the dictionary slot text, so a fragment coded
// against any other dictionary is one that healthy viewers cannot decode at all. Both sides therefore
// hold out for the pinned pair: encode leaves the candidate pool, decode refuses.

/**
 * Thrown when an arx4 fragment reaches the decoder while the active dictionaries are not the exact
 * pinned pair, which a failed dictionary fetch (built-in fallback) or an asset-version skew both cause.
 * Fail closed and retryable: the same fragment decodes once the pinned dictionaries are active, whereas
 * coding it against the dictionary text at hand would return plausible garbage.
 */
export class Arx4DictionarySkewError extends Error {
  constructor(dictVersion: number, overlayVersion: number) {
    super(
      `The active arx dictionaries (base ${dictVersion}, overlay ${overlayVersion}) are not the pair arx4 is pinned to (base ${EXPECTED_ARX_DICTIONARY_VERSION}, overlay ${EXPECTED_ARX2_OVERLAY_VERSION}), so arx4 fragments cannot be coded.`,
    );
    this.name = "Arx4DictionarySkewError";
  }
}

/** True when both active dictionaries are exactly the versions arx4 codes against. */
function arx4DictionariesMatchPins(): boolean {
  return (
    getActiveDictVersion() === EXPECTED_ARX_DICTIONARY_VERSION &&
    getActiveArx2OverlayVersion() === EXPECTED_ARX2_OVERLAY_VERSION
  );
}

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

/**
 * Same retry-on-failure contract as the dictionaries, and never fatal: the codec degrades encoding to
 * the `s` prior when the expected-version asset is not there, so only a fragment that names a curated
 * prior fails, which is why this resolves instead of throwing.
 *
 * A version-skewed asset counts as not loaded, for both the early return and the caching: a CDN
 * mid-deploy can serve one and then the other, so neither side may pin the wrong corpus for the life
 * of the page when a refetch could still install the right one.
 */
async function loadArx4PriorsOnce(): Promise<void> {
  if (getActiveArx4PriorsVersion() === EXPECTED_ARX4_PRIORS_VERSION) return;

  arx4PriorsLoadPromise ??= loadArx4Priors()
    .then((version) => {
      if (version !== EXPECTED_ARX4_PRIORS_VERSION) {
        arx4PriorsLoadPromise = null;
      }
    })
    .catch((error) => {
      arx4PriorsLoadPromise = null;
      throw error;
    });
  await arx4PriorsLoadPromise;
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
  switch (codec) {
    case "arx":
      return await arxDecompress(encodedPayload);
    case "arx2":
      return await arx2DecompressEnvelope(encodedPayload);
    case "arx3":
      return await arx3DecompressEnvelope(encodedPayload);
    case "arx4":
      return arx4DecompressEnvelope(encodedPayload);
  }
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
 * The arx2/arx3/arx4 tuple wire format is pinned to the original artifact kinds — deployed decoders
 * throw on unknown kind codes — so envelopes carrying newer kinds (html, choices) must not mint
 * tuple-codec links. Returning false drops those codecs from the candidate pool (the same
 * fail-closed shape as the dictionary pin check) and lets arx/deflate/lz carry the envelope
 * instead. The JSON-based arx (v1) codec has no kind table and stays available.
 */
function tupleCodecsSupportEnvelope(envelope: PayloadEnvelope): boolean {
  for (const artifact of envelope.artifacts) {
    if (artifact.kind === "html" || artifact.kind === "choices") {
      return false;
    }
  }
  return true;
}

/**
 * Builds deferred `arx2` codec fragment candidates so tuple compression is loaded only for async ARX workflows.
 */
export async function buildArx2Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  if (!tupleCodecsSupportEnvelope(envelope)) return [];
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
 *
 * PER-SURFACE EXCEPTION: every candidate also carries `urlSerializedLength`, which measures the same
 * baseBMP wire by transport length, for surfaces that URL-serialize the fragment (markdown links
 * percent-encode baseBMP to ~9x). Selecting on that field is an additional surface-specific
 * selection, not a reversal of the default policy above: the primary copy-paste URL keeps the
 * visible-length budget.
 */
export async function buildArx3Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  if (!tupleCodecsSupportEnvelope(envelope)) return [];
  await ensureArx2DictionariesLoaded();

  const payloadEnvelope = { ...envelope, codec: "arx3" as PayloadCodec };
  const payloads = await arx3CompressEnvelope(payloadEnvelope);
  // Visible-length budgeting for the dense baseBMP wire — see the POLICY note above.
  return wirePayloadsToCandidates("arx3", false, payloads, computeTransportLength, true);
}

/**
 * Builds deferred `arx4` codec fragment candidates.
 * ARX4 reuses the ARX3 tuple/overlay stages and its baseBMP budgeting policy; it swaps Brotli for the
 * context mixer in arx4-codec.ts and puts a prior id char in front of the wire payload, so a
 * candidate reads `<tag><priorId><wirePayload>`.
 */
export async function buildArx4Candidates(
  envelope: PayloadEnvelope,
  computeTransportLength: TransportLengthCalculator,
): Promise<CandidateFragment[]> {
  if (!tupleCodecsSupportEnvelope(envelope)) return [];
  await ensureArx2DictionariesLoaded();
  // Off the pinned dictionaries, arx4 contributes nothing rather than minting a link no healthy viewer
  // can decode. Dropping out of the pool (instead of throwing) keeps the other codecs' candidates, the
  // same reason the priors load below resolves; an explicitly requested arx4 then has no candidate,
  // which is the honest fail-closed answer.
  if (!arx4DictionariesMatchPins()) return [];

  // Resolving rather than throwing on a failed or skewed priors load matters here: these candidates
  // share one pool with arx3/arx2/arx/deflate (`buildCandidatesAsync` builds them through the same
  // loop), so a throw would take link creation down over a codec the encoder is free to degrade.
  // arx4CompressEnvelope owns that degrade, and emits the `s` id it really coded with.
  await loadArx4PriorsOnce();

  const payloadEnvelope = { ...envelope, codec: "arx4" as PayloadCodec };
  const payloads = arx4CompressEnvelope(payloadEnvelope);
  return wirePayloadsToCandidates("arx4", false, payloads, computeTransportLength, true);
}

/**
 * Decodes an ARX fragment remainder with the same versioned-payload fallback behavior as the main decoder.
 */
export async function decodeArxFragmentPayload(
  codec: ArxCodec,
  remainder: string,
): Promise<string | PayloadEnvelope> {
  if (codec === "arx") {
    await ensureArxDictionaryLoaded();
  } else {
    await ensureArx2DictionariesLoaded();
  }

  if (codec === "arx4" && !arx4DictionariesMatchPins()) {
    throw new Arx4DictionarySkewError(getActiveDictVersion(), getActiveArx2OverlayVersion());
  }

  let lastError: Error | null = null;
  const { parsedDictVersion, versionedPayload } = splitArxFragmentRemainder(remainder);
  const decodedPayload = decodeArxEncodedPayload(versionedPayload);

  // Only fragments naming a curated prior (the first payload char) need the priors asset; s and n
  // fragments decode without it, so they must not trigger the fetch. A curated fragment that the
  // fetch cannot serve at the expected version fails in the codec, which is the retryable outcome:
  // decoding it against a skewed corpus would return plausible garbage instead.
  //
  // The char is read AFTER percent-decoding, so this routes on what the decoder will really see: a
  // re-encoding proxy or a handcrafted fragment can deliver `%6d` where the app writes `m`, and routing
  // on the raw char would leave that fragment asking for an asset nothing ever fetches.
  const priorIdChar = decodedPayload.charAt(0);
  if (codec === "arx4" && CURATED_PRIOR_IDS.some((priorId) => priorId === priorIdChar)) {
    await loadArx4PriorsOnce();
  }

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
    return await decodeArxAttempt(codec, decodedPayload);
  } catch (error) {
    lastError = normalizeArxDecodeError(error);
  }

  throw lastError ?? new Error("Failed to decode arx fragment");
}
