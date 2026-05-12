import { describe, expect, it, vi } from "vitest";
import arxDictionaryJson from "../public/arx-dictionary.json";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
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
  arxCompressPayloads,
  arxCompressUnicode,
  arxCompressBMP,
  arxCompressBase64url,
  arxDecompress,
  arx2CompressEnvelope,
  arx2DecompressEnvelope,
  ArxDecodedPayloadTooLargeError,
  encodeArxDictionaryForTest,
  getActiveDictVersion,
  loadArxDictionary,
  loadArxDictionarySync,
  loadArx2OverlayDictionary,
  loadArx2OverlayDictionarySync,
} from "@/lib/payload/arx-codec";
import { encodeEnvelopeAsync, decodeFragmentAsync } from "@/lib/payload/fragment";
import { MAX_DECODED_PAYLOAD_LENGTH, type PayloadEnvelope } from "@/lib/payload/schema";

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

  it("single-pass payload generation matches the individual ARX encoders", async () => {
    const input = JSON.stringify({
      content: "The quick brown fox. ".repeat(50),
    });
    const payloads = await arxCompressPayloads(input);

    expect(payloads).toEqual({
      base76: await arxCompress(input),
      base1k: await arxCompressUnicode(input),
      baseBMP: await arxCompressBMP(input),
      base64url: await arxCompressBase64url(input),
    });
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

  it("async auto-selection picks an arx-family codec when it is smallest", async () => {
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
    expect(autoHash).toMatch(new RegExp(`v1\\.arx2?\\.${getActiveDictVersion()}\\.`));
  });

  it("async arx selection can choose the chat-safe base64url wire form", async () => {
    const bigEnvelope: PayloadEnvelope = {
      ...envelope,
      artifacts: [
        {
          id: "doc",
          kind: "markdown",
          filename: "doc.md",
          content: [
            "# Chat-safe ARX",
            "",
            ...Array.from({ length: 120 }, (_, index) => `- item ${index}: The quick brown fox jumps over the lazy dog.`),
          ].join("\n"),
        },
      ],
    };

    const autoHash = await encodeEnvelopeAsync(bigEnvelope, { codec: "arx" });
    expect(autoHash).toContain(`v1.arx.${getActiveDictVersion()}.B.`);
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

describe("arx2 tuple envelope", () => {
  const bundle: PayloadEnvelope = {
    v: 1,
    codec: "plain",
    title: "Mixed arx2 bundle",
    activeArtifactId: "patch",
    artifacts: [
      {
        id: "notes",
        kind: "markdown",
        title: "Notes",
        filename: "notes.md",
        content: "# Notes\n\n## Scope\n\n- [x] Tuple envelope\n- [ ] Overlay dictionary",
      },
      {
        id: "source",
        kind: "code",
        title: "source.ts",
        filename: "source.ts",
        language: "ts",
        content: "import { value } from \"./value\";\n\nexport const result = value as const;\n",
      },
      {
        id: "patch",
        kind: "diff",
        title: "change.patch",
        filename: "change.patch",
        patch: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n",
        view: "split",
      },
      {
        id: "table",
        kind: "csv",
        content: "name,value\nalpha,1\nbeta,2",
      },
      {
        id: "manifest",
        kind: "json",
        content: "{\"ok\":true,\"items\":[1,2,3]}",
      },
    ],
  };

  it("round-trips single-artifact arx2 fragments", async () => {
    const single: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      title: "Single",
      activeArtifactId: "notes",
      artifacts: [bundle.artifacts[0]],
    };
    const hash = `#${await encodeEnvelopeAsync(single, { codec: "arx2" })}`;
    expect(hash).toContain(`v1.arx2.${getActiveDictVersion()}.`);

    const parsed = await decodeFragmentAsync(hash);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.envelope).toEqual({ ...single, codec: "arx2" });
  });

  it("round-trips multi-artifact arx2 bundles across every artifact kind", async () => {
    const hash = `#${await encodeEnvelopeAsync(bundle, { codec: "arx2" })}`;
    const parsed = await decodeFragmentAsync(hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.envelope).toEqual({ ...bundle, codec: "arx2" });
  });

  it("preserves optional tuple fields, omitted fields, and empty optional strings", async () => {
    const edgeCases: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      activeArtifactId: "code",
      artifacts: [
        {
          id: "code",
          kind: "code",
          content: "export function empty() { return \"\"; }",
          language: "",
          title: "",
          filename: "",
        },
        {
          id: "diff-pair",
          kind: "diff",
          oldContent: "",
          newContent: "changed",
          language: "txt",
          view: "unified",
        },
      ],
    };

    const parsed = await decodeFragmentAsync(`#${await encodeEnvelopeAsync(edgeCases, { codec: "arx2" })}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.envelope).toEqual({ ...edgeCases, codec: "arx2" });
  });

  it("normalizes an invalid active artifact id to the first artifact", async () => {
    const parsed = await decodeFragmentAsync(`#${await encodeEnvelopeAsync(
      {
        ...bundle,
        activeArtifactId: "missing",
      },
      { codec: "arx2" },
    )}`);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.activeArtifactId).toBe("notes");
  });

  it("decodes percent-escaped unicode arx2 payloads", async () => {
    const hash = `#${await encodeEnvelopeAsync(bundle, { codec: "arx2" })}`;
    const escapedHash = hash.replace(/[^\x00-\x7F]/g, (char) => encodeURIComponent(char));

    const parsed = await decodeFragmentAsync(escapedHash);
    expect(parsed.ok).toBe(true);
  });

  it("decodes arx and arx2 payloads when the active dictionary version differs", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    const arxHash = `#${await encodeEnvelopeAsync(bundle, { codec: "arx" })}`;
    const arx2Hash = `#${await encodeEnvelopeAsync(bundle, { codec: "arx2" })}`;
    const shiftedDictionary = {
      ...arxDictionaryJson,
      version: arxDictionaryJson.version + 100,
    };

    loadArxDictionarySync(shiftedDictionary);

    const arxParsed = await decodeFragmentAsync(arxHash);
    const arx2Parsed = await decodeFragmentAsync(arx2Hash);

    expect(arxParsed.ok).toBe(true);
    expect(arx2Parsed.ok).toBe(true);

    loadArxDictionarySync(arxDictionaryJson);
  });

  it("can decode arx2 payloads directly through the codec API", async () => {
    const payloads = await arx2CompressEnvelope(bundle);
    const decoded = await arx2DecompressEnvelope(payloads.base64url);

    expect(decoded).toEqual({ ...bundle, codec: "arx2" });
  });

  it("aborts brotli output that expands beyond the decoded payload budget", async () => {
    const hugeEnvelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      activeArtifactId: "huge",
      artifacts: [
        {
          id: "huge",
          kind: "markdown",
          content: "a".repeat(MAX_DECODED_PAYLOAD_LENGTH * 5),
        },
      ],
    };

    const payloads = await arx2CompressEnvelope(hugeEnvelope);
    await expect(arx2DecompressEnvelope(payloads.base64url)).rejects.toBeInstanceOf(ArxDecodedPayloadTooLargeError);

    const parsed = await decodeFragmentAsync(
      `#agent-render=v1.arx2.${getActiveDictVersion()}.${payloads.base64url}`,
      { skipFragmentBudget: true },
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("decoded-too-large");
  });

  it("loads the arx2 overlay separately from the shared arx dictionary", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      const dictionary = url.includes("arx2") ? arx2DictionaryJson : arxDictionaryJson;
      return new Response(JSON.stringify(dictionary), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    try {
      await loadArxDictionary("/arx-dictionary.json");
      await loadArx2OverlayDictionary("/arx2-dictionary.json");
      expect(requests).toEqual(["/arx-dictionary.json", "/arx2-dictionary.json"]);
    } finally {
      vi.unstubAllGlobals();
      loadArxDictionarySync(arxDictionaryJson);
      loadArx2OverlayDictionarySync(arx2DictionaryJson);
    }
  });

  it("loads the precompressed default arx dictionary before the json fallback", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(JSON.stringify(arxDictionaryJson), {
        headers: {
          "Content-Encoding": "br",
          "Content-Type": "application/json",
        },
        status: 200,
      });
    });

    try {
      await expect(loadArxDictionary()).resolves.toBe(arxDictionaryJson.version);
      expect(requests).toEqual(["/arx-dictionary.json.br"]);
    } finally {
      vi.unstubAllGlobals();
      loadArxDictionarySync(arxDictionaryJson);
    }
  });

  it("prefixes default dictionary requests with the normalized public base path", async () => {
    const requests: string[] = [];
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "agent-render");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(JSON.stringify(arxDictionaryJson), {
        headers: {
          "Content-Encoding": "br",
          "Content-Type": "application/json",
        },
        status: 200,
      });
    });

    try {
      await expect(loadArxDictionary()).resolves.toBe(arxDictionaryJson.version);
      expect(requests).toEqual(["/agent-render/arx-dictionary.json.br"]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      loadArxDictionarySync(arxDictionaryJson);
    }
  });

  it("falls back to the default json arx dictionary when the precompressed copy is unavailable", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(".br")) {
        return new Response("", { status: 404 });
      }
      return new Response(JSON.stringify(arxDictionaryJson), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    try {
      await expect(loadArxDictionary()).resolves.toBe(arxDictionaryJson.version);
      expect(requests).toEqual([
        "/arx-dictionary.json.br",
        "/arx-dictionary.json",
      ]);
    } finally {
      vi.unstubAllGlobals();
      loadArxDictionarySync(arxDictionaryJson);
    }
  });

  it("falls back to the default json arx dictionary when the precompressed copy is not valid JSON", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(".br")) {
        return new Response("not-json", { status: 200 });
      }
      return new Response(JSON.stringify(arxDictionaryJson), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    try {
      await expect(loadArxDictionary()).resolves.toBe(arxDictionaryJson.version);
      expect(requests).toEqual([
        "/arx-dictionary.json.br",
        "/arx-dictionary.json",
      ]);
    } finally {
      vi.unstubAllGlobals();
      loadArxDictionarySync(arxDictionaryJson);
    }
  });

  it("loads the precompressed default arx2 overlay before the json fallback", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(JSON.stringify(arx2DictionaryJson), {
        headers: {
          "Content-Encoding": "br",
          "Content-Type": "application/json",
        },
        status: 200,
      });
    });

    try {
      await expect(loadArx2OverlayDictionary()).resolves.toBe(arx2DictionaryJson.version);
      expect(requests).toEqual(["/arx2-dictionary.json.br"]);
    } finally {
      vi.unstubAllGlobals();
      loadArx2OverlayDictionarySync(arx2DictionaryJson);
    }
  });

  it("falls back to the default json arx2 overlay when the precompressed copy is unavailable", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(".br")) {
        return new Response("", { status: 404 });
      }
      return new Response(JSON.stringify(arx2DictionaryJson), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    try {
      await expect(loadArx2OverlayDictionary()).resolves.toBe(arx2DictionaryJson.version);
      expect(requests).toEqual([
        "/arx2-dictionary.json.br",
        "/arx2-dictionary.json",
      ]);
    } finally {
      vi.unstubAllGlobals();
      loadArx2OverlayDictionarySync(arx2DictionaryJson);
    }
  });

  it("falls back to the default json arx2 overlay when the precompressed copy is not valid JSON", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(".br")) {
        return new Response("not-json", { status: 200 });
      }
      return new Response(JSON.stringify(arx2DictionaryJson), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    try {
      await expect(loadArx2OverlayDictionary()).resolves.toBe(arx2DictionaryJson.version);
      expect(requests).toEqual([
        "/arx2-dictionary.json.br",
        "/arx2-dictionary.json",
      ]);
    } finally {
      vi.unstubAllGlobals();
      loadArx2OverlayDictionarySync(arx2DictionaryJson);
    }
  });
});

describe("arx dictionary trie scanner", () => {
  const singleByteCodes = [
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
    0x1d,
  ];
  const pairs: Array<[string, string]> = [
    ...arxDictionaryJson.singleByteSlots.slice(0, singleByteCodes.length).map((slot, index) => [
      slot,
      String.fromCharCode(singleByteCodes[index]),
    ] as [string, string]),
    ...arxDictionaryJson.extendedSlots.map((slot, index) => [
      slot,
      "\x00" + String.fromCharCode(index + 1),
    ] as [string, string]),
  ];

  function legacySplitJoinEncode(text: string): string {
    let result = text;
    for (const [from, to] of pairs) {
      result = result.split(from).join(to);
    }
    return result;
  }

  it("matches the legacy split/join encoder across adversarial inputs", () => {
    loadArxDictionarySync(arxDictionaryJson);
    const inputs = [
      "",
      "\x00\x01\x1f",
      "emoji 😀 payload fragment content markdown component envelope",
      "export function test() {\n  return artifact.payload.fragment;\n}\n".repeat(4),
      "{\"v\":1,\"codec\":\"arx\",\"artifacts\":[{\"id\":\"a\",\"kind\":\"markdown\",\"content\":\"# Hi\"}]}",
      "aaaaaaa".repeat(100),
      "import export import export function function const const ".repeat(20),
      ...Array.from({ length: 30 }, (_, index) => {
        const prefix = index % 2 === 0 ? "agent-render https:// " : "constructor prototype ";
        return `${prefix}${"payload".repeat(index + 1)}\0${"markdown".repeat(5)}`;
      }),
    ];

    for (const input of inputs) {
      expect(encodeArxDictionaryForTest(input)).toBe(legacySplitJoinEncode(input));
    }
  });
});
