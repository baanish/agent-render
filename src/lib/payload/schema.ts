export const MAX_FRAGMENT_LENGTH = 8192;
export const MAX_DECODED_PAYLOAD_LENGTH = 200000;
export const PAYLOAD_FRAGMENT_KEY = "agent-render";

export const artifactKinds = ["markdown", "code", "diff", "csv", "json"] as const;
export const codecs = ["plain", "lz", "deflate", "arx", "arx2"] as const;

export type ArtifactKind = (typeof artifactKinds)[number];
export type PayloadCodec = (typeof codecs)[number];

type BaseArtifact = {
  id: string;
  kind: ArtifactKind;
  title?: string;
  filename?: string;
};

export type MarkdownArtifact = BaseArtifact & {
  kind: "markdown";
  content: string;
};

export type CodeArtifact = BaseArtifact & {
  kind: "code";
  content: string;
  language?: string;
};

export type CsvArtifact = BaseArtifact & {
  kind: "csv";
  content: string;
};

export type JsonArtifact = BaseArtifact & {
  kind: "json";
  content: string;
};

export type DiffArtifact = BaseArtifact & {
  kind: "diff";
  patch?: string;
  oldContent?: string;
  newContent?: string;
  language?: string;
  view?: "unified" | "split";
};

export type ArtifactPayload =
  | MarkdownArtifact
  | CodeArtifact
  | CsvArtifact
  | JsonArtifact
  | DiffArtifact;

export type PayloadEnvelope = {
  v: 1;
  codec: PayloadCodec;
  title?: string;
  activeArtifactId?: string;
  artifacts: ArtifactPayload[];
};

type OptionalTupleString = string | null | undefined;
type OptionalTupleView = "unified" | "split" | null | undefined;
const artifactKindSet = new Set<string>(artifactKinds);
const codecSet = new Set<string>(codecs);

export type Arx2KindCode = "m" | "c" | "d" | "s" | "j";
export type Arx2TextArtifactTuple = ["m" | "s" | "j", string, string, OptionalTupleString?, OptionalTupleString?];
export type Arx2CodeArtifactTuple = ["c", string, string, OptionalTupleString?, OptionalTupleString?, OptionalTupleString?];
export type Arx2DiffArtifactTuple = [
  "d",
  string,
  OptionalTupleString?,
  OptionalTupleString?,
  OptionalTupleString?,
  OptionalTupleString?,
  OptionalTupleView?,
  OptionalTupleString?,
  OptionalTupleString?,
];
export type Arx2ArtifactTuple = Arx2TextArtifactTuple | Arx2CodeArtifactTuple | Arx2DiffArtifactTuple;
export type Arx2EnvelopeTuple =
  | [3, Arx2ArtifactTuple, OptionalTupleString?]
  | [2, Arx2ArtifactTuple[], OptionalTupleString?, number?];

export type ParsedPayload =
  | { ok: true; envelope: PayloadEnvelope; rawLength: number }
  | {
      ok: false;
      code: "empty" | "missing-key" | "too-large" | "decoded-too-large" | "invalid-format" | "invalid-json" | "invalid-envelope";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && artifactKindSet.has(value);
}

function isCodec(value: unknown): value is PayloadCodec {
  return typeof value === "string" && codecSet.has(value);
}

function hasString(value: unknown): value is string {
  return typeof value === "string";
}

function isBaseArtifact(value: unknown): value is BaseArtifact {
  if (!isRecord(value)) {
    return false;
  }

  return hasString(value.id) && isArtifactKind(value.kind);
}

/**
 * Runtime shape guard for payload envelopes decoded from untyped input.
 *
 * Validates top-level structure (`v`, `codec`, non-empty `artifacts`) plus per-artifact minimum
 * requirements: base fields, `content` for non-diff artifacts, and either `patch` or both
 * `oldContent`/`newContent` for diff artifacts.
 *
 * @param value - Unknown value to validate as a payload envelope.
 * @returns `true` when the value matches the runtime envelope contract, otherwise `false`.
 *
 * Failure/fallback: this guard checks structure only and does not perform full semantic
 * normalization beyond required runtime fields.
 */
export function isPayloadEnvelope(value: unknown): value is PayloadEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  if (value.v !== 1 || !isCodec(value.codec) || !Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    return false;
  }

  for (const artifact of value.artifacts) {
    if (!isBaseArtifact(artifact)) {
      return false;
    }

    if (artifact.kind === "diff") {
      const diffArtifact = artifact as {
        patch?: unknown;
        oldContent?: unknown;
        newContent?: unknown;
      };

      if (!hasString(diffArtifact.patch) && (!hasString(diffArtifact.oldContent) || !hasString(diffArtifact.newContent))) {
        return false;
      }
      continue;
    }

    if (!hasString((artifact as { content?: unknown }).content)) {
      return false;
    }
  }

  return true;
}
