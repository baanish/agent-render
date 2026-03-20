import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveInjectedEnvelope } from "@/lib/payload/injected";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const win = window as unknown as Record<string, unknown>;

const validEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Test artifact",
  activeArtifactId: "test-1",
  artifacts: [
    {
      id: "test-1",
      kind: "markdown",
      title: "Test markdown",
      content: "# Hello\n\nThis is a test.",
    },
  ],
};

describe("resolveInjectedEnvelope", () => {
  beforeEach(() => {
    delete win.__AGENT_RENDER_ENVELOPE__;
  });

  afterEach(() => {
    delete win.__AGENT_RENDER_ENVELOPE__;
  });

  it("returns null when no injected envelope is present", () => {
    expect(resolveInjectedEnvelope()).toBeNull();
  });

  it("resolves a valid injected envelope object", () => {
    win.__AGENT_RENDER_ENVELOPE__ = validEnvelope;
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      expect(result!.envelope.title).toBe("Test artifact");
      expect(result!.envelope.artifacts).toHaveLength(1);
      expect(result!.envelope.artifacts[0].kind).toBe("markdown");
    }
  });

  it("resolves a valid injected envelope JSON string", () => {
    win.__AGENT_RENDER_ENVELOPE__ = JSON.stringify(validEnvelope);
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      expect(result!.envelope.title).toBe("Test artifact");
    }
  });

  it("returns an error for invalid JSON strings", () => {
    win.__AGENT_RENDER_ENVELOPE__ = "not valid json{{{";
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.code).toBe("invalid-json");
    }
  });

  it("returns an error for objects that are not valid envelopes", () => {
    win.__AGENT_RENDER_ENVELOPE__ = { foo: "bar" };
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.code).toBe("invalid-envelope");
    }
  });

  it("returns an error for envelopes with duplicate artifact ids", () => {
    const duplicateEnvelope = {
      ...validEnvelope,
      artifacts: [
        { id: "dup", kind: "markdown" as const, content: "a" },
        { id: "dup", kind: "code" as const, content: "b" },
      ],
    };
    win.__AGENT_RENDER_ENVELOPE__ = duplicateEnvelope;
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.code).toBe("invalid-envelope");
    }
  });

  it("normalizes activeArtifactId to first artifact when invalid", () => {
    const envelope = { ...validEnvelope, activeArtifactId: "nonexistent" };
    win.__AGENT_RENDER_ENVELOPE__ = envelope;
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      expect(result!.envelope.activeArtifactId).toBe("test-1");
    }
  });

  it("supports all artifact kinds", () => {
    const multiKindEnvelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      title: "Multi-kind",
      artifacts: [
        { id: "md", kind: "markdown", content: "# Hello" },
        { id: "code", kind: "code", content: "const x = 1;", language: "typescript" },
        { id: "diff", kind: "diff", patch: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new" },
        { id: "csv", kind: "csv", content: "a,b\n1,2" },
        { id: "json", kind: "json", content: '{"key": "value"}' },
      ],
    };
    win.__AGENT_RENDER_ENVELOPE__ = multiKindEnvelope;
    const result = resolveInjectedEnvelope();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      expect(result!.envelope.artifacts).toHaveLength(5);
    }
  });
});
