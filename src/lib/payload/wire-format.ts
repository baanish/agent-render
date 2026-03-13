import type { ArtifactPayload, PayloadEnvelope, PayloadCodec } from "@/lib/payload/schema";

type PackedCodeArtifact = {
  i: string;
  k: "code";
  c: string;
  t?: string;
  f?: string;
  l?: string;
};

type PackedDiffArtifact = {
  i: string;
  k: "diff";
  t?: string;
  f?: string;
  p?: string;
  o?: string;
  n?: string;
  l?: string;
  w?: "unified" | "split";
};

type PackedTextArtifact = {
  i: string;
  k: "markdown" | "csv" | "json";
  c: string;
  t?: string;
  f?: string;
};

type PackedArtifact = PackedCodeArtifact | PackedDiffArtifact | PackedTextArtifact;

type PackedEnvelope = {
  p: 1;
  v: 1;
  c: PayloadCodec;
  t?: string;
  a?: string;
  r: PackedArtifact[];
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

/** Public API for `packEnvelope`. */
export function packEnvelope(envelope: PayloadEnvelope): PackedEnvelope {
  return {
    p: 1,
    v: envelope.v,
    c: envelope.codec,
    t: envelope.title,
    a: envelope.activeArtifactId,
    r: envelope.artifacts.map((artifact) => {
      switch (artifact.kind) {
        case "markdown":
        case "csv":
        case "json":
          return {
            i: artifact.id,
            k: artifact.kind,
            t: artifact.title,
            f: artifact.filename,
            c: artifact.content,
          };
        case "code":
          return {
            i: artifact.id,
            k: artifact.kind,
            t: artifact.title,
            f: artifact.filename,
            c: artifact.content,
            l: artifact.language,
          };
        case "diff":
          return {
            i: artifact.id,
            k: artifact.kind,
            t: artifact.title,
            f: artifact.filename,
            p: artifact.patch,
            o: artifact.oldContent,
            n: artifact.newContent,
            l: artifact.language,
            w: artifact.view,
          };
      }
    }),
  };
}

function unpackArtifact(artifact: PackedArtifact): ArtifactPayload {
  if (artifact.k === "code") {
    return {
      id: artifact.i,
      kind: "code",
      title: artifact.t,
      filename: artifact.f,
      content: artifact.c,
      language: artifact.l,
    };
  }

  if (artifact.k === "diff") {
    return {
      id: artifact.i,
      kind: "diff",
      title: artifact.t,
      filename: artifact.f,
      patch: artifact.p,
      oldContent: artifact.o,
      newContent: artifact.n,
      language: artifact.l,
      view: artifact.w,
    };
  }

  return {
    id: artifact.i,
    kind: artifact.k,
    title: artifact.t,
    filename: artifact.f,
    content: artifact.c,
  };
}

function looksLikePackedArtifact(value: unknown): value is PackedArtifact {
  if (!isRecord(value) || typeof value.i !== "string" || typeof value.k !== "string") {
    return false;
  }

  if (value.k === "code") {
    return typeof value.c === "string";
  }

  if (value.k === "diff") {
    return (
      typeof value.p === "string" ||
      (typeof value.o === "string" && typeof value.n === "string")
    );
  }

  if (value.k === "markdown" || value.k === "csv" || value.k === "json") {
    return typeof value.c === "string";
  }

  return false;
}

function looksLikePackedEnvelope(value: unknown): value is PackedEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  if (value.p !== 1 || value.v !== 1 || typeof value.c !== "string" || !Array.isArray(value.r) || value.r.length === 0) {
    return false;
  }

  return value.r.every(looksLikePackedArtifact);
}

/** Public API for `unpackEnvelope`. */
export function unpackEnvelope(value: unknown): unknown {
  if (!looksLikePackedEnvelope(value)) {
    return value;
  }

  return {
    v: value.v,
    codec: value.c,
    title: typeof value.t === "string" ? value.t : undefined,
    activeArtifactId: typeof value.a === "string" ? value.a : undefined,
    artifacts: value.r.map(unpackArtifact),
  } satisfies PayloadEnvelope;
}
