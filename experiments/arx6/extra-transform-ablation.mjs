/** Diagnostic-only reversible transforms around the frozen ARX6 v2 model; never a viewer wire. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const DEFAULT_VARIANTS = "plain@n,plain@kind,bwt@n,bwt_mtf@n,utf16le@n,utf16be@n,utf16planes4096@n,utf16be@kind";
const [corpusPath, outputPath, requested = DEFAULT_VARIANTS] = process.argv.slice(2);
if (!corpusPath || !outputPath) {
  throw new Error("Usage: node experiments/arx6/extra-transform-ablation.mjs corpus.json results.json [variant@prior,...]");
}
const root = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const codecSource = readFileSync(`${root}src/lib/payload/arx6-codec.ts`, "utf8");
const modelSource = readFileSync(`${root}src/lib/payload/arx6-v2-model.ts`, "utf8");
const bundle = buildSync({
  stdin: {
    contents: `${codecSource}
export { envelopeToRawContainer, normalizeV2Envelope, encodeWire, decodeWire, encodeArx6String, Arx6V2ContextModel };
export { decodeArx6String } from '@/lib/payload/arx6-bytes';
export { loadArxDictionarySync, loadArx2OverlayDictionarySync } from '@/lib/payload/arx-codec';
export { loadArx4PriorsSync, arx4PriorIdForEnvelope } from '@/lib/payload/arx4-codec';
export { formatMarkdownLink } from '@/lib/markdown-link';`,
    resolveDir: root, sourcefile: "src/lib/payload/arx6-codec.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
  external: ["brotli-wasm"], tsconfig: `${root}tsconfig.json`,
});
const codec = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
for (const [asset, install] of [
  ["arx-dictionary.json", "loadArxDictionarySync"],
  ["arx2-dictionary.json", "loadArx2OverlayDictionarySync"],
  ["arx4-priors.json", "loadArx4PriorsSync"],
]) codec[install](JSON.parse(readFileSync(`${root}public/${asset}`, "utf8")));

const BLOCK_BYTES = 4096;

/** Cyclic suffix ranks avoid materializing all rotations; the primary index occupies two bytes. */
function bwtBlock(input) {
  const size = input.length;
  if (size === 0) return input;
  const order = Array.from({ length: size }, (_, index) => index);
  let rank = Int32Array.from(input);
  for (let span = 1; span < size; span *= 2) {
    order.sort((left, right) => rank[left] - rank[right]
      || rank[(left + span) % size] - rank[(right + span) % size] || left - right);
    const next = new Int32Array(size);
    let category = 0;
    for (let index = 1; index < size; index++) {
      const left = order[index - 1];
      const right = order[index];
      if (rank[left] !== rank[right] || rank[(left + span) % size] !== rank[(right + span) % size]) category++;
      next[right] = category;
    }
    rank = next;
    if (category === size - 1) break;
  }
  const output = new Uint8Array(size + 2);
  const primary = order.indexOf(0);
  output[0] = primary >>> 8;
  output[1] = primary & 255;
  for (let index = 0; index < size; index++) output[index + 2] = input[(order[index] + size - 1) % size];
  return output;
}

function inverseBwtBlock(input) {
  const size = input.length - 2;
  const primary = (input[0] << 8) | input[1];
  const last = input.subarray(2);
  const counts = new Uint32Array(256);
  const next = new Uint32Array(size);
  const output = new Uint8Array(size);
  for (const byte of last) counts[byte]++;
  let total = 0;
  for (let byte = 0; byte < 256; byte++) {
    const count = counts[byte];
    counts[byte] = total;
    total += count;
  }
  for (let index = 0; index < size; index++) next[counts[last[index]]++] = index;
  let row = primary;
  for (let index = 0; index < size; index++) {
    row = next[row];
    output[index] = last[row];
  }
  return output;
}

function bwt(input) {
  const output = new Uint8Array(input.length + 2 * Math.ceil(input.length / BLOCK_BYTES));
  let offset = 0;
  for (let index = 0; index < input.length; index += BLOCK_BYTES) {
    const block = bwtBlock(input.subarray(index, index + BLOCK_BYTES));
    output.set(block, offset);
    offset += block.length;
  }
  return output;
}

/** All preceding blocks have 4098 bytes; the arithmetic byte count identifies the final block. */
function inverseBwt(input) {
  const chunks = [];
  for (let index = 0; index < input.length; index += BLOCK_BYTES + 2) {
    chunks.push(inverseBwtBlock(input.subarray(index, index + BLOCK_BYTES + 2)));
  }
  return Uint8Array.from(Buffer.concat(chunks));
}

/** One fresh move-to-front list per complete prior or payload, including BWT index bytes. */
function moveToFront(input, inverse = false) {
  const order = Uint8Array.from({ length: 256 }, (_, index) => index);
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index++) {
    const position = inverse ? input[index] : order.indexOf(input[index]);
    const byte = order[position];
    output[index] = inverse ? byte : position;
    order.copyWithin(1, 0, position);
    order[0] = byte;
  }
  return output;
}

/** Explicit code units preserve lone surrogates; planes use fixed 4096-code-unit blocks. */
function utf16Bytes(text, layout) {
  const output = new Uint8Array(text.length * 2);
  for (let block = 0; block < text.length; block += BLOCK_BYTES) {
    const size = Math.min(BLOCK_BYTES, text.length - block);
    for (let index = 0; index < size; index++) {
      const unit = text.charCodeAt(block + index);
      const high = layout === "planes" ? block * 2 + index : (block + index) * 2 + (layout === "le" ? 1 : 0);
      const low = layout === "planes" ? block * 2 + size + index : (block + index) * 2 + (layout === "le" ? 0 : 1);
      output[high] = unit >>> 8;
      output[low] = unit & 255;
    }
  }
  return output;
}

function inverseUtf16(bytes, layout) {
  const units = [];
  for (let block = 0; block < bytes.length; block += BLOCK_BYTES * 2) {
    const size = Math.min(BLOCK_BYTES * 2, bytes.length - block) / 2;
    for (let index = 0; index < size; index++) {
      const high = layout === "planes" ? block + index : block + index * 2 + (layout === "le" ? 1 : 0);
      const low = layout === "planes" ? block + size + index : block + index * 2 + (layout === "le" ? 0 : 1);
      units.push((bytes[high] << 8) | bytes[low]);
    }
  }
  let text = "";
  for (let index = 0; index < units.length; index += BLOCK_BYTES) text += String.fromCharCode(...units.slice(index, index + BLOCK_BYTES));
  return text;
}

const transforms = {
  plain: { forward: bytes => bytes, inverse: bytes => bytes },
  bwt: { forward: bwt, inverse: inverseBwt },
  bwt_mtf: { forward: bytes => moveToFront(bwt(bytes)), inverse: bytes => inverseBwt(moveToFront(bytes, true)) },
};
for (const [name, layout] of [["utf16le", "le"], ["utf16be", "be"], ["utf16planes4096", "planes"]]) {
  transforms[name] = {
    forward: bytes => utf16Bytes(codec.decodeArx6String(bytes), layout),
    inverse: bytes => codec.encodeArx6String(inverseUtf16(bytes, layout)),
  };
}

// Small inverse probes cover empty/single-byte/periodic blocks and lone-surrogate code units.
for (const text of ["", "A", "M".repeat(100), "\ud800\udfff\udc00\ud800", "a\u0000\u4e00😀".repeat(2000)]) {
  const bytes = codec.encodeArx6String(text);
  for (const transform of Object.values(transforms)) assert.deepEqual(transform.inverse(transform.forward(bytes)), bytes);
}

const corpusBytes = readFileSync(corpusPath);
const corpus = JSON.parse(corpusBytes);
const results = {
  scope: "Diagnostic-only reversible raw-container transforms; frozen ARX6 v2 model. No model tuning or evaluation text in priors. Not an auto-codec portfolio benchmark.",
  framing: "Plain uses g2<prior>. Transform candidates use research-only g3x<prior>, charging one transform-ID character. Every candidate intentionally uses placeholder x, not a deployed or simultaneous mode registry. CRC binds header and transformed bytes; the arithmetic varint counts transformed bytes. Complete WHATWG-serialized [View](https://agent-render.com/#...) length is counted.",
  priorPolicy: "@n is unprimed; @kind uses the existing composed kind prior transformed identically to the payload. Each complete prior and payload resets its transform independently. Both baseline lanes are required to compare against min(kind,n).",
  transformPolicy: "BWT has fixed 4096-byte blocks and a two-byte primary index per nonempty block. MTF resets once per complete BWT stream. UTF16 preserves exact code units in LE, BE, or high-plane/low-plane blocks of 4096 code units. No block-size search was performed.",
  limitations: [
    "Synthetic diagnostic families are correlated; these results establish no generalization claim.",
    "Only UTF16BE received a transformed-curated-prior follow-up. The other transformed lanes were screened unprimed.",
    "No timings are reported. Adding a fallback lane requires extra work and its small selected gains are not free.",
    "These inverse helpers validate encoder-produced data only; they are not hardened production decoders.",
  ],
  corpusSha256: sha256(corpusBytes), codecSourceSha256: sha256(codecSource), modelSourceSha256: sha256(modelSource),
  variants: {}, comparison: null,
};

function comparison(variants) {
  const unprimed = variants["plain@n"];
  const curated = variants["plain@kind"];
  if (!unprimed || !curated) return null;
  const baseline = unprimed.map((row, index) => Math.min(row.chars, curated[index].chars));
  const total = baseline.reduce((sum, chars) => sum + chars, 0);
  return {
    baseline: "Per-case minimum of plain@kind and plain@n", baselineChars: total,
    candidates: Object.fromEntries(Object.entries(variants).map(([name, rows]) => {
      const chars = rows.reduce((sum, row) => sum + row.chars, 0);
      const selected = rows.reduce((sum, row, index) => sum + Math.min(row.chars, baseline[index]), 0);
      return [name, {
        totalChars: chars, deltaPct: 100 * (chars / total - 1),
        wins: rows.filter((row, index) => row.chars < baseline[index]).length,
        optionalLaneSavingChars: total - selected, optionalLaneSavingPct: 100 * (1 - selected / total),
      }];
    })),
  };
}

for (const variant of requested.split(",")) {
  const [name, policy] = variant.split("@");
  const transform = transforms[name];
  if (!transform || !["n", "kind"].includes(policy)) throw new Error(`Unknown variant: ${variant}`);
  const rows = [];
  for (const sample of corpus) {
    const envelope = codec.normalizeV2Envelope(sample.envelope);
    const raw = codec.encodeArx6String(codec.envelopeToRawContainer(envelope));
    const input = transform.forward(raw);
    assert.deepEqual(transform.inverse(input), raw, `${variant}: inverse ${sample.id}`);
    const priorId = policy === "n" ? "n" : codec.arx4PriorIdForEnvelope(envelope);
    const rawPrior = codec.arx6PriorBytes(priorId);
    const prior = rawPrior === null ? null : transform.forward(rawPrior);
    const header = `${name === "plain" ? "g2" : "g3x"}${priorId}`;
    const digits = codec.encodeWire(input, prior, new codec.Arx6V2ContextModel(), header);
    const decoded = codec.decodeWire(digits, prior, () => new codec.Arx6V2ContextModel(), header);
    assert.deepEqual(transform.inverse(decoded), raw, `${variant}: arithmetic round trip ${sample.id}`);
    const url = new URL("https://agent-render.com/");
    url.hash = header + digits;
    rows.push({
      id: sample.id, family: sample.family, rawBytes: raw.length, transformBytes: input.length,
      chars: codec.formatMarkdownLink("View", url.href).length, roundTrip: true,
    });
  }
  results.variants[variant] = rows;
  results.comparison = comparison(results.variants);
  writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.error(`${variant}: ${rows.reduce((sum, row) => sum + row.chars, 0)} full-link characters; ${rows.length} exact round trips`);
}
