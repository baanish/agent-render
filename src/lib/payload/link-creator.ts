import { normalizeEnvelope } from "@/lib/payload/envelope";
import {
  encodeEnvelope,
  encodeEnvelopeSurfacesAsync,
  getFragmentTransportLength,
  getVisibleFragmentLength,
} from "@/lib/payload/fragment";
import { buildMarkdownLinkShareInfo } from "@/lib/markdown-link";
import {
  codecForCompactTag,
  codecs,
  MAX_FRAGMENT_LENGTH,
  PAYLOAD_FRAGMENT_KEY,
  type ArtifactKind,
  type ArtifactPayload,
  type DiffArtifact,
  type PayloadCodec,
  type PayloadEnvelope,
} from "@/lib/payload/schema";

export type LinkCreatorDraft = {
  kind: ArtifactKind;
  title: string;
  filename: string;
  content: string;
  language: string;
  diffView: DiffArtifact["view"];
  codec?: PayloadCodec | "auto";
};

export type GeneratedArtifactLink = {
  envelope: PayloadEnvelope;
  artifact: ArtifactPayload;
  codec: PayloadCodec;
  hash: string;
  url: string;
  fragmentLength: number;
  /**
   * URL used inside `markdownLink`. Markdown links pass through URL serializers that
   * percent-encode non-ASCII fragments (3 UTF-8 bytes become 9 chars), so this may use an
   * unpacked ASCII wire encoding of the same payload when that survives transport smaller.
   */
  markdownUrl: string;
  markdownLink: string;
  markdownLinkLength: number;
  discordMarkdownLinkWarning: string | null;
};

const NON_WHITESPACE_PATTERN = /\S/;
const supportedCodecSet = new Set<string>(codecs);

function normalizeOptionalField(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function slugifyId(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "artifact";
}

function getDraftHeading(kind: ArtifactKind, title?: string, filename?: string) {
  return title ?? filename ?? `Untitled ${kind}`;
}

function getArtifactId(kind: ArtifactKind, title?: string, filename?: string) {
  const filenameStem = filename?.replace(/\.[^./\\]+$/, "");
  return slugifyId(title ?? filenameStem ?? kind);
}

function buildArtifact(draft: LinkCreatorDraft): ArtifactPayload {
  const title = normalizeOptionalField(draft.title);
  const filename = normalizeOptionalField(draft.filename);
  const id = getArtifactId(draft.kind, title, filename);

  if (!NON_WHITESPACE_PATTERN.test(draft.content)) {
    throw new Error(draft.kind === "diff" ? "Paste a diff patch before generating a link." : "Paste some content before generating a link.");
  }

  if (draft.kind === "diff") {
    return {
      id,
      kind: "diff",
      title,
      filename,
      patch: draft.content,
      view: draft.diffView,
    };
  }

  if (draft.kind === "code") {
    return {
      id,
      kind: "code",
      title,
      filename,
      content: draft.content,
      language: normalizeOptionalField(draft.language),
    };
  }

  return {
    id,
    kind: draft.kind,
    title,
    filename,
    content: draft.content,
  };
}

function getFragmentCodec(fragmentBody: string): PayloadCodec {
  // Legacy header: agent-render=v1.<codec>.<payload>
  const legacyPrefix = `${PAYLOAD_FRAGMENT_KEY}=v1.`;
  if (fragmentBody.startsWith(legacyPrefix)) {
    const codecEnd = fragmentBody.indexOf(".", legacyPrefix.length);
    if (codecEnd === -1) {
      return "plain";
    }

    const codec = fragmentBody.slice(legacyPrefix.length, codecEnd);
    return supportedCodecSet.has(codec) ? (codec as PayloadCodec) : "plain";
  }

  // Compact header: a single leading tag char encodes the codec.
  return codecForCompactTag(fragmentBody.charAt(0)) ?? "plain";
}

function buildGeneratedLinkShareInfo(envelope: PayloadEnvelope, url: string) {
  const label = envelope.title ?? envelope.artifacts[0]?.title ?? envelope.artifacts[0]?.id ?? url;
  return buildMarkdownLinkShareInfo(label, url);
}

/**
 * Builds a single-artifact payload envelope from link-creator draft input.
 *
 * Throws when the draft content/body is empty (including whitespace-only input). Returned
 * envelopes are not yet validated for bundle invariants; callers should run
 * {@link normalizeEnvelope} before encoding.
 */
export function createDraftEnvelope(draft: LinkCreatorDraft): PayloadEnvelope {
  const artifact = buildArtifact(draft);

  return {
    v: 1,
    codec: "plain",
    title: getDraftHeading(draft.kind, artifact.title, artifact.filename),
    activeArtifactId: artifact.id,
    artifacts: [artifact],
  };
}

/**
 * Generates a shareable artifact link from draft input using sync codecs.
 *
 * Throws when draft content is empty, envelope normalization fails, or the generated fragment
 * exceeds `MAX_FRAGMENT_LENGTH`. The returned object always includes:
 * - `hash`: compact `#<tag><payload>` fragment string (single codec tag char + payload)
 * - `url`: either the hash-only URL or `baseUrl` with hash attached
 * - `codec`: the selected wire codec in the generated fragment
 * - `fragmentLength`: character count excluding the leading `#`
 * - `envelope` and `artifact`: the normalized payload envelope and its single artifact
 */
export function createGeneratedArtifactLink(draft: LinkCreatorDraft, baseUrl?: string): GeneratedArtifactLink {
  const normalized = normalizeEnvelope(createDraftEnvelope(draft));

  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const fragmentBody = encodeEnvelope(normalized.envelope);
  // Sync codecs already emit ASCII wire shapes, so the same fragment serves both surfaces.
  return assembleGeneratedLink(normalized.envelope, fragmentBody, fragmentBody, baseUrl);
}

/**
 * Async variant of {@link createGeneratedArtifactLink} that can leverage the ARX family of async
 * codecs via {@link encodeEnvelopeSurfacesAsync}, which encodes once and returns both the
 * copy-paste and markdown-destination winners.
 *
 * Error and return semantics match the sync variant: throws on invalid draft/normalized payload
 * or over-budget fragments, and returns `{ hash, url, codec, fragmentLength, envelope, artifact }`.
 */
export async function createGeneratedArtifactLinkAsync(draft: LinkCreatorDraft, baseUrl?: string): Promise<GeneratedArtifactLink> {
  const normalized = normalizeEnvelope(createDraftEnvelope(draft));

  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const encodeOptions = draft.codec && draft.codec !== "auto" ? { codec: draft.codec } : {};
  const surfaces = await encodeEnvelopeSurfacesAsync(normalized.envelope, encodeOptions);
  return assembleGeneratedLink(
    normalized.envelope,
    surfaces.fragmentBody,
    surfaces.transportFragmentBody,
    baseUrl,
  );
}

/**
 * Assemble a {@link GeneratedArtifactLink} from an already-encoded fragment body. The sync and async
 * creators differ only in how `fragmentBody` is produced; everything downstream (budget check, URL,
 * share info, result shape) lives here once.
 */
function toFragmentUrl(fragmentBody: string, baseUrl?: string): string {
  if (!baseUrl) {
    return `#${fragmentBody}`;
  }

  // Concatenate instead of assigning nextUrl.hash: the URL serializer percent-encodes
  // non-ASCII fragments, which would hand Copy link a 3x longer string than the visible
  // form the fragment budget counts (and that Discord receives on paste).
  const nextUrl = new URL(baseUrl);
  nextUrl.hash = "";
  return `${nextUrl.toString()}#${fragmentBody}`;
}

/**
 * Picks the fragment used inside markdown links. Markdown destinations get URL-serialized,
 * which percent-encodes packed (non-ASCII) fragments to triple size, so the unpacked
 * candidate usually survives transport smaller even though it is longer raw. Falls back to
 * the primary fragment when the unpacked one loses on transport length or blows the budget.
 */
function selectMarkdownFragment(fragmentBody: string, transportFragmentBody: string): string {
  if (getVisibleFragmentLength(transportFragmentBody) > MAX_FRAGMENT_LENGTH) {
    return fragmentBody;
  }

  return getFragmentTransportLength(transportFragmentBody) < getFragmentTransportLength(fragmentBody)
    ? transportFragmentBody
    : fragmentBody;
}

function assembleGeneratedLink(
  envelope: PayloadEnvelope,
  fragmentBody: string,
  transportFragmentBody: string,
  baseUrl?: string,
): GeneratedArtifactLink {
  const hash = `#${fragmentBody}`;
  const fragmentLength = getVisibleFragmentLength(fragmentBody);

  if (fragmentLength > MAX_FRAGMENT_LENGTH) {
    throw new Error(
      `This link needs ${fragmentLength.toLocaleString()} fragment characters, which is over the ${MAX_FRAGMENT_LENGTH.toLocaleString()} character limit.`,
    );
  }

  const url = toFragmentUrl(fragmentBody, baseUrl);
  const markdownUrl = toFragmentUrl(selectMarkdownFragment(fragmentBody, transportFragmentBody), baseUrl);
  const shareInfo = buildGeneratedLinkShareInfo(envelope, markdownUrl);

  return {
    envelope,
    artifact: envelope.artifacts[0],
    codec: getFragmentCodec(fragmentBody),
    hash,
    url,
    fragmentLength,
    markdownUrl,
    markdownLink: shareInfo.markdownLink,
    markdownLinkLength: shareInfo.length,
    discordMarkdownLinkWarning: shareInfo.discordWarning,
  };
}
