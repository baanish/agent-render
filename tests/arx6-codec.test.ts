import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, priorBytesFor, type Arx4PriorId } from "@/lib/payload/arx4-codec";
import {
  arx6CompressEnvelope,
  arx6DecompressEnvelope,
  arx6PriorBytes,
  decodeArx6Wire,
  elideDiffPatch,
  encodeArx6Wire,
  restoreDiffPatch,
} from "@/lib/payload/arx6-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync, getFragmentTransportLength } from "@/lib/payload/fragment";
import { codecs, compactTagForCodec, type ArtifactPayload, type PayloadEnvelope } from "@/lib/payload/schema";

const ARX6_TAG = compactTagForCodec("arx6");

/** The wire's digits: RFC 3986 unreserved characters, with an alphanumeric last digit. */
const WIRE_PATTERN = /^(?:[0-9A-Za-z._~-]*[0-9A-Za-z])?$/;

/** Everything the raw container must carry verbatim: quotes, escapes, controls, DEL, U+2028, a pair. */
const TRICKY_BODY = 'say "hi"\n\tC:\\path \u0000 nul \u001f us \u007f del \u2028 ls \u{1F600} pair\r\nend';

function bundle(artifacts: ArtifactPayload[], activeIndex = 0, title?: string): PayloadEnvelope {
  return { v: 1, codec: "arx6", title, activeArtifactId: artifacts[activeIndex].id, artifacts };
}

const notes = {
  id: "notes",
  kind: "markdown",
  title: "Two\nline title",
  filename: "notes.md",
  content: `# Notes\n\n${TRICKY_BODY}`,
} satisfies ArtifactPayload;

const everyKind: ArtifactPayload[] = [
  notes,
  { id: "main", kind: "code", language: "ts", filename: "main.ts", content: "export const answer = 42;\n" },
  { id: "rows", kind: "csv", content: 'name,score\n"a, b",1\nc,2\n' },
  { id: "data", kind: "json", content: '{\n  "ok": true,\n  "list": [1, 2]\n}' },
  {
    id: "patch",
    kind: "diff",
    view: "split",
    language: "ts",
    patch: "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n",
  },
  { id: "pair", kind: "diff", oldContent: TRICKY_BODY, newContent: "" },
  { id: "all-three", kind: "diff", patch: "@@ -1 +1 @@\n-a\n+b\n", oldContent: "a\n", newContent: "b\n" },
  { id: "empty", kind: "markdown", content: "" },
];

/** Codes `container` exactly as arx6 would, so the decoder can be fed tuples the encoder never writes. */
function craftedFragmentPayload(container: string): string {
  return `n${encodeArx6Wire(new TextEncoder().encode(container), null)}`;
}

/** Deterministic xorshift32 so the fuzz cases are the same on every run. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** Pinned `#g` payloads (after the tag), one per prior id; the `n` row is a two-diff bundle with a title. */
const GOLDEN_VECTORS: Array<[Arx4PriorId, PayloadEnvelope, string]> = [
  ["m", {"v":1,"codec":"arx6","activeArtifactId":"notes","artifacts":[{"id":"notes","kind":"markdown","title":"Notes","content":"# Release notes\n\n- Faster links\n- \"Quoted\" text, café\n"}]}, "mLjdGAtqiMne3spL4~pDPFl8sCMjwJK5prGaD2TZjri5AEaEiRMSVHkYAMhI"],
  ["c", {"v":1,"codec":"arx6","activeArtifactId":"main","artifacts":[{"id":"main","kind":"code","language":"ts","filename":"main.ts","content":"export function add(a: number, b: number): number {\n  return a + b;\n}\n"}]}, "cSOYjOQb0wv1HIdlSQ~p4UO8ztvHJcc1V-ATqXn9w0zC7BwBbFh"],
  ["j", {"v":1,"codec":"arx6","activeArtifactId":"data","artifacts":[{"id":"data","kind":"json","content":"{\n  \"name\": \"agent-render\",\n  \"codecs\": [\"arx5\", \"arx6\"]\n}\n"}]}, "jKOGsrSatcD4_W4~wQd28A3I5AW~ClaHDVi~rjJczTu"],
  ["s", {"v":1,"codec":"arx6","activeArtifactId":"sheet","artifacts":[{"id":"sheet","kind":"csv","content":"name,score\nada,3\nlin,5\n"}]}, "sBOlpDPy7G3GWF02nz7RBh~QWn8fStW7-0IOqI"],
  ["n", {"v":1,"codec":"arx6","title":"Bundle","activeArtifactId":"patch","artifacts":[{"id":"patch","kind":"diff","patch":"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n","view":"split"},{"id":"pair","kind":"diff","oldContent":"a\n","newContent":"b\n","language":"ts"}]}, "nXY97WQnsK8W.ksR_UbTK~9qH_dCG948DR_W0X9spZWfw_ZfOF39PS-~OCuzD8Hk79NzTboqTm-o6koo2vgBsK.0hgVKIznTAwbKj8_QV-3nZ29QhK3nD6mU"],
];

describe("arx6 codec", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson);
  });

  it("registers arx6 as a supported codec with compact tag g", () => {
    expect(codecs).toContain("arx6");
    expect(ARX6_TAG).toBe("g");
  });

  it("round-trips every artifact kind on its own", () => {
    for (const artifact of everyKind) {
      const envelope = bundle([artifact], 0, artifact.title);
      const payload = arx6CompressEnvelope(envelope);

      expect(payload).not.toBeNull();
      expect(arx6DecompressEnvelope(payload!)).toEqual(envelope);
    }
  }, 60_000);

  it("round-trips a multi-artifact bundle, keeping the active artifact and bundle title", async () => {
    const envelope = bundle(everyKind, 4, "Everything at once");

    expect(arx6DecompressEnvelope(arx6CompressEnvelope(envelope)!)).toEqual(envelope);

    const fragment = await encodeEnvelopeAsync(envelope, { codec: "arx6" });
    expect(fragment.slice(0, 2)).toMatch(/^g[mcjsn]$/);
    expect(fragment.slice(2)).toMatch(WIRE_PATTERN);
    const parsed = await decodeFragmentAsync(`#${fragment}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope).toEqual(envelope);
  }, 60_000);

  it("names the prior the payload was coded against", () => {
    expect(arx6CompressEnvelope(bundle([notes]))!.charAt(0)).toBe("m");
    expect(arx6CompressEnvelope(bundle([notes]), "n")!.charAt(0)).toBe("n");
  });

  it("primes on the pinned prior compositions", () => {
    const digests = Object.fromEntries((["m", "c", "j"] as const).map((priorId) => [
      priorId,
      createHash("sha256").update(arx6PriorBytes(priorId)!).digest("hex"),
    ]));
    expect(digests).toEqual({
      m: "26207947fffb57741f1555ad877dbee6be3d3cb4eb15118e2965b3794f46762e",
      c: "9b27bf4b6917f72dd892d2a0be5a75c043e372b542a9745745fcbd85132ed6fd",
      j: "56ad78959e9424fae8cb3d925621221dc1727d1c53b3d02e39430c7a3d5b0546",
    });
    expect(arx6PriorBytes("s")).toEqual(priorBytesFor("s"));
    expect(arx6PriorBytes("n")).toBeNull();
  });

  // Characterization of the representation, independent of the model: the payload-format doc shows
  // the first container, so update both together.
  it("codes the raw container: the bodies verbatim, a newline, then the tuple with body lengths", () => {
    const containerOf = (envelope: PayloadEnvelope) => {
      const payload = arx6CompressEnvelope(envelope)!;
      const primeBytes = arx6PriorBytes(payload.charAt(0) as Arx4PriorId);
      return new TextDecoder("utf-8", { ignoreBOM: true }).decode(decodeArx6Wire(payload.slice(1), primeBytes));
    };

    expect(containerOf(bundle([{ id: "notes", kind: "markdown", title: "Notes", content: "# Hi" }]))).toBe(
      '# Hi\n[3,["m","notes",-1,"Notes"]]',
    );
    expect(containerOf(bundle([{ id: "p", kind: "diff", oldContent: "a\n", newContent: "b\"\n" }]))).toBe(
      'a\nb"\n\n[3,["d","p",null,2,-1]]',
    );
  }, 60_000);

  it("keeps a byte order mark at the start of the container", () => {
    const bomCsv = { id: "sheet", kind: "csv", content: "\uFEFFname,score\na,1\n" } satisfies ArtifactPayload;
    const after = { id: "after", kind: "markdown", content: "# Second\nbody" } satisfies ArtifactPayload;
    const bomDiff = {
      id: "patch",
      kind: "diff",
      patch: "\uFEFFdiff --git a/x b/x\n",
      oldContent: "\uFEFFold\n",
      newContent: "\uFEFFnew\n",
    } satisfies ArtifactPayload;

    for (const envelope of [bundle([bomCsv, after]), bundle([bomDiff]), bundle([{ ...after, content: "" }, bomCsv])]) {
      expect(arx6DecompressEnvelope(arx6CompressEnvelope(envelope)!)).toEqual(envelope);
    }
  }, 60_000);

  // Golden fragments: every shared #g link depends on these bytes, so a model, prior, container or wire
  // change that alters them is a wire change that needs a new compact tag, not an update to this table.
  it("encodes the pinned golden fragments", () => {
    const golden: Array<[Arx4PriorId, PayloadEnvelope, string]> = GOLDEN_VECTORS;
    for (const [priorId, envelope, expected] of golden) {
      expect(arx6CompressEnvelope(envelope, priorId)).toBe(expected);
      expect(arx6DecompressEnvelope(expected)).toEqual(envelope);
    }
  }, 60_000);

  it("still decodes a diff container that keeps its patch verbatim", () => {
    // The `n` golden fragment from before patch elision, which stored the patch under the plain "d" code.
    const verbatim = "neEZz7hGsK8W.ksS6meaC8wxIx1-B0g7tQXva5MV3H6MC3coc~P.nDDWrD1TSne8ybwXIEqFD~V_~uRhuuJaq6h3mt04vnm_nGzaM87LlJvTMy6L2Srmu1OcS0dOIiRAEAAz";
    expect(arx6DecompressEnvelope(verbatim)).toEqual(GOLDEN_VECTORS[4][1]);
  }, 60_000);

  it("declines a lone surrogate in a body and leaves the envelope to arx5", async () => {
    const envelope = bundle([{ id: "half", kind: "markdown", content: "cut \ud800 here" }]);

    expect(arx6CompressEnvelope(envelope)).toBeNull();
    await expect(encodeEnvelopeAsync(envelope, { codec: "arx6" })).rejects.toThrow();

    const fragment = await encodeEnvelopeAsync(envelope, { codecPriority: ["arx6", "arx5"] });
    expect(fragment.startsWith(compactTagForCodec("arx5"))).toBe(true);
    const parsed = await decodeFragmentAsync(`#${fragment}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.artifacts[0]).toMatchObject({ content: "cut \ud800 here" });
  }, 60_000);

  it("still carries a lone surrogate in metadata, which the JSON header escapes", () => {
    const envelope = bundle([{ id: "meta", kind: "markdown", title: "cut \udc00 here", content: "body" }], 0, "t");

    expect(arx6DecompressEnvelope(arx6CompressEnvelope(envelope)!)).toEqual(envelope);
  }, 60_000);

  it("rejects containers whose body lengths do not add up", async () => {
    // Precondition: the crafting path itself produces a decodable fragment.
    expect(arx6DecompressEnvelope(craftedFragmentPayload('hello\n[3,["m","a",-1]]'))).toMatchObject({
      artifacts: [{ id: "a", kind: "markdown", content: "hello" }],
    });

    const malformed = [
      '[3,["m","a",-1]]',
      '[3,["m","a",-1]]\nhello',
      'hello\n[3,["m","a",5]]',
      '\n[3,["m","a","hello"]]',
      'abcdef\n[2,[["m","a",-1],["m","b",3]]]',
      'abc\n[2,[["m","a",9],["m","b",-1]]]',
      'abc\n[2,[["m","a",-2],["m","b",-1]]]',
      'abc\n[2,[["m","a",1.5],["m","b",-1]]]',
      'trailing\n[3,["d","a"]]',
      'abc\n[3,["x","a",-1]]',
      'abc\n[3,"m"]',
      "abc\nnot json",
      'hello\n[3,["m","a",-1]',
    ];

    for (const container of malformed) {
      const payload = craftedFragmentPayload(container);
      expect(() => arx6DecompressEnvelope(payload), container).toThrow();

      const parsed = await decodeFragmentAsync(`#${ARX6_TAG}${payload}`);
      expect(parsed.ok, container).toBe(false);
    }
  }, 60_000);

  it("elides diff patch paths and hunk counts, and restores real-world patches exactly", () => {
    const multiFile = [
      "diff --git a/src/app.ts b/src/app.ts",
      "index 3b18e51..a9c2f04 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,4 @@ export function main() {",
      " import { a } from './a';",
      "+import { b } from './b';",
      " ",
      " main();",
      "@@ -10,2 +11,2 @@",
      "-old();",
      "+next();",
      " done();",
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+one",
      "+two",
      "\\ No newline at end of file",
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
      "diff --git a/old name.md b/new name.md",
      "similarity index 90%",
      "rename from old name.md",
      "rename to new name.md",
      "--- a/old name.md",
      "+++ b/new name.md",
      "@@ -2 +2 @@",
      "-x",
      "+y",
      "",
    ].join("\n");
    // Quoted and unprefixed headers read as already elided, so the guard keeps these patches verbatim.
    const quoted = 'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"\n--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -1 +1 @@\n-a\n+b\n';
    const noPrefix = "diff --git x.ts x.ts\n--- x.ts\n+++ x.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const nonCanonical = "--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n@@ -5,2 +9,2 @@ moved\n a\n-b\n+c\n";
    const crlf = "diff --git a/x b/x\r\n--- a/x\r\n+++ b/x\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n";
    const bomLeading = "﻿diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n";
    const prefixedPath = "diff --git a/a/x b/a/x\n--- a/a/x\n+++ b/a/x\n@@ -1 +1 @@\n-a\n+b";

    expect(elideDiffPatch(multiFile)).toContain("diff --git src/app.ts\nindex 3b18e51..a9c2f04 100644\n---\n+++\n@@ -1 @@ export");
    expect(elideDiffPatch(multiFile)).toContain("@@ -10 @@\n-old();");
    for (const patch of [multiFile, bomLeading, prefixedPath]) {
      expect(restoreDiffPatch(elideDiffPatch(patch)!, () => {}), patch).toBe(patch);
    }
    for (const patch of [multiFile, quoted, noPrefix, nonCanonical, crlf, bomLeading, prefixedPath]) {
      const envelope = bundle([{ id: "patch", kind: "diff", patch, view: "unified" }]);
      expect(arx6DecompressEnvelope(arx6CompressEnvelope(envelope)!), patch).toEqual(envelope);
    }
  }, 60_000);

  it("keeps a patch verbatim when eliding it would not restore exactly", () => {
    // A bare "---" in a file header would restore as "--- a/x".
    const patch = "diff --git a/x b/x\n---\n+++ b/x\n";
    const envelope = bundle([{ id: "patch", kind: "diff", patch }]);
    const payload = arx6CompressEnvelope(envelope)!;
    const container = new TextDecoder().decode(decodeArx6Wire(payload.slice(1), arx6PriorBytes(payload.charAt(0) as Arx4PriorId)));

    expect(restoreDiffPatch(elideDiffPatch(patch)!, () => {})).not.toBe(patch);
    expect(container).toBe(`${patch}\n[3,["d","patch",-1]]`);
    expect(arx6DecompressEnvelope(payload)).toEqual(envelope);
  }, 60_000);

  it("rejects elided diff containers the encoder cannot emit", async () => {
    // Precondition: an elided container the encoder would write decodes to the full patch.
    expect(arx6DecompressEnvelope(craftedFragmentPayload('diff --git x\n---\n+++\n@@ -1 @@\n-a\n+b\n\n[3,["D","p",-1]]'))).toMatchObject({
      artifacts: [{ id: "p", kind: "diff", patch: "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n" }],
    });

    const longPath = "p".repeat(1000);
    const malformed = [
      'diff --git x\n[3,["E","p",-1]]',
      'diff --git x\n[3,["dX","p",-1]]',
      'diff --git a/x b/x\n[3,["D","p",-1]]',
      'hello\n[3,["D","p",-1]]',
      'a\n[3,["D","p",null,-1]]',
      '@@ -1,5 +1,5 @@\n-a\n[3,["D","p",-1]]',
      `diff --git ${longPath}\n${"---\n".repeat(300)}\n[3,["D","p",-1]]`,
    ];

    for (const container of malformed) {
      const payload = craftedFragmentPayload(container);
      expect(() => arx6DecompressEnvelope(payload), container.slice(0, 40)).toThrow();

      const parsed = await decodeFragmentAsync(`#${ARX6_TAG}${payload}`);
      expect(parsed.ok, container.slice(0, 40)).toBe(false);
    }
    expect(() => arx6DecompressEnvelope(craftedFragmentPayload(malformed[6]))).toThrow(/budget/);
  }, 60_000);

  it("rejects a digit outside the wire alphabet, a punctuation last digit, and an unknown prior id", () => {
    const valid = craftedFragmentPayload('hello\n[3,["m","a",-1]]');
    const digits = valid.slice(1);

    for (const outsider of ["+", "/", "=", "#", "%", " ", "\u00e9"]) {
      expect(() => arx6DecompressEnvelope(`n${digits.slice(0, 3)}${outsider}${digits.slice(3)}`), outsider).toThrow(/outside/);
    }
    for (const punctuation of ["-", ".", "_", "~"]) {
      expect(() => arx6DecompressEnvelope(`n${digits}${punctuation}`), punctuation).toThrow(/must end/);
    }
    expect(() => arx6DecompressEnvelope(`z${digits}`)).toThrow(/prior id/);
  });

  it("round-trips coded bytes at every size on a chat-safe wire that never ends in punctuation", () => {
    const random = createRandom(0x6a09e667);
    const prime = priorBytesFor("s");
    const sizes = [
      ...Array.from({ length: 33 }, (_, size) => size),
      ...Array.from({ length: 30 }, () => 33 + (random() % 4000)),
    ];
    const seenDigits = new Set<string>();

    sizes.forEach((size, caseIndex) => {
      // Alternate high-entropy bytes with text-like runs, which leave the coder in very different states.
      const input = Uint8Array.from({ length: size }, (_, index) => (
        caseIndex % 2 === 0 ? random() & 0xff : 0x61 + ((index * 7 + (random() % 3)) % 26)
      ));
      const primeBytes = caseIndex % 3 === 0 ? prime : null;
      const wire = encodeArx6Wire(input, primeBytes);

      expect(wire, `size ${size}`).toMatch(WIRE_PATTERN);
      expect(getFragmentTransportLength(wire), `size ${size}`).toBe(wire.length);
      expect(Buffer.from(decodeArx6Wire(wire, primeBytes)).equals(Buffer.from(input)), `size ${size}`).toBe(true);
      for (const digit of wire) seenDigits.add(digit);
    });

    // The fuzz reaches every digit, so the alphabet checks above are not passing vacuously.
    expect(seenDigits.size).toBe(66);
  }, 60_000);

  it("rejects truncated links instead of rendering a garbled tail", () => {
    for (const envelope of [bundle([notes]), bundle(everyKind, 1, "Everything at once")]) {
      const payload = arx6CompressEnvelope(envelope)!;
      // Precondition: the untruncated payload decodes.
      expect(arx6DecompressEnvelope(payload)).toEqual(envelope);

      for (let cut = 1; cut <= 12; cut++) {
        expect(() => arx6DecompressEnvelope(payload.slice(0, -cut)), `cut ${cut}`).toThrow();
      }
    }
  }, 60_000);

  it("wins auto selection over arx5 with a chat-safe ASCII wire", async () => {
    const envelope = bundle(
      [{
        id: "baanish-code-bench",
        kind: "markdown",
        title: "Baanish Code Bench",
        filename: "results.md",
        content: readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8"),
      }],
      0,
      "Baanish Code Bench",
    );

    const autoFragment = await encodeEnvelopeAsync(envelope);
    const arx5Fragment = await encodeEnvelopeAsync(envelope, { codec: "arx5" });

    expect(autoFragment.slice(0, 2)).toBe("gm");
    expect(autoFragment.slice(2)).toMatch(WIRE_PATTERN);
    expect(getFragmentTransportLength(autoFragment)).toBe(autoFragment.length);
    expect(getFragmentTransportLength(autoFragment)).toBeLessThan(getFragmentTransportLength(arx5Fragment));

    const parsed = await decodeFragmentAsync(`#${autoFragment}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope).toEqual(envelope);
  }, 60_000);

  // Last, because it swaps in a fresh module graph whose priors slot starts cold.
  it("fetches the curated priors before decoding a curated arx6 fragment on a cold page", async () => {
    const fragment = await encodeEnvelopeAsync(bundle([notes]), { codec: "arx6" });
    expect(fragment.slice(0, 2)).toBe(`${ARX6_TAG}m`);

    vi.resetModules();
    const coldArxCodec = await import("@/lib/payload/arx-codec");
    coldArxCodec.loadArxDictionarySync(arxDictionaryJson);
    coldArxCodec.loadArx2OverlayDictionarySync(arx2DictionaryJson);
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(arx4PriorsJson) } as Response));
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const { decodeFragmentAsync: decodeOnColdPage } = await import("@/lib/payload/fragment");
      const parsed = await decodeOnColdPage(`#${fragment}`);

      expect(fetchSpy).toHaveBeenCalled();
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope.artifacts[0]).toMatchObject({ content: notes.content });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
