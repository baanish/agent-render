/** Deterministic synthetic evaluation cases. No shipped example/prior text is sampled. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./corpora/', import.meta.url));
mkdirSync(directory, { recursive: true });

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function words(random, length) {
  const syllables = ['ba', 'ke', 'mi', 'lo', 'ru', 'sa', 'ti', 'vo', 'wen', 'za'];
  return Array.from({ length }, () => Array.from({ length: 2 + Math.floor(random() * 3) },
    () => syllables[Math.floor(random() * syllables.length)]).join('')).join(' ');
}

function textArtifact(kind, content, metadata = {}) {
  return { id: 'artifact', kind, content, ...metadata };
}

function envelope(artifacts, metadata = {}) {
  return { v: 1, codec: 'plain', artifacts, ...metadata };
}

const languages = [
  ['en', 'The ferry crossed the channel before dawn. A mechanic checked the pressure gauge and noted the reading.'],
  ['de', 'Über den Fluss führt eine schmale Brücke. Die Reisenden prüfen sorgfältig ihre Unterlagen.'],
  ['fr', 'À la gare, les voyageurs échangent leurs billets et vérifient les horaires du prochain départ.'],
  ['ja', '静かな図書館で研究者が古い地図を調べています。記録を確認し、新しい注釈を加えます。'],
  ['zh', '工作人员检查每个温度传感器的读数，然后把结果记录在表格中。不同地区采用相同的测量方法。'],
  ['ar', 'يفحص المهندس نتائج القياس بعناية ثم يكتب ملاحظاته في السجل اليومي للمحطة.'],
  ['hi', 'यात्री सुबह की ट्रेन का इंतजार कर रहे हैं। कर्मचारी समय सारणी और टिकट की जानकारी जाँचते हैं।'],
  ['emoji', '🛰️ → 🌍 | 👩🏽‍🔬 🧪 ✅ | café e\u0301lan 🚲\u200d🛠️\n'],
];

const sourceFactories = [
  ['python', (name, n) => `def ${name}(items):\n    total = ${n}\n    for index, item in enumerate(items):\n        if item is not None:\n            total += item * (index + 1)\n    return total\n`],
  ['rust', (name, n) => `pub fn ${name}(items: &[i64]) -> i64 {\n    items.iter().enumerate().fold(${n}, |sum, (i, v)| sum + v * (i as i64 + 1))\n}\n`],
  ['typescript', (name, n) => `export function ${name}(items: readonly number[]): number {\n  return items.reduce((sum, value, index) => sum + value * (index + ${n}), 0);\n}\n`],
  ['sql', (name, n) => `WITH ${name} AS (\n  SELECT region, COUNT(*) AS samples FROM observations WHERE reading > ${n} GROUP BY region\n)\nSELECT region, samples FROM ${name} ORDER BY samples DESC;\n`],
  ['go', (name, n) => `func ${name}(values []int) int {\n\ttotal := ${n}\n\tfor index, value := range values {\n\t\ttotal += value * (index + 1)\n\t}\n\treturn total\n}\n`],
  ['shell', (name, n) => `${name}() {\n  count=${n}\n  for entry in "$@"; do\n    printf '%s\\t%s\\n' "$count" "$entry"\n    count=$((count + 1))\n  done\n}\n`],
  ['css', (name, n) => `.${name} {\n  display: grid;\n  grid-template-columns: repeat(${n % 5 + 1}, minmax(0, 1fr));\n  gap: 0.75rem;\n  color: var(--foreground);\n}\n`],
  ['haskell', (name, n) => `${name} :: [Integer] -> Integer\n${name} values = foldr (+) ${n} $ zipWith (*) [1..] values\n`],
];

const families = {
  prose(random, scale, index) {
    const [language, sentence] = languages[index % languages.length];
    const body = Array.from({ length: scale }, (_, i) => `${i + 1}. ${sentence} ${words(random, 4)}.`).join('\n\n');
    return envelope([textArtifact('markdown', body, { title: language, filename: `notes-${language}.md` })]);
  },
  code(random, scale, index) {
    const [language, factory] = sourceFactories[index % sourceFactories.length];
    const body = Array.from({ length: scale }, (_, i) => factory(words(random, 1), i + 1)).join('\n');
    return envelope([textArtifact('code', body, { language, title: 'Weighted observations' })]);
  },
  markdown(random, scale) {
    const body = Array.from({ length: scale }, (_, i) => `## ${words(random, 3)}\n\n> ${words(random, 8)}\n\n- [${i % 2 ? 'x' : ' '}] ${words(random, 6)}\n- value: \`${Math.floor(random() * 9999)}\`\n\n| site | state |\n| :--- | ---: |\n| ${words(random, 1)} | ${i} |\n\n~~~text\n  ${words(random, 5)}\n~~~`).join('\n\n');
    return envelope([textArtifact('markdown', body)], { title: 'Inspection notebook' });
  },
  json(random, scale) {
    const rows = Array.from({ length: scale * 3 }, (_, i) => ({ key: words(random, 1), enabled: i % 3 === 0,
      measurements: [Math.floor(random() * 10000) / 100, null, i], location: { row: i, column: i % 7 },
      note: i % 2 ? 'quote: " and backslash: \\' : languages[i % languages.length][1] }));
    return envelope([textArtifact('json', JSON.stringify({ revision: 7, rows }, null, 2), { filename: 'observations.json' })]);
  },
  csv(random, scale) {
    const body = ['site,reading,note,enabled', ...Array.from({ length: scale * 4 }, (_, i) =>
      `${words(random, 1)},${(random() * 1000).toFixed(4)},"${i % 2 ? 'contains, comma' : 'a ""quoted"" value'}",${i % 3 === 0}`)].join('\r\n');
    return envelope([textArtifact('csv', body, { filename: 'readings.csv' })]);
  },
  patch(random, scale) {
    const patch = Array.from({ length: scale }, (_, i) => {
      const path = `lib/${words(random, 1)}.ts`;
      return `diff --git a/${path} b/${path}\nindex 0123456..abcdef0 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,3 +1,3 @@\n export const reading = {\n-  value: ${i},\n+  value: ${i + 1},\n };\n`;
    }).join('');
    return envelope([{ id: 'artifact', kind: 'diff', patch, view: 'unified', language: 'typescript' }]);
  },
  'diff-pair'(random, scale) {
    const oldContent = Array.from({ length: scale * 5 }, (_, i) => `reading_${i} = "${words(random, 3)}"`).join('\n');
    const newContent = oldContent.replace(/reading_([02468]) /g, 'updated_$1 ') + '\n# completed\n';
    return envelope([{ id: 'artifact', kind: 'diff', oldContent, newContent, language: 'python', view: 'split', title: 'Calibration update', filename: 'readings.py' }]);
  },
  bundle(random, scale, index) {
    const content = words(random, scale * 25);
    return envelope([
      textArtifact('markdown', `# Status\n\n${content}`, { id: 'summary', title: 'Summary' }),
      textArtifact('json', JSON.stringify({ content, count: scale }), { id: 'data', filename: 'record.json' }),
      { id: 'change', kind: 'diff', oldContent: content, newContent: `${content}\nchecked`, view: 'split' },
    ], { title: `Bundle ${index}`, activeArtifactId: 'change' });
  },
  entropy(random, scale) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~';
    const body = Array.from({ length: scale * 180 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
    return envelope([textArtifact('code', body, { language: 'text' })]);
  },
  repeat(random, scale) {
    const block = words(random, 18) + '\n';
    return envelope([textArtifact('markdown', block.repeat(scale * 8) + 'z'.repeat(scale * 400))]);
  },
  'utf16-exact'(random, scale, index) {
    const edge = '\u0000\u0001\t\r\n\u007f\u0085\ufeff\u2028\u2029\ufffe\uffff\ud800A\udfff\ud83d\ude80';
    const body = Array.from({ length: scale * 8 }, () => String.fromCharCode(Math.floor(random() * 65536))).join('') + edge;
    return envelope([textArtifact('code', body, { language: 'text', title: `lone-\ud800-${index}`, filename: `edge-\udfff.txt` })], { title: `\ud800 exact ${index}` });
  },
  metadata(random, scale, index) {
    return envelope(Array.from({ length: Math.max(1, scale) }, (_, i) => textArtifact(i % 2 ? 'markdown' : 'code', i % 3 ? '\n' : '', {
      id: `item-${i}-${words(random, 1)}`, title: `Section [${i}] (continued) \\ ${languages[index % languages.length][1]}`,
      filename: `folder with spaces/${words(random, 1)}.txt`, ...(i % 2 ? {} : { language: 'text' }),
    })), { title: `Metadata ${words(random, 5)}`, activeArtifactId: 'does-not-exist' });
  },
  whitespace(random, scale) {
    const body = Array.from({ length: scale * 20 }, (_, i) => `${' '.repeat(i % 12)}${i % 2 ? '\t' : ''}${words(random, 2)}  ${i % 3 ? '\r\n' : '\n'}`).join('');
    return envelope([textArtifact('code', body, { language: 'text' })]);
  },
};

const manifest = {
  version: 1,
  purpose: 'Synthetic generality checks, not independently collected real-world holdout data.',
  freezeRule: 'Both files are generated before candidate-model comparison. Diagnostic may guide design; validation stays unevaluated until the model and representation are frozen.',
  generatorSha256: '',
  corpora: {},
};

for (const [split, seed, offset] of [['diagnostic', 0x42c0ffee, 0], ['validation', 0x91e10da5, 4]]) {
  const random = rng(seed);
  const rows = [];
  for (const [family, make] of Object.entries(families)) {
    for (let variant = 0; variant < 4; variant++) {
      const scale = [1, 3, 9, 20][variant];
      rows.push({ id: `${split}/${family}/${variant}`, family, split, seed, variant,
        envelope: make(random, scale, variant + offset) });
    }
  }
  const bytes = `${JSON.stringify(rows, null, 2)}\n`;
  const file = `${split}.json`;
  writeFileSync(`${directory}/${file}`, bytes);
  manifest.corpora[split] = { file, seed, samples: rows.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const { readFileSync } = await import('node:fs');
manifest.generatorSha256 = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
writeFileSync(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
