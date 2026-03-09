import { describe, expect, it } from "vitest";
import { normalizeEnvelope } from "@/lib/payload/envelope";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const baseEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  activeArtifactId: "one",
  artifacts: [{ id: "one", kind: "markdown", content: "# one" }],
};

describe("normalizeEnvelope", () => {
  it("rejects duplicate artifact ids", () => {
    const result = normalizeEnvelope({
      ...baseEnvelope,
      artifacts: [
        { id: "one", kind: "markdown", content: "# one" },
        { id: "one", kind: "code", content: "export {};" },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects diff artifacts without patch or before/after content", () => {
    const result = normalizeEnvelope({
      ...baseEnvelope,
      artifacts: [{ id: "diff", kind: "diff" }],
      activeArtifactId: "diff",
    });

    expect(result.ok).toBe(false);
  });
});
