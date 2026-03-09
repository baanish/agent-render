export const MAX_FRAGMENT_LENGTH = 8000;
export const PAYLOAD_FRAGMENT_KEY = "agent-render";

export const artifactKinds = ["markdown", "code", "diff", "csv", "json"] as const;
export const codecs = ["plain", "lz"] as const;

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

export type ParsedPayload =
  | { ok: true; envelope: PayloadEnvelope; rawLength: number }
  | { ok: false; code: "empty" | "missing-key" | "too-large" | "invalid-format" | "invalid-json" | "invalid-envelope"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && artifactKinds.includes(value as ArtifactKind);
}

function isCodec(value: unknown): value is PayloadCodec {
  return typeof value === "string" && codecs.includes(value as PayloadCodec);
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

export function isPayloadEnvelope(value: unknown): value is PayloadEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  if (value.v !== 1 || !isCodec(value.codec) || !Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    return false;
  }

  return value.artifacts.every((artifact) => {
    if (!isBaseArtifact(artifact)) {
      return false;
    }

    if (artifact.kind === "diff") {
      const diffArtifact = artifact as {
        patch?: unknown;
        oldContent?: unknown;
        newContent?: unknown;
      };

      return hasString(diffArtifact.patch) || (hasString(diffArtifact.oldContent) && hasString(diffArtifact.newContent));
    }

    return hasString((artifact as { content?: unknown }).content);
  });
}
