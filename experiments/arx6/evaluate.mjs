/** Isolated measurement worker; launched by compare.mjs with the target's own tsconfig. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus } from 'node:os';

const startedAt = new Date().toISOString();
const [root, corpusPath, mode = 'auto'] = process.argv.slice(2);
if (!root || !corpusPath) throw new Error('Internal usage: evaluate.mjs root corpus.json [auto|prototype|arx6|arx5]');
// brotli-wasm's ESM export loads its browser WASM using fetch(file:). Node's fetch does
// not support file URLs. Supply that one local asset unchanged, retaining the actual
// shipped WASM implementation rather than substituting Node's native Brotli encoder.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : typeof input === 'string' ? new URL(input, 'https://benchmark.invalid/') : new URL(input.url);
  if (url.protocol === 'file:' && path.basename(url.pathname) === 'brotli_wasm_bg.wasm') {
    return new Response(readFileSync(fileURLToPath(url)), { headers: { 'Content-Type': 'application/wasm' } });
  }
  return nativeFetch(input, init);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const sourceFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(file) : /\.(?:ts|mjs)$/.test(file) ? [file] : [];
});
const trackedFiles = mode === 'prototype'
  ? [...sourceFiles(path.join(root, 'experiments/arx6/src')), path.join(root, 'experiments/arx6/runtime.mjs')]
  : sourceFiles(path.join(root, 'src/lib/payload'));
const sourceDigest = () => sha(trackedFiles.sort().map(file => `${path.relative(root, file)}\0${sha(readFileSync(file))}`).join('\n'));
const startDigest = sourceDigest();
const auxiliaryFiles = ['src/lib/markdown-link.ts', 'src/lib/format.ts', 'node_modules/brotli-wasm/package.json', 'node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm'];
const auxiliaryHashes = () => Object.fromEntries(auxiliaryFiles.map(file => [file, sha(readFileSync(path.join(root, file)))]));
const startAuxiliaryHashes = auxiliaryHashes();
const assetFiles = ['arx-dictionary.json', 'arx2-dictionary.json', 'arx4-priors.json'];
const assetHashes = () => Object.fromEntries(assetFiles.map(file => [file, sha(readFileSync(path.join(root, 'public', file)))]));
const startAssetHashes = assetHashes();
const importSource = relative => import(pathToFileURL(path.join(root, relative)).href);
const [{ formatMarkdownLink }, { normalizeEnvelope }, fragment, schema, arx, prior] = await Promise.all([
  importSource('src/lib/markdown-link.ts'), importSource('src/lib/payload/envelope.ts'),
  importSource('src/lib/payload/fragment.ts'), importSource('src/lib/payload/schema.ts'),
  importSource('src/lib/payload/arx-codec.ts'), importSource('src/lib/payload/arx4-codec.ts'),
]);
arx.loadArxDictionarySync(readJson(path.join(root, 'public/arx-dictionary.json')));
arx.loadArx2OverlayDictionarySync(readJson(path.join(root, 'public/arx2-dictionary.json')));
assert.equal(prior.loadArx4PriorsSync(readJson(path.join(root, 'public/arx4-priors.json'))), 1);
const runtime = mode === 'prototype' ? await importSource('experiments/arx6/runtime.mjs') : null;
const lab = runtime ? await runtime.createLabCodec() : null;
const bytes = readFileSync(corpusPath);
const corpus = JSON.parse(bytes.toString('utf8'));
assert.ok(Array.isArray(corpus) && corpus.length > 0, 'Expected nonempty {id,envelope} sample array');
const canonical = value => JSON.parse(JSON.stringify({ ...value, codec: 'plain' }));

function link(value) {
  const url = new URL('https://agent-render.com/');
  url.hash = value;
  return formatMarkdownLink('View', url.href);
}

const rows = [];
for (const [index, sample] of corpus.entries()) {
  assert.ok(schema.isPayloadEnvelope(sample.envelope), `Invalid envelope: ${sample.id}`);
  const normalized = normalizeEnvelope(sample.envelope);
  assert.ok(normalized.ok, `Normalization failed: ${sample.id}`);
  const envelope = normalized.envelope;
  assert.ok(JSON.stringify(envelope).length <= schema.MAX_DECODED_PAYLOAD_LENGTH);
  const row = { id: sample.id ?? `sample-${index}`, family: sample.family ?? envelope.artifacts[0].kind,
    kind: envelope.artifacts[0].kind, decodedJsonChars: JSON.stringify(envelope).length };
  try {
    const startEncode = performance.now();
    const tuple = runtime?.envelopeToTuple(envelope);
    const encoded = lab ? lab.codec.encode(tuple, runtime.priorForEnvelope(envelope))
      : await fragment.encodeEnvelopeAsync(envelope, { budgetByTransport: true, ...(mode === 'auto' ? {} : { codec: mode }) });
    row.encodeMs = performance.now() - startEncode;
    if (encoded === null) {
      row.declined = true;
    } else {
      const value = encoded.startsWith('#') ? encoded.slice(1) : encoded;
      row.tag = value.charAt(0);
      if (row.tag === 'g') {
        const versioned = /^[0-9]$/.test(value.charAt(1));
        row.prior = mode === 'prototype' ? value.charAt(3) : versioned ? value.charAt(2) : value.charAt(1);
        if (mode !== 'prototype') row.arx6Version = versioned ? value.charAt(1) : 'legacy';
      }
      else if (row.tag === 'f' || row.tag === 'e') row.prior = value.charAt(1);
      row.fragmentChars = value.length;
      row.markdownLinkChars = link(value).length;
      row.fragmentSha256 = sha(value);
      const startDecode = performance.now();
      if (lab) {
        const decodedTuple = lab.codec.decode(encoded);
        assert.deepEqual(decodedTuple, tuple, 'Prototype tuple round trip');
        // The frozen codec returns unknown tuples; still require the real application schema.
        const decodedEnvelope = arx.envelopeFromParsedArxTuple(decodedTuple, 'arx2');
        assert.ok(schema.isPayloadEnvelope(decodedEnvelope));
        const rebuilt = normalizeEnvelope(decodedEnvelope);
        assert.ok(rebuilt.ok);
        assert.deepEqual(canonical(rebuilt.envelope), canonical(envelope), 'Prototype envelope/UTF-16 round trip');
      } else {
        const decoded = await fragment.decodeFragmentAsync(`#${value}`, { skipFragmentBudget: true });
        assert.ok(decoded.ok, `Decode failed: ${JSON.stringify(decoded)}`);
        assert.ok(schema.isPayloadEnvelope(decoded.envelope));
        assert.deepEqual(canonical(decoded.envelope), canonical(envelope), 'Production envelope/UTF-16 round trip');
      }
      row.decodeMs = performance.now() - startDecode;
      row.roundTrip = true;
    }
  } catch (error) {
    row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    row.roundTrip = false;
  }
  rows.push(row);
  if (index % 10 === 0 || index === corpus.length - 1) process.stderr.write(`${path.basename(root)} ${mode}: ${index + 1}/${corpus.length}\n`);
}
assert.equal(sourceDigest(), startDigest, 'Codec source changed during measurement; rerun against a frozen snapshot');
assert.deepEqual(auxiliaryHashes(), startAuxiliaryHashes, 'Formatter or Brotli dependency changed during measurement');
assert.deepEqual(assetHashes(), startAssetHashes, 'Dictionary or prior bytes changed during measurement');
process.stdout.write(`${JSON.stringify({
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  revisionTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceSha256: startDigest,
  auxiliarySha256: startAuxiliaryHashes,
  brotliWasmVersion: readJson(path.join(root, 'node_modules/brotli-wasm/package.json')).version,
  assetSha256: startAssetHashes,
  mode,
  corpusSha256: sha(bytes),
  nodeVersion: process.version,
  runtime: { platform: process.platform, architecture: process.arch, cpuModel: cpus()[0]?.model, availableParallelism: availableParallelism() },
  startedAt,
  finishedAt: new Date().toISOString(),
  wasmLoading: 'The unchanged brotli-wasm ESM/browser binary is read locally through a file: fetch adapter. No native-zlib substitute.',
  framing: '[View](https://agent-render.com/#...); real URL serialization and production Markdown formatter',
  timing: 'One ordered pass including cold first-sample costs; indicative CPU timings, not a statistically repeated latency benchmark.',
  peakRssKiB: process.resourceUsage().maxRSS,
  rows,
}, null, 2)}\n`);
