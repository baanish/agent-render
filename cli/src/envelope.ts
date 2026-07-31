import path from "node:path";
import type { ArtifactPayload, ChoiceOption, PayloadEnvelope } from "../../src/lib/payload/schema";
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

type ChoicesDocument = {
  prompt?: string;
  multi?: boolean;
  options: ChoiceOption[];
};

const CHOICES_SHAPE = '{"prompt"?, "multi"?, "options": [{"id", "label", "detail"?}]}';

function parseChoicesDocument(input: ArtifactInput): ChoicesDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content);
  } catch {
    throw new Error(`Choices input ${input.filename} must be JSON shaped ${CHOICES_SHAPE}.`);
  }

  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { options?: unknown }).options)) {
    throw new Error(`Choices input ${input.filename} must be JSON shaped ${CHOICES_SHAPE}.`);
  }

  const document = parsed as { prompt?: unknown; multi?: unknown; options: unknown[] };
  if (document.prompt !== undefined && typeof document.prompt !== "string") {
    throw new Error(`Choices "prompt" in ${input.filename} must be a string.`);
  }
  if (document.multi !== undefined && typeof document.multi !== "boolean") {
    throw new Error(`Choices "multi" in ${input.filename} must be a boolean.`);
  }

  const options = document.options.map((option, index) => {
    const record = option as { id?: unknown; label?: unknown; detail?: unknown };
    if (typeof record?.id !== "string" || typeof record.label !== "string") {
      throw new Error(`Choices option ${index + 1} in ${input.filename} needs string "id" and "label".`);
    }
    if (record.detail !== undefined && typeof record.detail !== "string") {
      throw new Error(`Choices option "${record.id}" in ${input.filename} has a non-string "detail".`);
    }
    return { id: record.id, label: record.label, detail: record.detail };
  });

  return { prompt: document.prompt, multi: document.multi, options };
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
  if (detected.kind === "choices") {
    const document = parseChoicesDocument(input);
    return {
      id,
      kind: "choices",
      title,
      filename,
      prompt: document.prompt,
      multi: document.multi,
      options: document.options,
    };
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
  // Reserve every real slug first, so a generated `<base>-N` suffix can never collide with a later
  // file whose own name slugifies to that same string (report-2.md alongside two report.md files).
  const takenIds = new Set(
    inputs.map((input) => slugify(path.basename(input.filename, path.extname(input.filename)))),
  );
  const usedIds = new Set<string>();
  const artifacts = inputs.map((input) => {
    const baseId = slugify(path.basename(input.filename, path.extname(input.filename)));
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id) || (id !== baseId && takenIds.has(id))) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return buildArtifact(input, requestedKind, id, inputs.length === 1 ? title : undefined);
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
