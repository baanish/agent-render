/** Build a reproducible performance-only corpus after the codec/model decision freeze. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const sources = ['diagnostic.json', 'capacity-validation.json'].map(file => {
  const bytes = readFileSync(new URL(`./corpora/${file}`, import.meta.url));
  return { file, sha256: hash(bytes), rows: JSON.parse(bytes.toString('utf8')) };
});
const target = 199900;
const seed = 0x7f2dab48;
let state = seed;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}
const boundary = ['repeat', 'entropy'].map(family => {
  const envelope = { v: 1, codec: 'plain', activeArtifactId: 'a', artifacts: [{ id: 'a', kind: 'code', language: 'text', content: '' }] };
  const length = target - JSON.stringify(envelope).length;
  const block = 'north south east west ';
  envelope.artifacts[0].content = family === 'repeat' ? block.repeat(Math.ceil(length / block.length)).slice(0, length)
    : Array.from({ length }, () => '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_.~'[Math.floor(random() * 66)]).join('');
  assert.equal(JSON.stringify(envelope).length, target);
  return { id: `timing-boundary/${family}`, family: `timing-boundary-${family}`, split: 'performance-only', envelope };
});
const rows = [...sources.flatMap(source => source.rows), ...boundary];
const json = JSON.stringify(rows);
const output = path.resolve(process.argv[2] ?? '/tmp/arx6-timing-corpus.json');
writeFileSync(output, json);
const manifest = {
  purpose: 'Performance-only fixed corpus, assembled after model/prior/wire selection. No model, prior, or wire-selection decisions depend on its output. Its measurements motivated an exact-output legacy radix runtime optimization, verified separately against every previously measured final automatic-selection wire. Includes oversize fragments solely for decode correctness with a benchmark budget override.',
  sources: sources.map(({ file, sha256 }) => ({ file, sha256 })),
  boundary: { count: boundary.length, normalizedJsonCharsEach: target, seed, families: ['repeat', 'entropy'] },
  samples: rows.length, corpusSha256: hash(json),
  generatorSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
};
writeFileSync(new URL('./corpora/timing-manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, ...manifest }, null, 2)}\n`);
