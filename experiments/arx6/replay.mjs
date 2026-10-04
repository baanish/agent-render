/** Rebuild the measured input union, then verify the optimized automatic encoder's exact wires. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const reports = ['diagnostic', 'validation', 'natural', 'capacity', 'external', 'timing-original'].map(name => {
  const file = path.join(directory, `results/consolidated-${name}.json`);
  return { file, sha256: hash(readFileSync(file)), report: read(file) };
});
const [command, ...args] = process.argv.slice(2);
if (command === 'build') {
  const [natural, external, timing, output = '/tmp/arx6-final-replay.json'] = args;
  assert.ok(natural && external && timing, 'Usage: node replay.mjs build natural.json external.json timing.json [output.json]');
  const sources = [path.join(directory, 'corpora/diagnostic.json'), path.join(directory, 'corpora/validation.json'),
    natural, path.join(directory, 'corpora/capacity-validation.json'), external, timing];
  const rows = sources.flatMap((file, index) => {
    assert.equal(hash(readFileSync(file)), reports[index].report.corpusSha256, `Changed corpus: ${file}`);
    const corpus = read(file);
    return index === sources.length - 1 ? corpus.filter(row => row.family.startsWith('timing-boundary-')) : corpus;
  });
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'Duplicate sample ID');
  const bytes = JSON.stringify(rows);
  writeFileSync(output, bytes);
  process.stdout.write(`${JSON.stringify({ output, samples: rows.length, corpusSha256: hash(bytes) }, null, 2)}\n`);
} else if (command === 'verify') {
  const [input, output = path.join(directory, 'results/consolidated-replay.json')] = args;
  assert.ok(input, 'Usage: node replay.mjs verify measured-report.json [verified-report.json]');
  const measured = read(input);
  const optimized = measured.variants.find(variant => variant.label === 'optimized');
  assert.ok(optimized);
  const expected = new Map(reports.flatMap(({ report }, index) => {
    const rows = report.variants.find(variant => variant.label === 'final').rows;
    return (index === reports.length - 1 ? rows.filter(row => row.family.startsWith('timing-boundary-')) : rows).map(row => [row.id, row]);
  }));
  assert.equal(expected.size, optimized.rows.length);
  assert.equal(new Set(optimized.rows.map(row => row.id)).size, expected.size);
  for (const row of optimized.rows) {
    const previous = expected.get(row.id);
    assert.ok(previous?.roundTrip && row.roundTrip, `Missing exact round trip: ${row.id}`);
    for (const field of ['fragmentSha256', 'fragmentChars', 'markdownLinkChars', 'decodedJsonChars']) {
      assert.equal(row[field], previous[field], `Changed ${field}: ${row.id}`);
    }
  }
  measured.readback = {
    exactFinalAutomaticWireMatches: expected.size,
    comparedFields: ['fragmentSha256', 'fragmentChars', 'markdownLinkChars', 'decodedJsonChars'],
    allNormalizedEnvelopeRoundTrips: true,
    timingsAreComparable: false,
    timingReason: 'This correctness replay ran concurrently with other validation. Use the separate ordered timing reports for latency evidence.',
    originalReports: reports.map(({ file, sha256 }) => ({ file: path.basename(file), sha256 })),
  };
  writeFileSync(output, `${JSON.stringify(measured, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, ...measured.readback }, null, 2)}\n`);
} else {
  throw new Error('Expected build or verify command');
}
