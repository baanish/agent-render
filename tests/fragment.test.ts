import { describe, expect, it } from "vitest";
import { decodeFragment, encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";
import { packEnvelope } from "@/lib/payload/wire-format";

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
    const hash = `#${encodeEnvelope(envelope, { codec: "plain" })}`;
    const parsed = decodeFragment(hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope).toEqual(envelope);
    expect(parsed.rawLength).toBeGreaterThan(0);
  });


  it("throws a clear error when sync encoding is explicitly asked to use arx", () => {
    expect(() => encodeEnvelope(envelope, { codec: "arx" })).toThrow(
      "arx codec requires async encoding — use encodeEnvelopeAsync instead.",
    );
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

  it("uses compressed transport when it is smaller", () => {
    const repetitiveEnvelope: PayloadEnvelope = {
      ...envelope,
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          filename: "doc.md",
          content: "lorem ipsum ".repeat(200),
        },
      ],
    };

    const hash = encodeEnvelope(repetitiveEnvelope);

    expect(hash.startsWith("agent-render=v1.plain.")).toBe(false);
    const parsed = decodeFragment(`#${hash}`);
    expect(parsed.ok).toBe(true);
  });

  it("round-trips a deflate envelope", () => {
    const hash = `#${encodeEnvelope(envelope, { codec: "deflate" })}`;
    const parsed = decodeFragment(hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope).toEqual({
      ...envelope,
      codec: "deflate",
    });
  });

  it("decodes packed wire envelopes", () => {
    const packed = packEnvelope({ ...envelope, codec: "deflate" });
    const encoded = btoa(
      String.fromCharCode(
        ...Array.from(new TextEncoder().encode(JSON.stringify(packed))),
      ),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const parsed = decodeFragment(`#agent-render=v1.plain.${encoded}`);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope).toEqual({
      ...envelope,
      codec: "deflate",
    });
  });

  it("supports budget-aware codec selection", () => {
    const targetEnvelope: PayloadEnvelope = {
      ...envelope,
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          content: "abc ".repeat(120),
        },
      ],
    };
    const plainLength = encodeEnvelope(targetEnvelope, { codec: "plain", preferPacked: false }).length;
    const compressedLength = encodeEnvelope(targetEnvelope, { codec: "deflate" }).length;
    const budget = compressedLength + 2;
    const bestEffort = encodeEnvelope(targetEnvelope, { targetMaxFragmentLength: budget });

    expect(bestEffort.length).toBeLessThanOrEqual(budget);
    expect(plainLength).toBeGreaterThan(budget);
  });

  it("normalizes an invalid active artifact id to the first artifact", () => {
    const hash = `#${encodeEnvelope(
      {
        ...envelope,
        activeArtifactId: "missing",
      },
      { codec: "plain" },
    )}`;

    const parsed = decodeFragment(hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.activeArtifactId).toBe("doc");
  });

  it("rejects an oversized decoded payload even when the compressed fragment is short", () => {
    const hugeEnvelope: PayloadEnvelope = {
      v: 1,
      codec: "lz",
      activeArtifactId: "doc",
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          content: "a".repeat(250000),
        },
      ],
    };

    const parsed = decodeFragment(`#${encodeEnvelope(hugeEnvelope, { codec: "lz" })}`);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.code).toBe("decoded-too-large");
  });
});
