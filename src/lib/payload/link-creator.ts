import { normalizeEnvelope } from "@/lib/payload/envelope";
import { encodeEnvelope, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import {
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
};

export const defaultLinkCreatorDraft: LinkCreatorDraft = {
  kind: "markdown",
  title: "Product brief",
  filename: "brief.md",
  content:
    "# Launch note\n\nShare one artifact at a time without uploading it anywhere.\n\n- Markdown stays readable\n- Code keeps its language hint\n- The link works from a static export",
  language: "tsx",
  diffView: "unified",
  codec: "auto",
};

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

function getDraftHeading(draft: LinkCreatorDraft) {
  return normalizeOptionalField(draft.title) ?? normalizeOptionalField(draft.filename) ?? `Untitled ${draft.kind}`;
}

function getArtifactId(draft: LinkCreatorDraft) {
  const filenameStem = normalizeOptionalField(draft.filename)?.replace(/\.[^./\\]+$/, "");
  return slugifyId(normalizeOptionalField(draft.title) ?? filenameStem ?? draft.kind);
}

function buildArtifact(draft: LinkCreatorDraft): ArtifactPayload {
  const title = normalizeOptionalField(draft.title);
  const filename = normalizeOptionalField(draft.filename);
  const id = getArtifactId(draft);

  if (!draft.content.trim()) {
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
  const prefix = `${PAYLOAD_FRAGMENT_KEY}=v1.`;
  if (!fragmentBody.startsWith(prefix)) {
    return "plain";
  }

  const codecEnd = fragmentBody.indexOf(".", prefix.length);
  if (codecEnd === -1) {
    return "plain";
  }

  const codec = fragmentBody.slice(prefix.length, codecEnd);
  return codecs.includes(codec as PayloadCodec) ? (codec as PayloadCodec) : "plain";
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
    title: getDraftHeading(draft),
    activeArtifactId: artifact.id,
    artifacts: [artifact],
  };
}

/**
 * Generates a shareable artifact link from draft input using sync codecs.
 *
 * Throws when draft content is empty, envelope normalization fails, or the generated fragment
 * exceeds `MAX_FRAGMENT_LENGTH`. The returned object always includes:
 * - `hash`: `#agent-render=v1...` fragment string
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
  const hash = `#${fragmentBody}`;
  const fragmentLength = hash.length - 1;

  if (fragmentLength > MAX_FRAGMENT_LENGTH) {
    throw new Error(
      `This link needs ${fragmentLength.toLocaleString()} fragment characters, which is over the ${MAX_FRAGMENT_LENGTH.toLocaleString()} character limit.`,
    );
  }

  let url = hash;

  if (baseUrl) {
    const nextUrl = new URL(baseUrl);
    nextUrl.hash = hash.slice(1);
    url = nextUrl.toString();
  }

  return {
    envelope: normalized.envelope,
    artifact: normalized.envelope.artifacts[0],
    codec: getFragmentCodec(fragmentBody),
    hash,
    url,
    fragmentLength,
  };
}

/**
 * Async variant of {@link createGeneratedArtifactLink} that can leverage async codecs (including
 * `arx`) via {@link encodeEnvelopeAsync}.
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
  const fragmentBody = await encodeEnvelopeAsync(normalized.envelope, encodeOptions);
  const hash = `#${fragmentBody}`;
  const fragmentLength = hash.length - 1;

  if (fragmentLength > MAX_FRAGMENT_LENGTH) {
    throw new Error(
      `This link needs ${fragmentLength.toLocaleString()} fragment characters, which is over the ${MAX_FRAGMENT_LENGTH.toLocaleString()} character limit.`,
    );
  }

  let url = hash;

  if (baseUrl) {
    const nextUrl = new URL(baseUrl);
    nextUrl.hash = hash.slice(1);
    url = nextUrl.toString();
  }

  return {
    envelope: normalized.envelope,
    artifact: normalized.envelope.artifacts[0],
    codec: getFragmentCodec(fragmentBody),
    hash,
    url,
    fragmentLength,
  };
}

/**
 * Returns the body-field label used by the link creator for the selected artifact kind.
 */
export function getBodyFieldLabel(kind: ArtifactKind) {
  return kind === "diff" ? "Patch" : "Content";
}
