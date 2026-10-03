// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import arxDictionary from "../public/arx-dictionary.json";
import arx2Dictionary from "../public/arx2-dictionary.json";
import arx4Priors from "../public/arx4-priors.json";
import {
  envelopeToArx2Tuple,
  getArxDictionaryPriorText,
  loadArxDictionarySync,
  loadArx2OverlayDictionarySync,
} from "@/lib/payload/arx-codec";
import { curatedArx4PriorBlocks, loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import { arx6CompressEnvelope, arx6DecompressEnvelope, arx6PriorBytes, decodeArx6V2Wire, encodeArx6V2Wire } from "@/lib/payload/arx6-codec";
import { encodeArx6String } from "@/lib/payload/arx6-bytes";
import { decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { isPayloadEnvelope, MAX_DECODED_PAYLOAD_LENGTH, type PayloadEnvelope } from "@/lib/payload/schema";

function envelope(content: string): PayloadEnvelope {
  return { v: 1, codec: "arx6", activeArtifactId: "text", artifacts: [{ id: "text", kind: "markdown", content }] };
}

function installAssets(): void {
  loadArxDictionarySync(arxDictionary);
  loadArx2OverlayDictionarySync(arx2Dictionary);
  expect(loadArx4PriorsSync(arx4Priors)).toBe(1);
}

function forgedV2Payload(container: string): string {
  const bytes = encodeArx6String(container);
  return `2n${encodeArx6V2Wire(bytes, null, "g2n")}`;
}

describe("ARX6 independent adversarial checks", () => {
  beforeAll(installAssets);

  it("owns dictionary arrays and curated blocks after their installation", () => {
    const base = structuredClone(arxDictionary);
    const overlay = structuredClone(arx2Dictionary);
    const priors = structuredClone(arx4Priors);
    loadArxDictionarySync(base);
    loadArx2OverlayDictionarySync(overlay);
    expect(loadArx4PriorsSync(priors)).toBe(1);
    const expectedText = getArxDictionaryPriorText();
    const expectedPrior = arx6PriorBytes("m");

    try {
      base.singleByteSlots[0] = "changed after installation";
      base.extendedSlots.push("extra mutable slot");
      overlay.singleByteSlots.fill("changed overlay");
      overlay.extendedSlots.length = 0;
      priors.kinds.markdown = "changed after the pinned digest was verified";
      priors.kinds.json = "changed head block";
      priors.version = 99;

      expect(getArxDictionaryPriorText()).toBe(expectedText);
      expect(arx6PriorBytes("m")).toEqual(expectedPrior);

      const exposed = curatedArx4PriorBlocks("m");
      expect(Object.isFrozen(exposed)).toBe(true);
      expect(() => { (exposed as Record<string, string>).markdown = "changed through returned blocks"; }).toThrow();
      expect(arx6PriorBytes("m")).toEqual(expectedPrior);

      const returnedBytes = arx6PriorBytes("m")!;
      returnedBytes.fill(0);
      expect(arx6PriorBytes("m")).toEqual(expectedPrior);
    } finally {
      installAssets();
    }
  });

  it("retains the installed priors when replacement bytes fail their identity pins", () => {
    const expected = arx6PriorBytes("j");
    const altered = structuredClone(arx4Priors);
    altered.kinds.json = `x${altered.kinds.json.slice(1)}`;
    expect(loadArx4PriorsSync(altered)).toBe(-1);
    expect(arx6PriorBytes("j")).toEqual(expected);
  });

  it("preserves UTF-16 body boundaries even when adjacent lone halves form a pair", async () => {
    const input: PayloadEnvelope = {
      v: 1,
      codec: "arx6",
      title: "\ud800 Bundle \udfff",
      activeArtifactId: "diff",
      artifacts: [
        { id: "markdown", kind: "markdown", content: "\ufeffMarkdown\r\n\ud800", title: "", filename: "m\ud800.md" },
        { id: "empty", kind: "markdown", content: "" },
        { id: "code", kind: "code", content: "\udc00const value = '\\n';\r\n\udbff", language: "x\udfff" },
        { id: "csv", kind: "csv", content: '\udfffname,note\r\n"a,b","line 1\nline 2"\r\n\0' },
        { id: "json", kind: "json", content: '{"escape":"\\ud800","value":"\ud800"}\n' },
        { id: "diff", kind: "diff", patch: "--- a/x\r\n+++ b/x\r\n", oldContent: "old\ud800", newContent: "\udc00new", view: "split" },
      ],
    };
    const before = JSON.stringify(input);
    const payload = arx6CompressEnvelope(input, "n");
    expect(payload).not.toBeNull();
    expect(arx6DecompressEnvelope(payload!)).toEqual(input);
    expect(JSON.stringify(input)).toBe(before);
    const parsed = await decodeFragmentAsync(`#g${payload}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope).toEqual(input);
  }, 60_000);

  it("normalizes a stale active artifact and validates semantically invalid bundles", async () => {
    const input = { ...envelope("# Valid body"), activeArtifactId: "missing" };
    const fragment = await encodeEnvelopeAsync(input, { codec: "arx6" });
    const parsed = await decodeFragmentAsync(`#${fragment}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope.activeArtifactId).toBe("text");

    const invalid: PayloadEnvelope[] = [
      { ...envelope(""), artifacts: [] },
      { ...envelope(""), artifacts: [{ id: "same", kind: "markdown", content: "a" }, { id: "same", kind: "json", content: "{}" }] },
      { ...envelope(""), artifacts: [{ id: "patch", kind: "diff", patch: "" }] },
      { ...envelope(""), artifacts: [{ id: "patch", kind: "diff", oldContent: "a" }] },
    ];
    for (const value of invalid) expect(() => arx6CompressEnvelope(value, "n")).toThrow();
  }, 60_000);

  it("does not mistake optional non-string diff values for body lengths", () => {
    // The shared schema permits a valid old/new pair even when its unrelated patch field is not text.
    // That optional value must follow the existing tuple decoder's omission semantics, never consume
    // a character from the next body merely because it happens to be a small integer.
    for (const patch of [0, 1, -1, 5, false, { unknown: true }]) {
      const value: unknown = {
        v: 1,
        codec: "arx6",
        activeArtifactId: "diff",
        artifacts: [{ id: "diff", kind: "diff", patch, oldContent: "before\ud800", newContent: "\udc00after" }],
      };
      expect(isPayloadEnvelope(value)).toBe(true);
      if (!isPayloadEnvelope(value)) throw new Error("Invalid test precondition.");
      const decoded = arx6DecompressEnvelope(arx6CompressEnvelope(value, "n"));
      expect(decoded.artifacts[0]).toMatchObject({ kind: "diff", oldContent: "before\ud800", newContent: "\udc00after" });
      expect((decoded.artifacts[0] as { patch?: unknown }).patch).toBeUndefined();
    }
  }, 60_000);

  it("budgets the reconstructed envelope, including JSON escaping and object keys", () => {
    const controls = envelope("\0".repeat(Math.ceil(MAX_DECODED_PAYLOAD_LENGTH / 6)));
    const manyArtifacts: PayloadEnvelope = {
      v: 1,
      codec: "arx6",
      activeArtifactId: "a0",
      artifacts: Array.from({ length: 5000 }, (_, index) => ({ id: `a${index}`, kind: "markdown", content: "" })),
    };
    expect(JSON.stringify(envelopeToArx2Tuple(manyArtifacts)).length).toBeLessThan(MAX_DECODED_PAYLOAD_LENGTH);
    for (const value of [controls, manyArtifacts]) {
      expect(JSON.stringify(value).length).toBeGreaterThan(MAX_DECODED_PAYLOAD_LENGTH);
      expect(() => arx6CompressEnvelope(value, "n")).toThrow(/200,?000|budget|limit/i);
    }
  });

  it("validates decoded schema and expanded envelope size even with a valid checksum", async () => {
    const valid = forgedV2Payload('hello\n[3,["m","a",-1]]');
    expect(arx6DecompressEnvelope(valid).artifacts[0]).toMatchObject({ id: "a", content: "hello" });

    const malformed = [
      'x\n[3,["m",4,-1]]',
      'ab\n[2,[["m","dup",1],["m","dup",-1]]]',
      '\n[3,["d","p",null,-1]]',
      'patch\n[3,["d","p",-1,null,null,null,"sideways"]]',
    ];
    for (const container of malformed) {
      const payload = forgedV2Payload(container);
      expect(() => arx6DecompressEnvelope(payload), container).toThrow();
      expect((await decodeFragmentAsync(`#g${payload}`)).ok, container).toBe(false);
    }

    const tinyBodies = Array.from({ length: 5000 }, (_, index) => ["m", `a${index}`, index === 4999 ? -1 : 0]);
    const oversized = forgedV2Payload(`\n${JSON.stringify([2, tinyBodies])}`);
    expect(() => arx6DecompressEnvelope(oversized)).toThrow(/200,?000|budget|limit/i);
    expect(await decodeFragmentAsync(`#g${oversized}`, { skipFragmentBudget: true })).toMatchObject({
      ok: false,
      code: "decoded-too-large",
    });
  }, 60_000);

  it("rejects alternate numerators even when they retain the same embedded checksum", () => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~";
    const modulus = BigInt(1) << BigInt(32);
    let canonicalRejections = 0;
    for (let index = 0; index < 48; index++) {
      const bytes = new TextEncoder().encode(`alias-${index}\n${"repeat x,y,z ".repeat(index % 7)}`);
      const wire = encodeArx6V2Wire(bytes, null);
      let numerator = BigInt(0);
      let denominator = BigInt(1);
      for (let position = 0; position < wire.length; position++) {
        const radix = BigInt(position === wire.length - 1 ? 62 : 66);
        numerator = numerator * radix + BigInt(alphabet.indexOf(wire[position]));
        denominator *= radix;
      }

      for (const alternative of [numerator - modulus, numerator + modulus]) {
        if (alternative < BigInt(0) || alternative >= denominator) continue;
        expect(alternative % modulus).toBe(numerator % modulus);
        let remainder = alternative;
        const digits = new Array<string>(wire.length);
        for (let position = wire.length - 1; position >= 0; position--) {
          const radix = BigInt(position === wire.length - 1 ? 62 : 66);
          digits[position] = alphabet[Number(remainder % radix)];
          remainder /= radix;
        }
        let failure: unknown;
        try { decodeArx6V2Wire(digits.join(""), null); }
        catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(Error);
        if (failure instanceof Error && /canonical/.test(failure.message)) canonicalRejections++;
      }
    }
    // At least one alternative stays inside its original message's final interval and passes CRC;
    // rejecting it must therefore come from the canonical fraction check itself.
    expect(canonicalRejections).toBeGreaterThan(0);
  }, 60_000);

  it("accepts an exactly bounded envelope and rejects one additional source character", () => {
    const value = envelope("");
    value.artifacts[0] = { id: "text", kind: "markdown", content: "a".repeat(MAX_DECODED_PAYLOAD_LENGTH - JSON.stringify(value).length) };
    expect(JSON.stringify(value).length).toBe(MAX_DECODED_PAYLOAD_LENGTH);
    const payload = arx6CompressEnvelope(value, "n");
    expect(payload).not.toBeNull();
    expect(arx6DecompressEnvelope(payload!)).toEqual(value);

    const tooLarge = envelope(`${(value.artifacts[0] as { content: string }).content}a`);
    expect(() => arx6CompressEnvelope(tooLarge, "n")).toThrow(/200,?000|budget|limit/i);
  }, 60_000);
});
