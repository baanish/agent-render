/** Dependency-free conformance cases, shared by the CLI and Vitest. No network requests. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLabCodec, envelopeToTuple } from './runtime.mjs';
import { encodeNative, decodeNative, encodeString, decodeString } from './src/native-frame.mjs';
import { createArx6Codec, crc32, formattedLink, selectShorterFragment } from './src/arx6-core.mjs';

const tuple = content => [3, ['m', 'doc', content, 'A title', 'notes.md'], 'Bundle title'];
const frozen = {
  'arx6-core.mjs': '6cd1d5b3bed631227adc564b057e23203fe52863399df88a9a15e131da4f5807',
  'cm6.mjs': '060bfda2b2207edf0ec2b415d2b8591188635b1d09b89f592d7dc36a9aa95e4b',
  'native-frame.mjs': '81074bf2360059c891233bde4034748cbe151958b7a5171c75baa542229c9392',
};

/** Build independent checks around a single immutable, hash-verified codec installation. */
export async function buildChecks() {
  const { codec, corpora } = await createLabCodec();
  function encode(value, prior = 'm') {
    const fragment = codec.encode(value, prior);
    assert.equal(typeof fragment, 'string', 'fixture must fit the experimental fragment budget');
    return fragment;
  }
  return [
    { name: 'frozen v1 implementation hashes', run() {
      for (const [file, expected] of Object.entries(frozen)) {
        const bytes = readFileSync(new URL(`./src/${file}`, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
      }
    } },
    { name: 'CRC32 standard check value', run() {
      assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    } },
    { name: 'every UTF-16 code unit survives native framing', run() {
      const text = Array.from({ length: 65536 }, (_, c) => String.fromCharCode(c)).join('');
      assert.equal(decodeString(encodeString(text)), text);
      assert.deepEqual(decodeNative(encodeNative(tuple(text))), tuple(text));
    } },
    { name: 'native frames reject truncation, trailing bytes, and overlong integers', run() {
      const bytes = encodeNative(tuple('quoted " text\n\r\t\\n'));
      for (let n = 0; n < bytes.length; n++) assert.throws(() => decodeNative(bytes.subarray(0, n)));
      for (const invalid of [[...bytes, 0], [9], [2, 128, 0]]) {
        assert.throws(() => decodeNative(Uint8Array.from(invalid)));
      }
    } },
    { name: 'invalid UTF-8 is rejected, not silently replaced', run() {
      for (const bytes of [[255], [192, 128], [224, 128, 128], [244, 144, 128, 128], [226, 130], [128]]) {
        assert.throws(() => decodeString(Uint8Array.from(bytes)));
      }
    } },
    { name: 'source strings round-trip without lexical normalization', run() {
      for (const text of ['', '\0\x01\x1f\x7f\r\n\t\\u007f\\n\\\\n"',
        '日本語の表\n한글 Ελληνικά मराठी 🧪 🚀 e\u0301', '\ud800\nx\udfff\ud800\udc00',
        'a,b,c\r\n1,"2,3",4\r\n', '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n']) {
        const value = tuple(text), fragment = encode(value);
        assert.match(fragment, /^#g1Lm[A-Za-z0-9_-]+$/);
        assert.deepEqual(codec.decode(fragment), value);
        assert.equal(new URL(`https://agent-render.com/${fragment}`).hash, fragment);
      }
    } },
    { name: 'bundles, active index, diff modes, and metadata survive', run() {
      const value = [2, [['m', 'a', '# heading', null, 'README.md'],
        ['c', 'b', 'const π = 3;', 'ts', 'Code'],
        ['d', 'c', null, 'a\r\n', 'b\r\n', 'ts', 'split', 'Review', 'a.ts'],
        ['s', 'd', 'x,y\n1,2'], ['j', 'e', '{"__proto__": true}\n']], 'Bundle', 3];
      assert.deepEqual(codec.decode(encode(value)), value);
    } },
    { name: '24 seeded random tuples round-trip across all three priors', run() {
      let seed = 0x6a09e667;
      const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
      const chunks = [' ', '\n', '\r\n', '😀', '\ud800', '\udfff', '\\n', '"', '\0',
        'const ', 'return ', '|', '123.456', 'héllo', '中国'];
      for (let i = 0; i < 24; i++) {
        let text = '';
        const length = 20 + rand() % 120;
        for (let j = 0; j < length; j++) text += chunks[rand() % chunks.length];
        const value = tuple(text);
        assert.deepEqual(codec.decode(encode(value, ['m', 'c', 'j'][i % 3])), value);
      }
    } },
    { name: 'wire truncation, suffixes, and checksum corruption fail closed', run() {
      const fragment = encode(tuple('A realistically short report.\n'.repeat(10)));
      for (let n = 0; n < fragment.length; n += Math.max(1, Math.floor(fragment.length / 12))) {
        assert.throws(() => codec.decode(fragment.slice(0, n)));
      }
      assert.throws(() => codec.decode(`${fragment}AAAA`));
      assert.throws(() => codec.decode(`${fragment}=`));
      const body = Buffer.from(fragment.slice(5), 'base64url');
      for (let i = 0; i < Math.min(20, body.length); i++) {
        const changed = Buffer.from(body); changed[i] ^= 128;
        assert.throws(() => codec.decode(fragment.slice(0, 5) + changed.toString('base64url')));
      }
    } },
    { name: 'hostile decoded length fails before model allocation', run() {
      const body = Buffer.from([0, 0, 0, 0, 255, 255, 255, 127, 0, 0, 0, 0]);
      assert.throws(() => codec.decode(`#g1Lm${body.toString('base64url')}`), /decoded length/);
    } },
    { name: 'payload budgets and unknown versions are enforced', run() {
      let seed = 0x31415926, entropy = '';
      for (let i = 0; i < 20000; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        entropy += String.fromCharCode(33 + seed % 94);
      }
      assert.equal(codec.encode(tuple(entropy), 'm'), null);
      assert.throws(() => codec.encode(tuple('x'.repeat(200001)), 'm'), /200000/);
      assert.throws(() => codec.decode(`#g1Lm${'A'.repeat(8192)}`), /oversized/);
      assert.throws(() => codec.decode('#g2LmAAAA'), /unsupported/);
      assert.throws(() => codec.decode('#g1LnAAAA'), /unsupported/);
    } },
    { name: 'missing and altered priors fail identity checks', async run() {
      const altered = { ...corpora, m: new Uint8Array(corpora.m) }; altered.m[0] ^= 1;
      await assert.rejects(createArx6Codec(altered), /digest/);
      await assert.rejects(createArx6Codec({}), /missing/);
    } },
    { name: 'installed prior bytes are immutable copies', async run() {
      const supplied = Object.fromEntries(Object.entries(corpora).map(([id, bytes]) => [id, new Uint8Array(bytes)]));
      const installed = await createArx6Codec(supplied);
      const value = tuple('Prior ownership must not affect shared links.');
      const expected = installed.encode(value, 'm'); supplied.m.fill(0);
      assert.equal(installed.encode(value, 'm'), expected);
      assert.deepEqual(installed.decode(expected), value);
    } },
    { name: 'fallback preserves legacy bytes on ties, losses, and null candidates', run() {
      const legacy = '#fmb64';
      assert.equal(selectShorterFragment(legacy, '#g1Lmabcdef'), legacy);
      assert.equal(selectShorterFragment(legacy, legacy), legacy);
      assert.equal(selectShorterFragment(legacy, null), legacy);
      assert.equal(formattedLink(legacy), '[View](https://agent-render.com/#fmb64)');
    } },
    { name: 'near-limit compressible content remains lossless', run() {
      const value = tuple('  return value;\n'.repeat(10000));
      assert.deepEqual(codec.decode(encode(value, 'c')), value);
    } },
    { name: 'laboratory envelope mapping preserves optional holes and active index', run() {
      const envelope = { title: 'Bundle', activeArtifactId: 'review', artifacts: [
        { id: 'notes', kind: 'markdown', content: '# Notes', filename: 'notes.md' },
        { id: 'review', kind: 'diff', oldContent: 'a\r\n', newContent: 'b\r\n', view: 'split' },
      ] };
      assert.deepEqual(envelopeToTuple(envelope), [2, [
        ['m', 'notes', '# Notes', null, 'notes.md'],
        ['d', 'review', null, 'a\r\n', 'b\r\n', null, 'split'],
      ], 'Bundle', 1]);
    } },
  ];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const checks = await buildChecks();
  let failed = 0;
  for (const check of checks) {
    try { await check.run(); console.log(`PASS ${check.name}`); }
    catch (error) { failed++; console.error(`FAIL ${check.name}`, error); }
  }
  console.log(`${checks.length - failed}/${checks.length} checks passed.`);
  process.exitCode = failed ? 1 : 0;
}
