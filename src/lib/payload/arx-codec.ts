/**
 * arx codec — Agent Render eXtreme compression
 *
 * Pipeline:  text → dictionary substitution → brotli (quality 11) → base76 URL-fragment-safe encoding
 *
 * Achieves ~26% smaller fragments than deflate+base64url on typical payloads by combining:
 *   1. Dictionary substitution: replaces common multi-char patterns with short control bytes
 *   2. Brotli: ~20% better compression ratio than deflate on text payloads
 *   3. Base76: URL-fragment-safe alphabet with 76 chars vs base64url's 64, reducing encoding overhead
 *
 * The substitution dictionary can be loaded from a shared static endpoint
 * (`/arx-dictionary.json`) so agents and the viewer use the same table.
 * A built-in fallback dictionary is always available when the external file
 * cannot be fetched.
 */

// ---------------------------------------------------------------------------
// Dictionary types and built-in fallback
// ---------------------------------------------------------------------------

export type ArxDictionary = {
  version: number;
  singleByteSlots: string[];
  extendedSlots: string[];
};

/**
 * Single-byte control codes used for the first 25 substitution slots.
 * Avoids 0x00 NUL, 0x09 TAB, 0x0A LF, 0x0C FF, 0x0D CR.
 */
const SINGLE_BYTE_CODES = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
  0x1d,
];

/** Extended slots use a 0x00 prefix followed by an index byte (1-based). */
const EXTENDED_PREFIX = "\x00";

/**
 * Built-in fallback dictionary — used when the external dictionary is not
 * loaded. This matches the original hardcoded substitution table so existing
 * arx payloads decode correctly without a network fetch.
 */
const BUILTIN_DICTIONARY: ArxDictionary = {
  version: 0,
  singleByteSlots: [
    "\n## ",
    "\n### ",
    "\n- [x] ",
    "\n- [ ] ",
    "\n- ",
    "\n\n",
    "```",
    "\n| ",
    "export ",
    "import ",
    "function ",
    "return ",
    "const ",
    "interface ",
    "string",
    "number",
    "boolean",
    "undefined",
    "artifact",
    "payload",
    "fragment",
    "content",
    "markdown",
    "component",
    "envelope",
  ],
  extendedSlots: [
    "https://",
    "agent-render",
  ],
};

// ---------------------------------------------------------------------------
// Dictionary → substitution pairs
// ---------------------------------------------------------------------------

type SubstitutionPair = [string, string];

function buildSubstitutions(dict: ArxDictionary): SubstitutionPair[] {
  const pairs: SubstitutionPair[] = [];

  for (let i = 0; i < dict.singleByteSlots.length && i < SINGLE_BYTE_CODES.length; i++) {
    pairs.push([dict.singleByteSlots[i], String.fromCharCode(SINGLE_BYTE_CODES[i])]);
  }

  for (let i = 0; i < dict.extendedSlots.length; i++) {
    pairs.push([dict.extendedSlots[i], EXTENDED_PREFIX + String.fromCharCode(i + 1)]);
  }

  return pairs;
}

// Active substitution table — starts with the built-in dictionary
let activeSubs: SubstitutionPair[] = buildSubstitutions(BUILTIN_DICTIONARY);
let activeDictVersion = BUILTIN_DICTIONARY.version;

// ---------------------------------------------------------------------------
// External dictionary loading
// ---------------------------------------------------------------------------

let dictionaryLoaded = false;

function isArxDictionary(value: unknown): value is ArxDictionary {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === "number" &&
    Array.isArray(obj.singleByteSlots) &&
    Array.isArray(obj.extendedSlots) &&
    obj.singleByteSlots.every((s: unknown) => typeof s === "string") &&
    obj.extendedSlots.every((s: unknown) => typeof s === "string")
  );
}

/**
 * Load the shared arx dictionary from a URL or parsed object.
 * Call this once at startup (or when the dictionary may have changed).
 * Returns the dictionary version on success, or -1 on failure (falls back to built-in).
 */
export async function loadArxDictionary(source?: string | ArxDictionary): Promise<number> {
  try {
    let dict: ArxDictionary;

    if (source && typeof source === "object") {
      dict = source;
    } else {
      const url = typeof source === "string" ? source : resolveDefaultDictionaryUrl();
      const response = await fetch(url);
      if (!response.ok) return -1;
      const json: unknown = await response.json();
      if (!isArxDictionary(json)) return -1;
      dict = json;
    }

    activeSubs = buildSubstitutions(dict);
    activeDictVersion = dict.version;
    dictionaryLoaded = true;
    return dict.version;
  } catch {
    return -1;
  }
}

/**
 * Load the dictionary from a pre-parsed object (synchronous).
 * Useful in test environments or when the dictionary JSON is already available.
 */
export function loadArxDictionarySync(dict: ArxDictionary): number {
  activeSubs = buildSubstitutions(dict);
  activeDictVersion = dict.version;
  dictionaryLoaded = true;
  return dict.version;
}

/** Returns true if an external dictionary has been loaded. */
export function isExternalDictionaryLoaded(): boolean {
  return dictionaryLoaded;
}

/** Returns the active dictionary version (0 = built-in fallback). */
export function getActiveDictVersion(): number {
  return activeDictVersion;
}

function resolveDefaultDictionaryUrl(): string {
  const basePath =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BASE_PATH
      ? process.env.NEXT_PUBLIC_BASE_PATH
      : "";
  return `${basePath}/arx-dictionary.json`;
}

// ---------------------------------------------------------------------------
// Substitution encode / decode
// ---------------------------------------------------------------------------

function dictEncode(text: string): string {
  let result = text;
  for (const [from, to] of activeSubs) {
    result = result.split(from).join(to);
  }
  return result;
}

function dictDecode(text: string): string {
  let result = text;
  for (let i = activeSubs.length - 1; i >= 0; i--) {
    result = result.split(activeSubs[i][1]).join(activeSubs[i][0]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Base76 — URL-fragment-safe ASCII binary-to-text encoding
//
// Alphabet: A-Za-z0-9 plus 15 fragment-safe punctuation chars (77 total).
// Uses BigInt arithmetic for optimal packing (~6.27 bits/char
// vs base64url's 6 bits/char — ~4.4% denser).
//
// Wire format: 2-char length prefix (original byte count) + base76 digits.
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$*()',;:@/";
const BASE = BigInt(ALPHABET.length);
const BIGINT_0 = BigInt(0);
const BIGINT_8 = BigInt(8);
const BIGINT_0xFF = BigInt(0xFF);

const CHAR_TO_INDEX = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) {
  CHAR_TO_INDEX[ALPHABET.charCodeAt(i)] = i;
}

/** Public API for `encodeBase76`. */
export function encodeBase76(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let num = BIGINT_0;
  for (const b of bytes) {
    num = (num << BIGINT_8) | BigInt(b);
  }

  const chars: string[] = [];
  while (num > BIGINT_0) {
    chars.push(ALPHABET[Number(num % BASE)]);
    num /= BASE;
  }
  chars.reverse();

  const lenHigh = Math.floor(bytes.length / ALPHABET.length);
  const lenLow = bytes.length % ALPHABET.length;
  return ALPHABET[lenHigh] + ALPHABET[lenLow] + chars.join("");
}

/** Public API for `decodeBase76`. */
export function decodeBase76(str: string): Uint8Array {
  if (str.length < 2) return new Uint8Array(0);

  const lenHigh = CHAR_TO_INDEX[str.charCodeAt(0)];
  const lenLow = CHAR_TO_INDEX[str.charCodeAt(1)];
  const byteLen = lenHigh * ALPHABET.length + lenLow;

  let num = BIGINT_0;
  for (let i = 2; i < str.length; i++) {
    num = num * BASE + BigInt(CHAR_TO_INDEX[str.charCodeAt(i)]);
  }

  const result = new Uint8Array(byteLen);
  for (let i = byteLen - 1; i >= 0; i--) {
    result[i] = Number(num & BIGINT_0xFF);
    num >>= BIGINT_8;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Base1k — Unicode binary-to-text encoding for maximum character efficiency
//
// Uses 1774 code points from U+00A1–U+07FF (all 2-byte UTF-8), skipping
// combining diacriticals (U+0300–U+036F) and soft hyphen (U+00AD).
// ~10.79 bits/char — 42% fewer characters than base76 for the same bytes.
//
// Tradeoff: fragments contain non-ASCII chars which may not survive all
// chat platforms or URL shorteners. Use base76 as the safe fallback.
//
// Wire format: 2-char length prefix (original byte count) + base1k digits.
// ---------------------------------------------------------------------------

const UNICODE_ALPHABET: string[] = [];
for (let cp = 0x00A1; cp <= 0x07FF; cp++) {
  if (cp === 0x00AD) continue;
  if (cp >= 0x0300 && cp <= 0x036F) continue;
  UNICODE_ALPHABET.push(String.fromCodePoint(cp));
}
const UBASE = BigInt(UNICODE_ALPHABET.length);

const UNICODE_CHAR_TO_INDEX = new Map<string, number>();
for (let i = 0; i < UNICODE_ALPHABET.length; i++) {
  UNICODE_CHAR_TO_INDEX.set(UNICODE_ALPHABET[i], i);
}

/** Public API for `encodeBase1k`. */
export function encodeBase1k(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let num = BIGINT_0;
  for (const b of bytes) {
    num = (num << BIGINT_8) | BigInt(b);
  }

  const chars: string[] = [];
  while (num > BIGINT_0) {
    chars.push(UNICODE_ALPHABET[Number(num % UBASE)]);
    num /= UBASE;
  }
  chars.reverse();

  const lenHigh = Math.floor(bytes.length / UNICODE_ALPHABET.length);
  const lenLow = bytes.length % UNICODE_ALPHABET.length;
  return UNICODE_ALPHABET[lenHigh] + UNICODE_ALPHABET[lenLow] + chars.join("");
}

/** Public API for `decodeBase1k`. */
export function decodeBase1k(str: string): Uint8Array {
  if (str.length < 2) return new Uint8Array(0);

  const lenHigh = UNICODE_CHAR_TO_INDEX.get(str[0]) ?? 0;
  const lenLow = UNICODE_CHAR_TO_INDEX.get(str[1]) ?? 0;
  const byteLen = lenHigh * UNICODE_ALPHABET.length + lenLow;

  let num = BIGINT_0;
  for (let i = 2; i < str.length; i++) {
    num = num * UBASE + BigInt(UNICODE_CHAR_TO_INDEX.get(str[i]) ?? 0);
  }

  const result = new Uint8Array(byteLen);
  for (let i = byteLen - 1; i >= 0; i--) {
    result[i] = Number(num & BIGINT_0xFF);
    num >>= BIGINT_8;
  }
  return result;
}

/** Returns true if the encoded string uses base1k Unicode encoding (U+00A1–U+07FF). */
export function isBase1kEncoded(str: string): boolean {
  if (str.length < 2) return false;
  const cp = str.codePointAt(0) ?? 0;
  return cp >= 0x00A1 && cp <= 0x07FF;
}

// ---------------------------------------------------------------------------
// BaseBMP — high-density Unicode binary-to-text encoding
//
// Uses ~62k safe BMP code points (U+00A1–U+FFEF), skipping surrogates,
// combining marks, zero-width chars, variation selectors, and other
// problematic ranges. ~15.92 bits/char — 32% fewer characters than base1k.
//
// Tradeoff: fragments contain CJK and other non-Latin chars. Most modern
// browsers and chat platforms handle BMP chars fine, but some URL shorteners
// or legacy systems may not. Use base1k or base76 as safer fallbacks.
//
// Wire format: 2-char length prefix (original byte count) + baseBMP digits.
// ---------------------------------------------------------------------------

const BMP_ALPHABET: string[] = [];
for (let cp = 0x00A1; cp <= 0xFFEF; cp++) {
  if (cp >= 0xD800 && cp <= 0xDFFF) continue; // surrogates
  if (cp === 0x00AD) continue; // soft hyphen
  // Combining Diacritical Marks and extensions
  if (cp >= 0x0300 && cp <= 0x036F) continue;
  if (cp >= 0x0483 && cp <= 0x0489) continue;
  if (cp >= 0x0591 && cp <= 0x05BD) continue;
  if (cp === 0x05BF || (cp >= 0x05C1 && cp <= 0x05C2)) continue;
  if (cp >= 0x05C4 && cp <= 0x05C5) continue;
  if (cp === 0x05C7) continue;
  if (cp >= 0x0610 && cp <= 0x061A) continue;
  if (cp >= 0x064B && cp <= 0x065F) continue;
  if (cp === 0x0670) continue;
  if (cp >= 0x06D6 && cp <= 0x06DC) continue;
  if (cp >= 0x06DF && cp <= 0x06E4) continue;
  if (cp >= 0x06E7 && cp <= 0x06E8) continue;
  if (cp >= 0x06EA && cp <= 0x06ED) continue;
  if (cp === 0x0711) continue;
  if (cp >= 0x0730 && cp <= 0x074A) continue;
  if (cp >= 0x07A6 && cp <= 0x07B0) continue;
  if (cp >= 0x07EB && cp <= 0x07F3) continue;
  if (cp === 0x07FD) continue;
  if (cp >= 0x0816 && cp <= 0x0819) continue;
  if (cp >= 0x081B && cp <= 0x0823) continue;
  if (cp >= 0x0825 && cp <= 0x0827) continue;
  if (cp >= 0x0829 && cp <= 0x082D) continue;
  if (cp >= 0x0859 && cp <= 0x085B) continue;
  if (cp >= 0x0898 && cp <= 0x089F) continue;
  if (cp >= 0x08CA && cp <= 0x0903) continue;
  if (cp >= 0x093A && cp <= 0x094F) continue;
  if (cp >= 0x0951 && cp <= 0x0957) continue;
  if (cp >= 0x0962 && cp <= 0x0963) continue;
  if (cp >= 0x0981 && cp <= 0x0983) continue;
  if (cp === 0x09BC) continue;
  if (cp >= 0x09BE && cp <= 0x09C4) continue;
  if (cp >= 0x09C7 && cp <= 0x09C8) continue;
  if (cp >= 0x09CB && cp <= 0x09CD) continue;
  if (cp === 0x09D7) continue;
  if (cp >= 0x09E2 && cp <= 0x09E3) continue;
  if (cp === 0x09FE) continue;
  if (cp >= 0x0A01 && cp <= 0x0A03) continue;
  if (cp >= 0x0A3C && cp <= 0x0A51) continue;
  if (cp >= 0x0A70 && cp <= 0x0A71) continue;
  if (cp === 0x0A75) continue;
  if (cp >= 0x0A81 && cp <= 0x0A83) continue;
  if (cp >= 0x0ABC && cp <= 0x0ACD) continue;
  if (cp >= 0x0AE2 && cp <= 0x0AE3) continue;
  if (cp >= 0x0AFA && cp <= 0x0AFF) continue;
  if (cp >= 0x0B01 && cp <= 0x0B03) continue;
  if (cp >= 0x0B3C && cp <= 0x0B57) continue;
  if (cp >= 0x0B62 && cp <= 0x0B63) continue;
  if (cp >= 0x0B82 && cp <= 0x0B83) continue;
  if (cp >= 0x0BBE && cp <= 0x0BCD) continue;
  if (cp === 0x0BD7) continue;
  if (cp >= 0x0C00 && cp <= 0x0C04) continue;
  if (cp >= 0x0C3C && cp <= 0x0C56) continue;
  if (cp >= 0x0C62 && cp <= 0x0C63) continue;
  if (cp >= 0x0C81 && cp <= 0x0C83) continue;
  if (cp >= 0x0CBC && cp <= 0x0CD6) continue;
  if (cp >= 0x0CE2 && cp <= 0x0CE3) continue;
  if (cp === 0x0CF3) continue;
  if (cp >= 0x0D00 && cp <= 0x0D03) continue;
  if (cp >= 0x0D3B && cp <= 0x0D57) continue;
  if (cp >= 0x0D62 && cp <= 0x0D63) continue;
  if (cp >= 0x0D81 && cp <= 0x0D83) continue;
  if (cp >= 0x0DCA && cp <= 0x0DDF) continue;
  if (cp >= 0x0DF2 && cp <= 0x0DF3) continue;
  if (cp === 0x0E31) continue;
  if (cp >= 0x0E34 && cp <= 0x0E3A) continue;
  if (cp >= 0x0E47 && cp <= 0x0E4E) continue;
  if (cp === 0x0EB1) continue;
  if (cp >= 0x0EB4 && cp <= 0x0EBC) continue;
  if (cp >= 0x0EC8 && cp <= 0x0ECE) continue;
  if (cp >= 0x0F18 && cp <= 0x0F19) continue;
  if (cp === 0x0F35 || cp === 0x0F37 || cp === 0x0F39) continue;
  if (cp >= 0x0F3E && cp <= 0x0F3F) continue;
  if (cp >= 0x0F71 && cp <= 0x0F84) continue;
  if (cp >= 0x0F86 && cp <= 0x0F87) continue;
  if (cp >= 0x0F8D && cp <= 0x0FBC) continue;
  if (cp === 0x0FC6) continue;
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
  if (cp >= 0x200B && cp <= 0x200F) continue; // zero-width
  if (cp >= 0x2028 && cp <= 0x202E) continue; // line/paragraph separators, bidi
  if (cp >= 0x2060 && cp <= 0x2069) continue; // invisible chars
  if (cp >= 0x20D0 && cp <= 0x20F0) continue; // combining for symbols
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
  if (cp >= 0xFE00 && cp <= 0xFE0F) continue; // variation selectors
  if (cp >= 0xFE20 && cp <= 0xFE2F) continue; // combining half marks
  if (cp === 0xFEFF) continue; // BOM
  if (cp >= 0xFFF0 && cp <= 0xFFFF) continue; // specials
  BMP_ALPHABET.push(String.fromCodePoint(cp));
}
const BMPBASE = BigInt(BMP_ALPHABET.length);

const BMP_CHAR_TO_INDEX = new Map<string, number>();
for (let i = 0; i < BMP_ALPHABET.length; i++) {
  BMP_CHAR_TO_INDEX.set(BMP_ALPHABET[i], i);
}

/**
 * Wire format: U+FFF0 marker + 2-char BMP length prefix + baseBMP digits.
 * The U+FFF0 marker (in the excluded Specials block) distinguishes baseBMP from base1k/base76.
 */
const BMP_MARKER = "\uFFF0";

/** Public API for `encodeBaseBMP`. */
export function encodeBaseBMP(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let num = BIGINT_0;
  for (const b of bytes) {
    num = (num << BIGINT_8) | BigInt(b);
  }

  const chars: string[] = [];
  while (num > BIGINT_0) {
    chars.push(BMP_ALPHABET[Number(num % BMPBASE)]);
    num /= BMPBASE;
  }
  chars.reverse();

  const lenHigh = Math.floor(bytes.length / BMP_ALPHABET.length);
  const lenLow = bytes.length % BMP_ALPHABET.length;
  return BMP_MARKER + BMP_ALPHABET[lenHigh] + BMP_ALPHABET[lenLow] + chars.join("");
}

/** Public API for `decodeBaseBMP`. */
export function decodeBaseBMP(str: string): Uint8Array {
  // Strip the BMP_MARKER prefix if present
  const s = str.startsWith(BMP_MARKER) ? str.slice(1) : str;
  if (s.length < 2) return new Uint8Array(0);

  const lenHigh = BMP_CHAR_TO_INDEX.get(s[0]) ?? 0;
  const lenLow = BMP_CHAR_TO_INDEX.get(s[1]) ?? 0;
  const byteLen = lenHigh * BMP_ALPHABET.length + lenLow;

  let num = BIGINT_0;
  for (let i = 2; i < s.length; i++) {
    num = num * BMPBASE + BigInt(BMP_CHAR_TO_INDEX.get(s[i]) ?? 0);
  }

  const result = new Uint8Array(byteLen);
  for (let i = byteLen - 1; i >= 0; i--) {
    result[i] = Number(num & BIGINT_0xFF);
    num >>= BIGINT_8;
  }
  return result;
}

/** Returns true if the encoded string uses baseBMP encoding (starts with U+FFEE marker). */
export function isBaseBMPEncoded(str: string): boolean {
  return str.startsWith(BMP_MARKER);
}

// ---------------------------------------------------------------------------
// Brotli wrapper — lazy-loads brotli-wasm for browser compatibility
// ---------------------------------------------------------------------------

type BrotliModule = {
  compress: (buf: Uint8Array, options?: { quality?: number }) => Uint8Array;
  decompress: (buf: Uint8Array) => Uint8Array;
};

let brotliModule: BrotliModule | null = null;

async function getBrotli(): Promise<BrotliModule> {
  if (brotliModule) return brotliModule;
  const mod = await import("brotli-wasm");
  brotliModule = (await mod.default) as unknown as BrotliModule;
  return brotliModule;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Public API for `arxCompress`. */
export async function arxCompress(json: string): Promise<string> {
  const brotli = await getBrotli();
  const substituted = dictEncode(json);
  const compressed = brotli.compress(new TextEncoder().encode(substituted), { quality: 11 });
  return encodeBase76(compressed);
}

/**
 * Compress with the arx pipeline using base1k Unicode encoding.
 * Produces ~42% fewer characters than `arxCompress` at the cost of
 * non-ASCII fragment content.
 */
export async function arxCompressUnicode(json: string): Promise<string> {
  const brotli = await getBrotli();
  const substituted = dictEncode(json);
  const compressed = brotli.compress(new TextEncoder().encode(substituted), { quality: 11 });
  return encodeBase1k(compressed);
}

/**
 * Compress with the arx pipeline using baseBMP high-density encoding.
 * Produces ~32% fewer characters than base1k (~55% fewer than base76)
 * by using ~62k safe BMP code points (~15.92 bits/char).
 */
export async function arxCompressBMP(json: string): Promise<string> {
  const brotli = await getBrotli();
  const substituted = dictEncode(json);
  const compressed = brotli.compress(new TextEncoder().encode(substituted), { quality: 11 });
  return encodeBaseBMP(compressed);
}

/** Public API for `arxDecompress`. */
export async function arxDecompress(encoded: string): Promise<string> {
  const brotli = await getBrotli();
  const bytes = isBaseBMPEncoded(encoded)
    ? decodeBaseBMP(encoded)
    : isBase1kEncoded(encoded)
      ? decodeBase1k(encoded)
      : decodeBase76(encoded);
  const decompressed = brotli.decompress(bytes);
  return dictDecode(new TextDecoder().decode(decompressed));
}
