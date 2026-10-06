/** Derive timing subsets and verify identical wires across the runtime optimization. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const originalPath = path.resolve(process.argv[2] ?? path.join(directory, 'results/consolidated-timing-original.json'));
const optimizedPath = path.resolve(process.argv[3] ?? path.join(directory, 'results/consolidated-timing-optimized.json'));
const outputPath = path.resolve(process.argv[4] ?? path.join(directory, 'results/timing-summary.json'));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const original = read(originalPath);
const optimized = read(optimizedPath);
assert.equal(original.corpusSha256, optimized.corpusSha256, 'Timing corpus changed');
const originalFinal = original.variants.find(variant => variant.label === 'final');
assert.ok(originalFinal);
const optimizedFinal = optimized.variants.find(variant => variant.label === 'optimized');
assert.ok(optimizedFinal);
const oldRows = new Map(originalFinal.rows.map(row => [row.id, row]));
assert.equal(oldRows.size, optimizedFinal.rows.length);
assert.equal(new Set(optimizedFinal.rows.map(row => row.id)).size, oldRows.size);
for (const row of optimizedFinal.rows) {
  const previous = oldRows.get(row.id);
  assert.ok(previous?.roundTrip && row.roundTrip, `Missing round trip: ${row.id}`);
  for (const field of ['fragmentSha256', 'fragmentChars', 'markdownLinkChars', 'decodedJsonChars']) {
    assert.equal(row[field], previous[field], `Changed ${field}: ${row.id}`);
  }
}

function quantiles(rows, field) {
  const values = rows.map(row => row[field]).sort((left, right) => left - right);
  const at = fraction => values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? null;
  return { p50: at(0.5), p95: at(0.95), max: at(1) };
}
function summary(rows) {
  return { samples: rows.length, encodeMs: quantiles(rows, 'encodeMs'), decodeMs: quantiles(rows, 'decodeMs'),
    encodeOver60Seconds: rows.filter(row => row.encodeMs > 60000).map(row => ({ id: row.id, encodeMs: row.encodeMs,
      fragmentChars: row.fragmentChars, markdownLinkChars: row.markdownLinkChars,
      shareableFragment: row.fragmentChars <= 8192 })) };
}
const measuredVariants = [...original.variants, optimizedFinal];
for (const variant of measuredVariants) {
  assert.ok(variant.rows.every(row => row.roundTrip === true && Number.isFinite(row.encodeMs) && Number.isFinite(row.decodeMs)), 'Timing rows must all round-trip and contain finite measurements');
}
const commonShareableIds = new Set(originalFinal.rows.filter(row => measuredVariants.every(variant => {
  const corresponding = variant.rows.find(candidate => candidate.id === row.id);
  return corresponding && corresponding.fragmentChars <= 8192;
})).map(row => row.id));
const variants = measuredVariants.map(variant => ({
  label: variant.label === 'final' ? 'final-before-radix-optimization' : variant.label,
  revision: variant.revision, sourceSha256: variant.sourceSha256,
  startedAt: variant.startedAt, finishedAt: variant.finishedAt, runtime: variant.runtime,
  peakRssMiB: variant.peakRssKiB / 1024,
  all: summary(variant.rows),
  shareableFragment8192: summary(variant.rows.filter(row => row.fragmentChars <= 8192)),
  shareableByEveryVariant8192: summary(variant.rows.filter(row => commonShareableIds.has(row.id))),
  completeMarkdown2000: summary(variant.rows.filter(row => row.markdownLinkChars <= 2000)),
  boundaries: variant.rows.filter(row => row.family.startsWith('timing-boundary-')),
}));
const report = {
  corpusSha256: original.corpusSha256,
  method: 'One ordered process pass per variant on the same fixed corpus, after known heavy validation jobs stopped. Encode/decode call timings include lazy first-use work, but exclude module imports and synchronous asset loading. No repeated statistical experiment or mobile-browser performance guarantee. peak RSS covers each entire process and all cases.',
  quantileMethod: 'Sort observed values and select index min(n-1, floor(n*q)).',
  workload: '52 diagnostic, 24 capacity, and two 199,900-character normalized-envelope boundary cases. The original measurements motivated a wire-preserving runtime optimization; model, prior policy, wire representation, and input bytes stayed frozen.',
  exactFinalWireMatches: optimizedFinal.rows.length,
  sourceReports: [originalPath, optimizedPath].map(file => ({ file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') })),
  variants,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, ...report }, null, 2)}\n`);
