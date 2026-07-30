import type { Arx4PriorId } from "@/lib/payload/arx4-codec";
import type { PayloadEnvelope } from "@/lib/payload/schema";

/**
 * Pinned arx4 characterization vectors: `[prior id, artifact content, expected base64url payload]`.
 *
 * Shared by tests/arx4-codec.test.ts (Node) and tests/e2e/arx4-determinism.spec.ts (Chromium and
 * WebKit) so both engines are held to the same strings. base64url is the pinned wire because it is
 * ASCII and diffs readably; every other wire is a lossless re-encoding of the same coded bytes.
 *
 * The `m`, `c` and `j` rows only hold with the curated priors asset loaded (public/arx4-priors.json);
 * without it the encoder degrades to the `s` prior and emits an `s` id, so a diff here can also mean
 * the asset failed to load rather than that the coder changed.
 */
export const arx4DeterminismVectors: [Arx4PriorId, string, string][] = [
  ["m", "# Vector\n\nOne markdown line.\n", "mB.O_xYpsmnF3Fjw-Z9PGHhL_dTj0p3r3SVWs1mFJtyeMaPfeIlsMWgVsGNqKN86A"],
  ["c", "export const vector = 1;\n", "cB.M__uQDGmv78MoPGNjfOs2KgY4fn7UE6oTuQN1uUycnBbOMjiIA"],
  ["j", "{\"vector\":true}\n", "jB.Nf-0unuVZkCRtHoDSx9ECYvKuaxxbiRfjODhYu2HBCtZv5bbs75QKeU"],
  ["s", "Shared prior vector.\n", "sB.OtTxZjMc80GBVn5NhNnpa9vx1QyfTbf5ubtWtHbfbnGtGrvqMOj6UQ"],
  ["n", "Cold model vector.\n", "nB.OOCzvJS_jHbUL4OKSHLkRONp-rl4LRIO11CBl-AaUnR4ajSBpLwkF-smuGWu"],
];

/** The envelope every vector codes; only the artifact content varies between rows. */
export function arx4VectorEnvelope(content: string): PayloadEnvelope {
  return {
    v: 1,
    codec: "arx4",
    title: "Vector",
    activeArtifactId: "vector",
    artifacts: [{ id: "vector", kind: "markdown", filename: "vector.md", content }],
  };
}
