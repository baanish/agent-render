/** Recreate the frozen dependency snippets without vendoring third-party source text. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./corpora/natural-manifest.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const output = path.resolve(process.argv[2] ?? '/tmp/arx6-natural-validation.json');
const corpus = manifest.map(entry => {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'node_modules', entry.package, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, entry.packageVersion, `Package version changed: ${entry.package}`);
  const source = readFileSync(path.join(root, entry.sourcePath), 'utf8');
  assert.equal(hash(source), entry.sha256, `Source bytes changed: ${entry.sourcePath}`);
  const content = source.slice(...entry.slice);
  assert.equal(hash(content), entry.sampleSha256, `Snippet changed: ${entry.id}`);
  return { id: entry.id, family: `natural-${entry.kind}`, envelope: { v: 1, codec: 'plain', artifacts: [{
    id: 'a', kind: entry.kind, content, filename: path.basename(entry.sourcePath),
    ...(entry.kind === 'code' ? { language: 'javascript' } : {}),
  }] } };
});
const json = JSON.stringify(corpus);
writeFileSync(output, json);
process.stdout.write(`${JSON.stringify({ output, samples: corpus.length, corpusSha256: hash(json) }, null, 2)}\n`);
