import fs from 'fs';
import zlib from 'zlib';
import { performance } from 'perf_hooks';

const dict = JSON.parse(fs.readFileSync('public/arx-dictionary.json', 'utf8'));

// --- Encoding helpers (mirrors arx-codec.ts) ---
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$*()',;:@/";
const BASE = BigInt(ALPHABET.length);
const B0 = 0n, B8 = 8n;

function encBase76(bytes) {
  if (!bytes.length) return "";
  let num = B0; for (const b of bytes) num = (num << B8) | BigInt(b);
  const c = []; while (num > B0) { c.push(ALPHABET[Number(num % BASE)]); num /= BASE; } c.reverse();
  return ALPHABET[Math.floor(bytes.length / ALPHABET.length)] + ALPHABET[bytes.length % ALPHABET.length] + c.join("");
}

const UA = [];
for (let cp = 0xA1; cp <= 0x7FF; cp++) { if (cp === 0xAD) continue; if (cp >= 0x300 && cp <= 0x36F) continue; UA.push(String.fromCodePoint(cp)); }
const UB = BigInt(UA.length);
function encBase1k(bytes) {
  if (!bytes.length) return "";
  let num = B0; for (const b of bytes) num = (num << B8) | BigInt(b);
  const c = []; while (num > B0) { c.push(UA[Number(num % UB)]); num /= UB; } c.reverse();
  return UA[Math.floor(bytes.length / UA.length)] + UA[bytes.length % UA.length] + c.join("");
}

// baseBMP alphabet (simplified — same exclusions as arx-codec.ts)
const BMP = [];
for (let cp = 0xA1; cp <= 0xFFEF; cp++) {
  if (cp >= 0xD800 && cp <= 0xDFFF) continue;
  if (cp === 0xAD) continue;
  if (cp >= 0x300 && cp <= 0x36F) continue;
  if (cp >= 0x483 && cp <= 0x489) continue;
  if (cp >= 0x591 && cp <= 0x5BD) continue;
  if (cp === 0x5BF || (cp >= 0x5C1 && cp <= 0x5C2)) continue;
  if (cp >= 0x5C4 && cp <= 0x5C5) continue;
  if (cp === 0x5C7) continue;
  if (cp >= 0x610 && cp <= 0x61A) continue;
  if (cp >= 0x64B && cp <= 0x65F) continue;
  if (cp === 0x670) continue;
  if (cp >= 0x6D6 && cp <= 0x6DC) continue;
  if (cp >= 0x6DF && cp <= 0x6E4) continue;
  if (cp >= 0x6E7 && cp <= 0x6E8) continue;
  if (cp >= 0x6EA && cp <= 0x6ED) continue;
  if (cp === 0x711) continue;
  if (cp >= 0x730 && cp <= 0x74A) continue;
  if (cp >= 0x7A6 && cp <= 0x7B0) continue;
  if (cp >= 0x7EB && cp <= 0x7F3) continue;
  if (cp === 0x7FD) continue;
  if (cp >= 0x816 && cp <= 0x819) continue;
  if (cp >= 0x81B && cp <= 0x823) continue;
  if (cp >= 0x825 && cp <= 0x827) continue;
  if (cp >= 0x829 && cp <= 0x82D) continue;
  if (cp >= 0x859 && cp <= 0x85B) continue;
  if (cp >= 0x898 && cp <= 0x89F) continue;
  if (cp >= 0x8CA && cp <= 0x903) continue;
  if (cp >= 0x93A && cp <= 0x94F) continue;
  if (cp >= 0x951 && cp <= 0x957) continue;
  if (cp >= 0x962 && cp <= 0x963) continue;
  if (cp >= 0x981 && cp <= 0x983) continue;
  if (cp === 0x9BC) continue;
  if (cp >= 0x9BE && cp <= 0x9C4) continue;
  if (cp >= 0x9C7 && cp <= 0x9C8) continue;
  if (cp >= 0x9CB && cp <= 0x9CD) continue;
  if (cp === 0x9D7) continue;
  if (cp >= 0x9E2 && cp <= 0x9E3) continue;
  if (cp === 0x9FE) continue;
  if (cp >= 0xA01 && cp <= 0xA03) continue;
  if (cp >= 0xA3C && cp <= 0xA51) continue;
  if (cp >= 0xA70 && cp <= 0xA71) continue;
  if (cp === 0xA75) continue;
  if (cp >= 0xA81 && cp <= 0xA83) continue;
  if (cp >= 0xABC && cp <= 0xACD) continue;
  if (cp >= 0xAE2 && cp <= 0xAE3) continue;
  if (cp >= 0xAFA && cp <= 0xAFF) continue;
  if (cp >= 0xB01 && cp <= 0xB03) continue;
  if (cp >= 0xB3C && cp <= 0xB57) continue;
  if (cp >= 0xB62 && cp <= 0xB63) continue;
  if (cp >= 0xB82 && cp <= 0xB83) continue;
  if (cp >= 0xBBE && cp <= 0xBCD) continue;
  if (cp === 0xBD7) continue;
  if (cp >= 0xC00 && cp <= 0xC04) continue;
  if (cp >= 0xC3C && cp <= 0xC56) continue;
  if (cp >= 0xC62 && cp <= 0xC63) continue;
  if (cp >= 0xC81 && cp <= 0xC83) continue;
  if (cp >= 0xCBC && cp <= 0xCD6) continue;
  if (cp >= 0xCE2 && cp <= 0xCE3) continue;
  if (cp === 0xCF3) continue;
  if (cp >= 0xD00 && cp <= 0xD03) continue;
  if (cp >= 0xD3B && cp <= 0xD57) continue;
  if (cp >= 0xD62 && cp <= 0xD63) continue;
  if (cp >= 0xD81 && cp <= 0xD83) continue;
  if (cp >= 0xDCA && cp <= 0xDDF) continue;
  if (cp >= 0xDF2 && cp <= 0xDF3) continue;
  if (cp === 0xE31) continue;
  if (cp >= 0xE34 && cp <= 0xE3A) continue;
  if (cp >= 0xE47 && cp <= 0xE4E) continue;
  if (cp === 0xEB1) continue;
  if (cp >= 0xEB4 && cp <= 0xEBC) continue;
  if (cp >= 0xEC8 && cp <= 0xECE) continue;
  if (cp >= 0xF18 && cp <= 0xF19) continue;
  if (cp === 0xF35 || cp === 0xF37 || cp === 0xF39) continue;
  if (cp >= 0xF3E && cp <= 0xF3F) continue;
  if (cp >= 0xF71 && cp <= 0xF84) continue;
  if (cp >= 0xF86 && cp <= 0xF87) continue;
  if (cp >= 0xF8D && cp <= 0xFBC) continue;
  if (cp === 0xFC6) continue;
  if (cp >= 0x102B && cp <= 0x103E) continue;
  if (cp >= 0x1056 && cp <= 0x1059) continue;
  if (cp >= 0x105E && cp <= 0x1060) continue;
  if (cp >= 0x1062 && cp <= 0x1064) continue;
  if (cp >= 0x1067 && cp <= 0x106D) continue;
  if (cp >= 0x1071 && cp <= 0x1074) continue;
  if (cp >= 0x1082 && cp <= 0x108D) continue;
  if (cp === 0x108F) continue;
  if (cp >= 0x109A && cp <= 0x109D) continue;
  if (cp >= 0x135D && cp <= 0x135F) continue;
  if (cp >= 0x1712 && cp <= 0x1715) continue;
  if (cp >= 0x1732 && cp <= 0x1734) continue;
  if (cp >= 0x1752 && cp <= 0x1753) continue;
  if (cp >= 0x1772 && cp <= 0x1773) continue;
  if (cp >= 0x17B4 && cp <= 0x17D3) continue;
  if (cp === 0x17DD) continue;
  if (cp >= 0x180B && cp <= 0x180F) continue;
  if (cp >= 0x1885 && cp <= 0x1886) continue;
  if (cp === 0x18A9) continue;
  if (cp >= 0x1920 && cp <= 0x192B) continue;
  if (cp >= 0x1930 && cp <= 0x193B) continue;
  if (cp >= 0x1A17 && cp <= 0x1A1B) continue;
  if (cp >= 0x1A55 && cp <= 0x1A5E) continue;
  if (cp >= 0x1A60 && cp <= 0x1A7C) continue;
  if (cp === 0x1A7F) continue;
  if (cp >= 0x1AB0 && cp <= 0x1ACE) continue;
  if (cp >= 0x1B00 && cp <= 0x1B04) continue;
  if (cp >= 0x1B34 && cp <= 0x1B44) continue;
  if (cp >= 0x1B6B && cp <= 0x1B73) continue;
  if (cp >= 0x1B80 && cp <= 0x1B82) continue;
  if (cp >= 0x1BA1 && cp <= 0x1BAD) continue;
  if (cp >= 0x1BE6 && cp <= 0x1BF3) continue;
  if (cp >= 0x1C24 && cp <= 0x1C37) continue;
  if (cp >= 0x1CD0 && cp <= 0x1CF9) continue;
  if (cp >= 0x1DC0 && cp <= 0x1DFF) continue;
  if (cp >= 0x200B && cp <= 0x200F) continue;
  if (cp >= 0x2028 && cp <= 0x202E) continue;
  if (cp >= 0x2060 && cp <= 0x2069) continue;
  if (cp >= 0x20D0 && cp <= 0x20F0) continue;
  if (cp >= 0x2CEF && cp <= 0x2CF1) continue;
  if (cp === 0x2D7F) continue;
  if (cp >= 0x2DE0 && cp <= 0x2DFF) continue;
  if (cp >= 0x302A && cp <= 0x302F) continue;
  if (cp >= 0x3099 && cp <= 0x309A) continue;
  if (cp >= 0xA66F && cp <= 0xA672) continue;
  if (cp >= 0xA674 && cp <= 0xA67D) continue;
  if (cp >= 0xA69E && cp <= 0xA69F) continue;
  if (cp >= 0xA6F0 && cp <= 0xA6F1) continue;
  if (cp === 0xA802 || cp === 0xA806 || cp === 0xA80B) continue;
  if (cp >= 0xA823 && cp <= 0xA827) continue;
  if (cp === 0xA82C) continue;
  if (cp >= 0xA880 && cp <= 0xA881) continue;
  if (cp >= 0xA8B4 && cp <= 0xA8C5) continue;
  if (cp >= 0xA8E0 && cp <= 0xA8F1) continue;
  if (cp === 0xA8FF) continue;
  if (cp >= 0xA926 && cp <= 0xA92D) continue;
  if (cp >= 0xA947 && cp <= 0xA953) continue;
  if (cp >= 0xA980 && cp <= 0xA983) continue;
  if (cp >= 0xA9B3 && cp <= 0xA9C0) continue;
  if (cp === 0xA9E5) continue;
  if (cp >= 0xAA29 && cp <= 0xAA36) continue;
  if (cp === 0xAA43) continue;
  if (cp >= 0xAA4C && cp <= 0xAA4D) continue;
  if (cp >= 0xAA7B && cp <= 0xAA7D) continue;
  if (cp === 0xAAB0) continue;
  if (cp >= 0xAAB2 && cp <= 0xAAB4) continue;
  if (cp >= 0xAAB7 && cp <= 0xAAB8) continue;
  if (cp >= 0xAABE && cp <= 0xAABF) continue;
  if (cp === 0xAAC1) continue;
  if (cp >= 0xAAEB && cp <= 0xAAEF) continue;
  if (cp >= 0xAAF5 && cp <= 0xAAF6) continue;
  if (cp >= 0xABE3 && cp <= 0xABEA) continue;
  if (cp >= 0xABEC && cp <= 0xABED) continue;
  if (cp === 0xFB1E) continue;
  if (cp >= 0xFE00 && cp <= 0xFE0F) continue;
  if (cp >= 0xFE20 && cp <= 0xFE2F) continue;
  if (cp === 0xFEFF) continue;
  if (cp >= 0xFFF0 && cp <= 0xFFFF) continue;
  BMP.push(String.fromCodePoint(cp));
}
const BB = BigInt(BMP.length);
function encBaseBMP(bytes) {
  if (!bytes.length) return "";
  let num = B0; for (const b of bytes) num = (num << B8) | BigInt(b);
  const c = []; while (num > B0) { c.push(BMP[Number(num % BB)]); num /= BB; } c.reverse();
  return "\uFFF0" + BMP[Math.floor(bytes.length / BMP.length)] + BMP[bytes.length % BMP.length] + c.join("");
}

function encBase64url(bytes) {
  if (!bytes.length) return "B.";
  return `B.${Buffer.from(bytes).toString("base64url")}`;
}

// --- Dictionary substitution ---
const SBC = [1,2,3,4,5,6,7,8,0x0b,0x0e,0x0f,0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1a,0x1b,0x1c,0x1d];
const subs = [];
for (let i = 0; i < dict.singleByteSlots.length && i < SBC.length; i++)
  subs.push([dict.singleByteSlots[i], String.fromCharCode(SBC[i])]);
for (let i = 0; i < dict.extendedSlots.length; i++)
  subs.push([dict.extendedSlots[i], "\x00" + String.fromCharCode(i + 1)]);
function dictEncode(t) { let r = t; for (const [f,to] of subs) r = r.split(f).join(to); return r; }

function brotli(buf) {
  return zlib.brotliCompressSync(Buffer.from(buf), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
}

// --- Payloads ---
const payloads = [
  { name: 'AGENTS.md (markdown)', text: fs.readFileSync('AGENTS.md', 'utf8').slice(0, 8000) },
  { name: 'fragment.ts (code)', text: fs.readFileSync('src/lib/payload/fragment.ts', 'utf8').slice(0, 8000) },
  { name: 'README.md (markdown)', text: fs.readFileSync('README.md', 'utf8') },
];

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║           ARX CODEC BENCHMARK — WITH TIMING                        ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

for (const { name, text } of payloads) {
  console.log(`━━━ ${name} (${text.length} chars) ━━━`);

  // Deflate baseline
  const t0d = performance.now();
  const deflated = zlib.deflateSync(Buffer.from(text), { level: 9 });
  const deflateB64 = Buffer.from(deflated).toString('base64url');
  const deflateMs = performance.now() - t0d;

  // ARX pipeline
  const sub = dictEncode(text);
  const subBuf = new TextEncoder().encode(sub);

  const t0b = performance.now();
  const compressed = brotli(subBuf);
  const brotliMs = performance.now() - t0b;

  const t0_76 = performance.now();
  const b76 = encBase76(compressed);
  const ms76 = performance.now() - t0_76;

  const t0_1k = performance.now();
  const b1k = encBase1k(compressed);
  const ms1k = performance.now() - t0_1k;

  const t0_bmp = performance.now();
  const bbmp = encBaseBMP(compressed);
  const msBmp = performance.now() - t0_bmp;

  const t0_b64 = performance.now();
  const b64u = encBase64url(compressed);
  const msB64 = performance.now() - t0_b64;

  console.log(`  Deflate+base64url:  ${deflateB64.length} chars  (${deflateMs.toFixed(1)}ms)`);
  console.log(`  ARX ASCII (base76): ${b76.length} chars  (brotli ${brotliMs.toFixed(1)}ms + encode ${ms76.toFixed(1)}ms)`);
  console.log(`  ARX base64url:      ${b64u.length} chars  (brotli ${brotliMs.toFixed(1)}ms + encode ${msB64.toFixed(1)}ms)`);
  console.log(`  ARX Unicode (1k):   ${b1k.length} chars  (brotli ${brotliMs.toFixed(1)}ms + encode ${ms1k.toFixed(1)}ms)`);
  console.log(`  ARX Unicode (BMP):  ${bbmp.length} chars  (brotli ${brotliMs.toFixed(1)}ms + encode ${msBmp.toFixed(1)}ms)`);
  console.log('');
  console.log(`  vs deflate:  base76 ${((1 - b76.length/deflateB64.length)*100).toFixed(1)}% smaller`);
  console.log(`               base64url ${((1 - b64u.length/deflateB64.length)*100).toFixed(1)}% smaller`);
  console.log(`               base1k ${((1 - b1k.length/deflateB64.length)*100).toFixed(1)}% smaller`);
  console.log(`               baseBMP ${((1 - bbmp.length/deflateB64.length)*100).toFixed(1)}% smaller`);
  console.log(`  Ratio:       ${(text.length/bbmp.length).toFixed(2)}x (baseBMP)`);
  console.log('');
}

// Recursive compression test
console.log('━━━ RECURSIVE COMPRESSION TEST (AGENTS.md 8000 chars) ━━━');
const sample = fs.readFileSync('AGENTS.md', 'utf8').slice(0, 8000);
const sub = dictEncode(sample);
let buf = Buffer.from(new TextEncoder().encode(sub));
for (let i = 1; i <= 5; i++) {
  const next = brotli(buf);
  const status = next.length < buf.length ? '✅ smaller' : '❌ bigger';
  console.log(`  Depth ${i}: ${next.length} bytes → ${encBaseBMP(next).length} BMP chars  ${status}`);
  if (next.length >= buf.length) break;
  buf = next;
}
console.log('  → Recursive compression provides no benefit (brotli output is incompressible)\n');

// Timing summary
console.log('━━━ FULL PIPELINE TIMING (avg of 10 runs, AGENTS.md 8000 chars) ━━━');
const timingText = fs.readFileSync('AGENTS.md', 'utf8').slice(0, 8000);
const runs = 10;

for (const [label, fn] of [
  ['Deflate+base64url', () => { const c = zlib.deflateSync(Buffer.from(timingText), { level: 9 }); Buffer.from(c).toString('base64url'); }],
  ['ARX+base76', () => { const s = dictEncode(timingText); const c = brotli(new TextEncoder().encode(s)); encBase76(c); }],
  ['ARX+base64url', () => { const s = dictEncode(timingText); const c = brotli(new TextEncoder().encode(s)); encBase64url(c); }],
  ['ARX+base1k', () => { const s = dictEncode(timingText); const c = brotli(new TextEncoder().encode(s)); encBase1k(c); }],
  ['ARX+baseBMP', () => { const s = dictEncode(timingText); const c = brotli(new TextEncoder().encode(s)); encBaseBMP(c); }],
]) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); times.push(performance.now() - t); }
  const avg = times.reduce((a,b) => a+b) / runs;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`  ${label.padEnd(20)} avg=${avg.toFixed(1)}ms  min=${min.toFixed(1)}ms  max=${max.toFixed(1)}ms`);
}

