import path from "node:path";
import type { ArtifactPayload, PayloadEnvelope } from "../../src/lib/payload/schema";
import { normalizeEnvelope } from "../../src/lib/payload/envelope";
import { detectArtifactKind, type RequestedKind } from "./kind";

export type ArtifactInput = {
  filename: string;
  content: string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
}

function buildArtifact(
  input: ArtifactInput,
  requestedKind: RequestedKind,
  id: string,
  titleOverride?: string,
): ArtifactPayload {
  const detected = detectArtifactKind(input.filename, requestedKind);
  const filename = path.basename(input.filename);
  const title = titleOverride?.trim() || filename;
  if (detected.kind === "diff") {
    return { id, kind: "diff", title, filename, patch: input.content, view: "unified" };
  }
  if (detected.kind === "code") {
    return {
      id,
      kind: "code",
      title,
      filename,
      content: input.content,
      language: detected.language,
    };
  }
  return { id, kind: detected.kind, title, filename, content: input.content };
}

/** Builds and validates one payload envelope from one or more artifact inputs. */
export function buildPayloadEnvelope(
  inputs: ArtifactInput[],
  requestedKind: RequestedKind,
  title?: string,
): PayloadEnvelope {
  const idCounts = new Map<string, number>();
  const artifacts = inputs.map((input) => {
    const baseId = slugify(path.basename(input.filename, path.extname(input.filename)));
    const count = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, count);
    return buildArtifact(
      input,
      requestedKind,
      count === 1 ? baseId : `${baseId}-${count}`,
      inputs.length === 1 ? title : undefined,
    );
  });

  const candidate: PayloadEnvelope = {
    v: 1,
    codec: "plain",
    title: title?.trim() || (artifacts.length === 1 ? artifacts[0]?.title : undefined),
    activeArtifactId: artifacts[0]?.id,
    artifacts,
  };
  const normalized = normalizeEnvelope(candidate);
  if (!normalized.ok) throw new Error(normalized.message);
  return normalized.envelope;
}
