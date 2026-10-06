/** Freeze larger synthetic cases before evaluating any candidate on them. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const seed = 0x5ab1e5ed;
let state = seed;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}
function word() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: 4 + Math.floor(random() * 10) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}
function rowsUntil(target, line) {
  const rows = [];
  let length = 0;
  while (length < target) {
    const row = line(rows.length);
    rows.push(row);
    length += row.length + 1;
  }
  return rows.join('\n');
}
const families = {
  prose: target => [{ id: 'main', kind: 'markdown', content: rowsUntil(target,
    i => `${i + 1}. The ${word()} station recorded ${word()} near ${word()}. Inspectors compared ${word()}, ${word()}, and ${word()} before accepting the result.`) }],
  code: target => [{ id: 'main', kind: 'code', language: 'typescript', content: rowsUntil(target,
    i => `export const ${word()}_${i} = { label: "${word()}", key: "${word()}", count: ${Math.floor(random() * 10000000)}, active: ${i % 2 === 0} };`) }],
  json: target => [{ id: 'main', kind: 'json', content: JSON.stringify({ rows: Array.from({ length: Math.ceil(target / 130) },
    (_, i) => ({ id: i, key: word(), reading: Math.floor(random() * 1000000) / 1000, labels: [word(), word(), word()], active: i % 3 === 0 })) }, null, 2) }],
  csv: target => [{ id: 'main', kind: 'csv', content: 'name,reading,region,note\n' + rowsUntil(target,
    () => `${word()},${(random() * 1000000).toFixed(3)},${word()},"${word()}, ${word()}"`) }],
  'diff-pair': target => {
    const oldContent = rowsUntil(target, i => `setting_${i} = "${word()}-${word()}"`);
    const newContent = oldContent.replace(/setting_([0-9]*[37]) /g, 'changed_$1 ') + '\n# settings verified';
    return [{ id: 'main', kind: 'diff', oldContent, newContent, language: 'python', view: 'split' }];
  },
  entropy: target => [{ id: 'main', kind: 'code', language: 'text', content: Array.from({ length: target },
    () => '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_.~'[Math.floor(random() * 66)]).join('') }],
};
const corpus = [];
for (const [family, make] of Object.entries(families)) {
  for (const target of [2000, 8000, 24000, 64000]) corpus.push({ id: `capacity/${family}/${target}`, family,
    split: 'capacity-validation', seed, targetBodyChars: target, envelope: { v: 1, codec: 'plain', artifacts: make(target) } });
}
const json = `${JSON.stringify(corpus, null, 2)}\n`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = {
  purpose: 'Larger synthetic coverage added after diagnostic baselines showed too few cases near the 2000-character Markdown limit. Generated before candidate evaluation on these inputs, with no length-based filtering or tuning.',
  generatorSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  corpusSha256: hash(json), file: 'capacity-validation.json', seed, samples: corpus.length,
  targets: [2000, 8000, 24000, 64000],
};
writeFileSync(new URL('./corpora/capacity-validation.json', import.meta.url), json);
writeFileSync(new URL('./corpora/capacity-manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
