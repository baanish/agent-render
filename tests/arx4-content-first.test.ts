import { describe, expect, it } from "vitest";
import {
  ARX4_CONTENT_FIRST_MAGIC,
  ARX4_CONTENT_FIRST_VERSION,
  canEncodeArx4ContentFirst,
  decodeArx4CborishTuple,
  decodeArx4ContentFirst,
  encodeArx4CborishEnvelope,
  encodeArx4CborishTuple,
  encodeArx4ContentFirst,
  envelopeToArx4Tuple,
} from "@/lib/payload/arx4-content-first";
import type { PayloadEnvelope } from "@/lib/payload/schema";

function markdownEnvelope(content: string, extra: Partial<PayloadEnvelope["artifacts"][0]> = {}): PayloadEnvelope {
  return {
    v: 1,
    codec: "plain",
    title: "Note",
    activeArtifactId: "a",
    artifacts: [
      {
        id: "a",
        kind: "markdown",
        title: "Note",
        filename: "notes.md",
        content,
        ...extra,
      },
    ],
  };
}

describe("arx4 content-first (experimental)", () => {
  it("reports support only for single text artifacts", () => {
    expect(canEncodeArx4ContentFirst(markdownEnvelope("hi"))).toBe(true);
    expect(
      canEncodeArx4ContentFirst({
        v: 1,
        codec: "plain",
        artifacts: [
          { id: "a", kind: "diff", patch: "--- a\n+++ b\n" },
        ],
      }),
    ).toBe(false);
    expect(
      canEncodeArx4ContentFirst({
        v: 1,
        codec: "plain",
        artifacts: [
          { id: "a", kind: "markdown", content: "one" },
          { id: "b", kind: "markdown", content: "two" },
        ],
      }),
    ).toBe(false);
  });

  it("round-trips markdown with meta", () => {
    const envelope = markdownEnvelope("# Hello\n\n- item\n");
    const encoded = encodeArx4ContentFirst(envelope);
    expect(encoded[0]).toBe(ARX4_CONTENT_FIRST_MAGIC.charCodeAt(0));
    expect(encoded[1]).toBe(ARX4_CONTENT_FIRST_MAGIC.charCodeAt(1));
    expect(encoded[2]).toBe(ARX4_CONTENT_FIRST_VERSION);

    const decoded = decodeArx4ContentFirst(encoded);
    expect(decoded.codec).toBe("plain");
    expect(decoded.artifacts).toHaveLength(1);
    expect(decoded.artifacts[0]).toMatchObject({
      id: "a",
      kind: "markdown",
      title: "Note",
      filename: "notes.md",
      content: "# Hello\n\n- item\n",
    });
    expect(decoded.title).toBe("Note");
  });

  it("round-trips code language and envelope title override", () => {
    const envelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      title: "Bundle",
      activeArtifactId: "src",
      artifacts: [
        {
          id: "src",
          kind: "code",
          title: "fragment.ts",
          filename: "fragment.ts",
          language: "ts",
          content: "export const value = 1;\n",
        },
      ],
    };
    const decoded = decodeArx4ContentFirst(encodeArx4ContentFirst(envelope));
    expect(decoded.artifacts[0]).toMatchObject({
      kind: "code",
      language: "ts",
      content: "export const value = 1;\n",
    });
    expect(decoded.title).toBe("Bundle");
  });

  it("rejects truncated payloads", () => {
    const encoded = encodeArx4ContentFirst(markdownEnvelope("x"));
    expect(() => decodeArx4ContentFirst(encoded.subarray(0, 4))).toThrow(/too short|truncated/i);
  });
});

describe("arx4 CBOR-ish tuple (experimental)", () => {
  it("round-trips a single-artifact tuple", () => {
    const envelope = markdownEnvelope("body");
    const tuple = envelopeToArx4Tuple(envelope);
    const encoded = encodeArx4CborishTuple(tuple);
    const decoded = decodeArx4CborishTuple(encoded);
    expect(decoded).toEqual(tuple);
  });

  it("encodes envelopes and stays smaller than JSON for quote-heavy content", () => {
    const envelope = markdownEnvelope('He said "hello"\n\n```ts\nconst x = "y";\n```\n');
    const tuple = envelopeToArx4Tuple(envelope);
    const json = JSON.stringify(tuple);
    const cbor = encodeArx4CborishEnvelope(envelope);
    expect(cbor.length).toBeLessThan(Buffer.byteLength(json, "utf8"));
    expect(decodeArx4CborishTuple(cbor)).toEqual(tuple);
  });

  it("round-trips a multi-artifact bundle tuple", () => {
    const envelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      title: "Bundle",
      activeArtifactId: "b",
      artifacts: [
        { id: "a", kind: "markdown", content: "one" },
        { id: "b", kind: "json", content: "{\"ok\":true}", title: "data" },
      ],
    };
    const tuple = envelopeToArx4Tuple(envelope);
    expect(tuple[0]).toBe(2);
    expect(decodeArx4CborishTuple(encodeArx4CborishTuple(tuple))).toEqual(tuple);
  });
});
