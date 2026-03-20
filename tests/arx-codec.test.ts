import { describe, expect, it } from "vitest";
import {
  encodeBase76,
  decodeBase76,
  encodeBase1k,
  decodeBase1k,
  isBase1kEncoded,
  encodeBaseBMP,
  decodeBaseBMP,
  isBaseBMPEncoded,
  encodeBase64url,
  decodeBase64url,
  isBase64urlEncoded,
  arxCompress,
  arxCompressUnicode,
  arxCompressBMP,
  arxCompressBase64url,
  arxDecompress,
  getActiveDictVersion,
} from "@/lib/payload/arx-codec";
import { encodeEnvelopeAsync, decodeFragmentAsync } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

describe("base76 encoding", () => {
  it("round-trips empty input", () => {
    expect(encodeBase76(new Uint8Array(0))).toBe("");
    expect(decodeBase76("")).toEqual(new Uint8Array(0));
  });

  it("round-trips a single byte", () => {
    for (const b of [0, 1, 127, 128, 255]) {
      const encoded = encodeBase76(new Uint8Array([b]));
      const decoded = decodeBase76(encoded);
      expect(decoded).toEqual(new Uint8Array([b]));
    }
  });

  it("round-trips arbitrary byte sequences", () => {
    const bytes = new Uint8Array([0, 1, 2, 100, 200, 255, 128, 64, 32, 16, 8, 4, 2, 1, 0]);
    const encoded = encodeBase76(bytes);
    const decoded = decodeBase76(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips a larger payload", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = encodeBase76(bytes);
    const decoded = decodeBase76(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("produces only URL-fragment-safe characters", () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < 100; i++) bytes[i] = Math.floor(Math.random() * 256);
    const encoded = encodeBase76(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9\-._~!$*()',;:@/]+$/);
  });
});

describe("base1k encoding", () => {
  it("round-trips empty input", () => {
    expect(encodeBase1k(new Uint8Array(0))).toBe("");
    expect(decodeBase1k("")).toEqual(new Uint8Array(0));
  });

  it("round-trips arbitrary byte sequences", () => {
    const bytes = new Uint8Array([0, 1, 2, 100, 200, 255, 128, 64, 32, 16, 8, 4, 2, 1, 0]);
    const encoded = encodeBase1k(bytes);
    const decoded = decodeBase1k(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips a larger payload", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = encodeBase1k(bytes);
    const decoded = decodeBase1k(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("produces fewer characters than base76 for the same bytes", () => {
    const bytes = new Uint8Array(200);
    for (let i = 0; i < 200; i++) bytes[i] = Math.floor(Math.random() * 256);
    const b76 = encodeBase76(bytes);
    const b1k = encodeBase1k(bytes);
    expect(b1k.length).toBeLessThan(b76.length);
  });

  it("isBase1kEncoded detects Unicode vs ASCII encoding", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(isBase1kEncoded(encodeBase1k(bytes))).toBe(true);
    expect(isBase1kEncoded(encodeBase76(bytes))).toBe(false);
    expect(isBase1kEncoded("")).toBe(false);
  });
});

describe("baseBMP encoding", () => {
  it("round-trips arbitrary byte sequences", () => {
    const bytes = new Uint8Array([0, 1, 2, 100, 200, 255, 128, 64, 32, 16, 8, 4, 2, 1, 0]);
    const encoded = encodeBaseBMP(bytes);
    const decoded = decodeBaseBMP(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips a larger payload", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = encodeBaseBMP(bytes);
    const decoded = decodeBaseBMP(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("produces fewer characters than base1k for the same bytes", () => {
    const bytes = new Uint8Array(200);
    for (let i = 0; i < 200; i++) bytes[i] = Math.floor(Math.random() * 256);
    const b1k = encodeBase1k(bytes);
    const bmp = encodeBaseBMP(bytes);
    expect(bmp.length).toBeLessThan(b1k.length);
  });

  it("isBaseBMPEncoded detects baseBMP vs other encodings", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(isBaseBMPEncoded(encodeBaseBMP(bytes))).toBe(true);
    expect(isBaseBMPEncoded(encodeBase1k(bytes))).toBe(false);
    expect(isBaseBMPEncoded(encodeBase76(bytes))).toBe(false);
    expect(isBaseBMPEncoded("")).toBe(false);
  });
});

describe("base64url encoding (ARX wire)", () => {
  it("round-trips empty input", () => {
    expect(encodeBase64url(new Uint8Array(0))).toBe("B.");
    expect(decodeBase64url("B.")).toEqual(new Uint8Array(0));
  });

  it("round-trips arbitrary byte sequences", () => {
    const bytes = new Uint8Array([0, 1, 2, 100, 200, 255, 128, 64, 32, 16, 8, 4, 2, 1, 0]);
    const encoded = encodeBase64url(bytes);
    const decoded = decodeBase64url(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips a larger payload", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const encoded = encodeBase64url(bytes);
    const decoded = decodeBase64url(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("output uses only URL-safe ASCII (B. prefix plus base64url alphabet)", () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < 100; i++) bytes[i] = Math.floor(Math.random() * 256);
    const encoded = encodeBase64url(bytes);
    expect(encoded).toMatch(/^B\.[A-Za-z0-9_-]*$/);
  });

  it("isBase64urlEncoded distinguishes base64url wire form from base76", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(isBase64urlEncoded(encodeBase64url(bytes))).toBe(true);
    expect(isBase64urlEncoded(encodeBase76(bytes))).toBe(false);
    expect(isBase64urlEncoded("B.not!valid")).toBe(false);
    expect(isBase64urlEncoded("")).toBe(false);
  });

  it("decodeBase64url rejects missing prefix", () => {
    expect(() => decodeBase64url("YWJj")).toThrow();
  });
});

describe("arx compress/decompress", () => {
  it("round-trips a simple string", async () => {
    const input = '{"hello":"world"}';
    const compressed = await arxCompress(input);
    const decompressed = await arxDecompress(compressed);
    expect(decompressed).toBe(input);
  });

  it("round-trips text with dictionary-matched patterns", async () => {
    const input = "# Hello\n\n## Section\n\n- item one\n- item two\n\n```ts\nexport function greet() {\n  return 'hello';\n}\n```";
    const compressed = await arxCompress(input);
    const decompressed = await arxDecompress(compressed);
    expect(decompressed).toBe(input);
  });

  it("round-trips through Unicode (base1k) arx pipeline", async () => {
    const input = JSON.stringify({ content: "hello world ".repeat(100) });
    const compressed = await arxCompressUnicode(input);
    expect(isBase1kEncoded(compressed)).toBe(true);
    const decompressed = await arxDecompress(compressed);
    expect(decompressed).toBe(input);
  });

  it("Unicode arx produces fewer chars than ASCII arx", async () => {
    const input = JSON.stringify({ content: "The quick brown fox. ".repeat(50) });
    const ascii = await arxCompress(input);
    const unicode = await arxCompressUnicode(input);
    expect(unicode.length).toBeLessThan(ascii.length);
  });

  it("round-trips through BMP arx pipeline", async () => {
    const input = JSON.stringify({ content: "hello world ".repeat(100) });
    const compressed = await arxCompressBMP(input);
    expect(isBaseBMPEncoded(compressed)).toBe(true);
    const decompressed = await arxDecompress(compressed);
    expect(decompressed).toBe(input);
  });

  it("BMP arx produces fewer chars than Unicode arx", async () => {
    const input = JSON.stringify({ content: "The quick brown fox. ".repeat(50) });
    const unicode = await arxCompressUnicode(input);
    const bmp = await arxCompressBMP(input);
    expect(bmp.length).toBeLessThan(unicode.length);
  });

  it("round-trips through base64url arx pipeline", async () => {
    const input = JSON.stringify({ content: "hello world ".repeat(100) });
    const compressed = await arxCompressBase64url(input);
    expect(isBase64urlEncoded(compressed)).toBe(true);
    const decompressed = await arxDecompress(compressed);
    expect(decompressed).toBe(input);
  });

  it("produces shorter output than base64url for compressible text", async () => {
    const input = JSON.stringify({ content: "hello world ".repeat(100) });
    const compressed = await arxCompress(input);
    const base64Length = Math.ceil(input.length * 4 / 3);
    expect(compressed.length).toBeLessThan(base64Length);
  });
});

describe("arx fragment round-trip", () => {
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
        content: "# Hello\n\nThis is a test artifact with some content.\n\n## Section\n\n- Item one\n- Item two\n- Item three",
      },
    ],
  };

  it("round-trips an envelope through arx codec", async () => {
    const hash = `#${await encodeEnvelopeAsync(envelope, { codec: "arx" })}`;
    expect(hash).toContain(`v1.arx.${getActiveDictVersion()}.`);

    const parsed = await decodeFragmentAsync(hash);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.envelope.artifacts[0]).toEqual(expect.objectContaining({
      id: "doc",
      kind: "markdown",
      content: envelope.artifacts[0].kind === "markdown" ? envelope.artifacts[0].content : "",
    }));
  });

  it("arx produces smaller fragments than deflate for repetitive content", async () => {
    const bigEnvelope: PayloadEnvelope = {
      ...envelope,
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          filename: "doc.md",
          content: "lorem ipsum dolor sit amet ".repeat(100),
        },
      ],
    };

    const arxHash = await encodeEnvelopeAsync(bigEnvelope, { codec: "arx" });
    const deflateHash = await encodeEnvelopeAsync(bigEnvelope, { codec: "deflate" });
    expect(arxHash.length).toBeLessThan(deflateHash.length);
  });

  it("async auto-selection picks arx when it is smallest", async () => {
    const bigEnvelope: PayloadEnvelope = {
      ...envelope,
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          filename: "doc.md",
          content: "The quick brown fox jumps over the lazy dog. ".repeat(50),
        },
      ],
    };

    const autoHash = await encodeEnvelopeAsync(bigEnvelope);
    expect(autoHash).toContain(`v1.arx.${getActiveDictVersion()}.`);
  });

  it("decodes arx fragments when unicode payload chars are percent-escaped", async () => {
    const hash = `#${await encodeEnvelopeAsync(envelope, { codec: "arx" })}`;
    const escapedHash = hash.replace(/[^\x00-\x7F]/g, (char) => encodeURIComponent(char));

    const parsed = await decodeFragmentAsync(escapedHash);
    expect(parsed.ok).toBe(true);
  });

  it("decodes legacy arx fragments without dictionary version segment", async () => {
    const hash = `#${await encodeEnvelopeAsync(envelope, { codec: "arx" })}`;
    const currentPrefix = `v1.arx.${getActiveDictVersion()}.`;
    const legacyHash = hash.replace(currentPrefix, "v1.arx.");

    const parsed = await decodeFragmentAsync(legacyHash);
    expect(parsed.ok).toBe(true);
  });
});
