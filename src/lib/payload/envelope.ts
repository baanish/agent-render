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

/**
 * Validates and normalizes a payload envelope before encode/render use.
 *
 * Validation guarantees:
 * - artifact ids are unique within the bundle (duplicate ids fail validation)
 * - diff artifacts include either a non-empty `patch` or both `oldContent` and `newContent`
 * - at least one artifact exists
 *
 * Normalization behavior:
 * - `activeArtifactId` is preserved only when it matches an artifact in the bundle
 * - otherwise `activeArtifactId` is normalized to the first artifact id
 */
export function normalizeEnvelope(envelope: PayloadEnvelope): EnvelopeValidationResult {
  if (envelope.artifacts.length === 0) {
    return {
      ok: false,
      message: "A payload bundle must contain at least one artifact.",
    };
  }

  if (envelope.artifacts.length === 1) {
    const artifact = envelope.artifacts[0]!;
    const artifactError = validateArtifact(artifact);
    if (artifactError) {
      return { ok: false, message: artifactError };
    }

    return {
      ok: true,
      envelope: {
        ...envelope,
        activeArtifactId: artifact.id,
      },
    };
  }

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

  return {
    ok: true,
    envelope: {
      ...envelope,
      activeArtifactId,
    },
  };
}
