import { describe, expect, it } from "vitest";
import { decodeFragment, encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Test bundle",
  activeArtifactId: "doc",
  artifacts: [
    {
      id: "doc",
      kind: "markdown",
      filename: "doc.md",
      content: "# Hello",
    },
  ],
};

describe("fragment payload transport", () => {
  it("round-trips a plain envelope", () => {
    const hash = `#${encodeEnvelope(envelope)}`;
    const parsed = decodeFragment(hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope).toEqual(envelope);
    expect(parsed.rawLength).toBeGreaterThan(0);
  });

  it("rejects fragments with the wrong key", () => {
    const parsed = decodeFragment("#not-agent-render=v1.plain.abc");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.code).toBe("missing-key");
  });

  it("rejects invalid json payloads", () => {
    const parsed = decodeFragment("#agent-render=v1.plain.bm90LWpzb24");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.code).toBe("invalid-json");
  });
});
