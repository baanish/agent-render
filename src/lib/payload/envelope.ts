import type { ArtifactPayload, PayloadEnvelope } from "@/lib/payload/schema";

type EnvelopeValidationResult =
  | { ok: true; envelope: PayloadEnvelope }
  | { ok: false; message: string };

function validateArtifact(artifact: ArtifactPayload): string | null {
  if (artifact.kind === "diff") {
    const hasPatch = typeof artifact.patch === "string" && artifact.patch.length > 0;
    const hasPair = typeof artifact.oldContent === "string" && typeof artifact.newContent === "string";

    if (!hasPatch && !hasPair) {
      return `Diff artifact "${artifact.id}" must include a patch or an old/new content pair.`;
    }
  }

  return null;
}

/** Public API for `normalizeEnvelope`. */
export function normalizeEnvelope(envelope: PayloadEnvelope): EnvelopeValidationResult {
  const seenIds = new Set<string>();

  for (const artifact of envelope.artifacts) {
    if (seenIds.has(artifact.id)) {
      return {
        ok: false,
        message: `Duplicate artifact id "${artifact.id}" is not allowed in a payload bundle.`,
      };
    }

    seenIds.add(artifact.id);

    const artifactError = validateArtifact(artifact);
    if (artifactError) {
      return { ok: false, message: artifactError };
    }
  }

  const activeArtifactId =
    envelope.activeArtifactId && seenIds.has(envelope.activeArtifactId)
      ? envelope.activeArtifactId
      : envelope.artifacts[0]?.id;

  if (!activeArtifactId) {
    return {
      ok: false,
      message: "A payload bundle must contain at least one artifact.",
    };
  }

  return {
    ok: true,
    envelope: {
      ...envelope,
      activeArtifactId,
    },
  };
}
