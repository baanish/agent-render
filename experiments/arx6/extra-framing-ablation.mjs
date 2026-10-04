/** Diagnostic-only framing comparisons. No candidate changes production sources or emits a viewer link. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
const [corpusPath, outputPath, requested = "base,midpoint,tuple-first,binary-first,zero-null"] = process.argv.slice(2);
if (!corpusPath || !outputPath) throw new Error("Usage: node experiments/arx6/extra-framing-ablation.mjs corpus.json output.json [variants]");
const original = readFileSync(root + "src/lib/payload/arx6-codec.ts", "utf8");
const sourceFiles = [
  "src/lib/payload/arx6-codec.ts", "src/lib/payload/arx6-v2-model.ts",
  "src/lib/payload/arx6-bytes.ts", "src/lib/payload/arx4-codec.ts",
  "src/lib/payload/arx-codec.ts", "public/arx-dictionary.json",
  "public/arx2-dictionary.json", "public/arx4-priors.json",
  "tests/arx6-codec.test.ts", "tests/arx6-adversarial.test.ts",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = Object.fromEntries(sourceFiles.map((path) => [path, sha256(readFileSync(root + path))]));
const extra = `
export { envelopeToRawContainer, rawContainerToEnvelope, normalizeV2Envelope, encodeArx6String, decodeArx6String };
export { loadArxDictionarySync, loadArx2OverlayDictionarySync } from '@/lib/payload/arx-codec';
export { loadArx4PriorsSync, arx4PriorIdForEnvelope } from '@/lib/payload/arx4-codec';`;
const load = async (source) => {
  const result = buildSync({ stdin: { contents: source + extra, resolveDir: root, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, external: ["brotli-wasm"], tsconfig: root + "tsconfig.json" });
  const codec = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
  for (const [file, fn] of [["arx-dictionary.json", "loadArxDictionarySync"], ["arx2-dictionary.json", "loadArx2OverlayDictionarySync"], ["arx4-priors.json", "loadArx4PriorsSync"]]) codec[fn](JSON.parse(readFileSync(root + "public/" + file, "utf8")));
  return codec;
};
const baseline = await load(original);
const exactSource = original.replaceAll("Math.floor((this.x2 - this.x1) / 4096) * probability", "Math.floor(((this.x2 - this.x1) * probability) / 4096)");
assert.notEqual(exactSource, original);
const exact = await load(exactSource);
// Definite-length CBOR-style headers, with the production WTF-8 string representation. This is a
// trusted-input experiment, not an exposed CBOR parser or a proposal to change published g2 decoding.
function cbor(value, out = []) {
  const header = (major, n) => {
    if (n < 24) out.push(major * 32 + n);
    else if (n < 256) out.push(major * 32 + 24, n);
    else if (n < 65536) out.push(major * 32 + 25, n >>> 8, n & 255);
    else out.push(major * 32 + 26, n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255);
  };
  if (value === null) out.push(246);
  else if (typeof value === "number") header(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  else if (typeof value === "string") {
    const bytes = baseline.encodeArx6String(value);
    header(3, bytes.length);
    for (const byte of bytes) out.push(byte);
  } else if (Array.isArray(value)) {
    header(4, value.length);
    for (const field of value) cbor(field, out);
  } else throw Error("Unsupported metadata field");
  return out;
}
function uncbor(bytes) {
  let offset = 0;
  const read = () => {
    const code = bytes[offset++];
    if (code === 246) return null;
    const major = code >>> 5;
    let length = code & 31;
    if (length === 24) length = bytes[offset++];
    else if (length === 25) length = bytes[offset++] * 256 + bytes[offset++];
    else if (length === 26) length = bytes[offset++] * 16777216 + bytes[offset++] * 65536 + bytes[offset++] * 256 + bytes[offset++];
    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 3) {
      const result = baseline.decodeArx6String(bytes.slice(offset, offset + length));
      offset += length;
      return result;
    }
    if (major === 4) return Array.from({ length }, read);
    throw Error("Unsupported binary metadata");
  };
  return { value: read(), get offset() {
    return offset;
  } };
}
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const variants = requested.split(",");
if (variants[0] === "check") variants.length = 0;
assert(variants.every((name) => ["base", "midpoint", "tuple-first", "binary-first", "zero-null"].includes(name)));
const rows = [];
for (const sample of corpus) {
  const envelope = baseline.normalizeV2Envelope(sample.envelope);
  const raw = baseline.envelopeToRawContainer(envelope);
  const boundary = raw.lastIndexOf("\n");
  const body = raw.slice(0, boundary), footer = raw.slice(boundary + 1), tuple = JSON.parse(footer);
  const bytes = baseline.encodeArx6String(raw);
  const first = baseline.encodeArx6String(footer + "\n" + body);
  const firstText = baseline.decodeArx6String(first);
  const firstBoundary = firstText.indexOf("\n");
  assert.equal(`${firstText.slice(firstBoundary + 1)}\n${firstText.slice(0, firstBoundary)}`, raw);
  const binary = Uint8Array.from([...cbor(tuple), ...baseline.encodeArx6String(body)]);
  const zeroTuple = JSON.parse(footer);
  for (const artifact of zeroTuple[0] === 3 ? [zeroTuple[1]] : zeroTuple[1]) {
    const diff = ["d", "D"].includes(artifact[0]);
    for (let i = diff ? 5 : 3; i < artifact.length; i++) if (artifact[i] === null && !(diff && i === 6)) artifact[i] = 0;
  }
  if (zeroTuple[2] === null) zeroTuple[2] = 0;
  const zeroNull = baseline.encodeArx6String(body + "\n" + JSON.stringify(zeroTuple));
  assert.deepEqual(baseline.rawContainerToEnvelope(baseline.decodeArx6String(zeroNull), true), baseline.rawContainerToEnvelope(raw, true));
  const check = uncbor(binary);
  assert.deepEqual(check.value, tuple);
  assert.equal(baseline.decodeArx6String(binary.slice(check.offset)), body);
  const family = baseline.arx4PriorIdForEnvelope(envelope);
  const row = { id: sample.id, family: sample.family, raw: bytes.length, variants: {} };
  for (const name of variants) {
    const codec = name === "midpoint" ? exact : baseline;
    const input = name === "tuple-first" ? first : name === "binary-first" ? binary : name === "zero-null" ? zeroNull : bytes;
    let best = null;
    for (const priorId of new Set([family, "n"])) {
      const prior = codec.arx6PriorBytes(priorId);
      const start = performance.now();
      const digits = codec.encodeArx6V2Wire(input, prior, `g2${priorId}`);
      const elapsed = performance.now() - start;
      assert.deepEqual(codec.decodeArx6V2Wire(digits, prior, `g2${priorId}`), input);
      if (!best || digits.length + 3 < best.chars) best = { chars: digits.length + 3, priorId, ms: elapsed, bytes: input.length };
    }
    row.variants[name] = best;
  }
  rows.push(row);
  process.stderr.write(`${sample.id} ${variants.map((v) => v + ":" + row.variants[v].chars).join(" ")}
`);
  writeFileSync(outputPath, JSON.stringify({
    referenceCommit: "5d82b9f", sourceHashes,
    corpusSha256: sha256(readFileSync(corpusPath)),
    scope: "Fragment characters including the three-character header; incompatible candidates use identical framing overhead and checksum salt only for comparison. No viewer links are emitted.",
    timingNote: "Non-isolated diagnostic timings; not a performance comparison.",
    checks: "Every candidate byte stream round-trips; tuple-first and binary-first invert exactly, and zero-null restores the identical envelope.",
    rows,
  }, null, 2) + "\n");
}
const total = Object.fromEntries(variants.map((v) => [v, rows.reduce((s, row) => s + row.variants[v].chars, 0)]));
console.log(JSON.stringify({ total, wins: Object.fromEntries(variants.map((v) => [v, rows.filter((row) => row.variants[v].chars < row.variants.base?.chars).length])) }));
