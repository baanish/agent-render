/**
 * arx codec — Agent Render eXtreme compression
 *
 * Pipeline:  text → dictionary substitution → brotli (quality 11) → binary-to-text encoding
 * (base76, base1k, baseBMP, or base64url with a `B.` wire prefix)
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

import { MAX_DECODED_PAYLOAD_LENGTH } from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";
import type { Arx2ArtifactTuple, Arx2EnvelopeTuple, ArtifactPayload, PayloadCodec, PayloadEnvelope } from "@/lib/payload/schema";

// ---------------------------------------------------------------------------
// Dictionary types and built-in fallback
// ---------------------------------------------------------------------------

export type ArxDictionary = {
  version: number;
  singleByteSlots: string[];
  extendedSlots: string[];
};

export type ArxWirePayloads = {
  base76: string;
  base1k: string;
  baseBMP: string;
  base64url: string;
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

const ARX2_SINGLE_BYTE_CODES = [0x1e, 0x7f];
const ARX2_EXTENDED_PREFIX = "\x1f";

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

const BUILTIN_ARX2_OVERLAY_DICTIONARY: ArxDictionary = {
  version: 1,
  singleByteSlots: [
    "[\"m\",\"",
    "[\"c\",\"",
  ],
  extendedSlots: [
    "[\"d\",\"",
    "[\"s\",\"",
    "[\"j\",\"",
    "[2,",
    "[3,",
    "],[",
    "\",\"",
    "\",null",
    ",null,\"",
    ",null,null,\"",
    ",\"split\"",
    ",\"unified\"",
    "export const ",
    "export function ",
    "export const value = ",
    "export type ",
    "export interface ",
    "import { ",
    "} from \"",
    " as const",
    "async function ",
    "return <",
    "className=\"",
    "\\n## ",
    "\\n### ",
    "\\n- [x] ",
    "\\n- [ ] ",
    "](#",
    "diff --git ",
    "\\n+++",
    "\\n---",
    "\\n@@ -",
  ],
};

// ---------------------------------------------------------------------------
// Dictionary → substitution pairs
// ---------------------------------------------------------------------------

type SubstitutionPair = [string, string];
type SubstitutionTrieNode = {
  replacement?: string;
  children: Map<string, SubstitutionTrieNode>;
};

type SubstitutionTable = {
  encodeTrie: SubstitutionTrieNode;
  decodeTrie: SubstitutionTrieNode;
};

function buildSubstitutions(
  dict: ArxDictionary,
  singleByteCodes = SINGLE_BYTE_CODES,
  extendedPrefix = EXTENDED_PREFIX,
): SubstitutionPair[] {
  const pairs: SubstitutionPair[] = [];

  for (let i = 0; i < dict.singleByteSlots.length && i < singleByteCodes.length; i++) {
    pairs.push([dict.singleByteSlots[i], String.fromCharCode(singleByteCodes[i])]);
  }

  for (let i = 0; i < dict.extendedSlots.length; i++) {
    pairs.push([dict.extendedSlots[i], extendedPrefix + String.fromCharCode(i + 1)]);
  }

  return pairs;
}

function makeTrieNode(): SubstitutionTrieNode {
  return { children: new Map() };
}

function buildSubstitutionTrie(pairs: SubstitutionPair[], reversed = false): SubstitutionTrieNode {
  const root = makeTrieNode();

  for (const [from, to] of pairs) {
    const match = reversed ? to : from;
    const replacement = reversed ? from : to;

    if (match.length === 0) continue;

    let node = root;
    for (let i = 0; i < match.length; i++) {
      const char = match[i];
      let child = node.children.get(char);
      if (!child) {
        child = makeTrieNode();
        node.children.set(char, child);
      }
      node = child;
    }

    node.replacement ??= replacement;
  }

  return root;
}

function buildSubstitutionTable(pairs: SubstitutionPair[]): SubstitutionTable {
  return {
    encodeTrie: buildSubstitutionTrie(pairs),
    decodeTrie: buildSubstitutionTrie(pairs, true),
  };
}

function applySubstitutionTrie(text: string, trie: SubstitutionTrieNode): string {
  const output: string[] = [];
  let index = 0;

  while (index < text.length) {
    let node: SubstitutionTrieNode | undefined = trie;
    let cursor = index;
    let replacement: string | undefined;
    let replacementLength = 0;

    while (cursor < text.length) {
      node = node.children.get(text[cursor]);
      if (!node) break;
      cursor++;

      if (node.replacement !== undefined) {
        replacement = node.replacement;
        replacementLength = cursor - index;
      }
    }

    if (replacement !== undefined) {
      output.push(replacement);
      index += replacementLength;
    } else {
      output.push(text[index]);
      index++;
    }
  }

  return output.join("");
}

function buildOverlaySubstitutions(dict: ArxDictionary): SubstitutionPair[] {
  const pairs: SubstitutionPair[] = [];

  for (let i = 0; i < dict.singleByteSlots.length && i < ARX2_SINGLE_BYTE_CODES.length; i++) {
    pairs.push([dict.singleByteSlots[i], String.fromCharCode(ARX2_SINGLE_BYTE_CODES[i])]);
  }

  for (let i = 0; i < dict.extendedSlots.length; i++) {
    pairs.push([dict.extendedSlots[i], ARX2_EXTENDED_PREFIX + String.fromCharCode(0x20 + i)]);
  }

  return pairs;
}

// Active substitution tables — start with built-in dictionaries.
let activeSubstitutionTable: SubstitutionTable = buildSubstitutionTable(buildSubstitutions(BUILTIN_DICTIONARY));
let activeOverlaySubstitutionTable: SubstitutionTable = buildSubstitutionTable(
  buildOverlaySubstitutions(BUILTIN_ARX2_OVERLAY_DICTIONARY),
);
let activeDictVersion = BUILTIN_DICTIONARY.version;
let activeArx2OverlayVersion = BUILTIN_ARX2_OVERLAY_DICTIONARY.version;

// ---------------------------------------------------------------------------
// External dictionary loading
// ---------------------------------------------------------------------------

let dictionaryLoaded = false;
let arx2OverlayDictionaryLoaded = false;

function isArxDictionary(value: unknown): value is ArxDictionary {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.version !== "number" ||
    !Array.isArray(obj.singleByteSlots) ||
    !Array.isArray(obj.extendedSlots)
  ) {
    return false;
  }

  for (const slot of obj.singleByteSlots) {
    if (typeof slot !== "string") {
      return false;
    }
  }

  for (const slot of obj.extendedSlots) {
    if (typeof slot !== "string") {
      return false;
    }
  }

  return true;
}

function getDefaultDictionaryUrls(): string[] {
  const url = resolveDefaultDictionaryUrl();
  return url.endsWith(".json") ? [`${url}.br`, url] : [url];
}

function getDefaultArx2OverlayDictionaryUrls(): string[] {
  const url = resolveDefaultArx2OverlayDictionaryUrl();
  return url.endsWith(".json") ? [`${url}.br`, url] : [url];
}

async function fetchDictionary(url: string): Promise<ArxDictionary | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const json: unknown = await response.json();
    return isArxDictionary(json) ? json : null;
  } catch {
    return null;
  }
}

/**
 * Load the shared arx dictionary from a URL or parsed object.
 * Call this before ARX encode/decode work when the external dictionary should be used.
 * Returns the dictionary version on success, or -1 on failure (falls back to built-in).
 */
export async function loadArxDictionary(source?: string | ArxDictionary): Promise<number> {
  try {
    let dict: ArxDictionary;

    if (source && typeof source === "object") {
      dict = source;
    } else {
      const urls = typeof source === "string" ? [source] : getDefaultDictionaryUrls();
      let loaded: ArxDictionary | null = null;
      for (const url of urls) {
        loaded = await fetchDictionary(url);
        if (loaded) break;
      }
      if (!loaded) return -1;
      dict = loaded;
    }

    activeSubstitutionTable = buildSubstitutionTable(buildSubstitutions(dict));
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
  activeSubstitutionTable = buildSubstitutionTable(buildSubstitutions(dict));
  activeDictVersion = dict.version;
  dictionaryLoaded = true;
  return dict.version;
}

/**
 * Load the shared arx2 overlay dictionary from a URL or parsed object.
 * Returns the overlay dictionary version on success, or -1 on failure.
 */
export async function loadArx2OverlayDictionary(source?: string | ArxDictionary): Promise<number> {
  try {
    let dict: ArxDictionary;

    if (source && typeof source === "object") {
      dict = source;
    } else {
      const urls = typeof source === "string" ? [source] : getDefaultArx2OverlayDictionaryUrls();
      let loaded: ArxDictionary | null = null;
      for (const url of urls) {
        loaded = await fetchDictionary(url);
        if (loaded) break;
      }
      if (!loaded) return -1;
      dict = loaded;
    }

    activeOverlaySubstitutionTable = buildSubstitutionTable(buildOverlaySubstitutions(dict));
    activeArx2OverlayVersion = dict.version;
    arx2OverlayDictionaryLoaded = true;
    return dict.version;
  } catch {
    return -1;
  }
}

/**
 * Load the arx2 overlay dictionary from a pre-parsed object (synchronous).
 * Useful in tests and offline agents that already have the JSON dictionary.
 */
export function loadArx2OverlayDictionarySync(dict: ArxDictionary): number {
  activeOverlaySubstitutionTable = buildSubstitutionTable(buildOverlaySubstitutions(dict));
  activeArx2OverlayVersion = dict.version;
  arx2OverlayDictionaryLoaded = true;
  return dict.version;
}

/** Returns true if an external dictionary has been loaded. */
export function isExternalDictionaryLoaded(): boolean {
  return dictionaryLoaded;
}

/** Returns true if an external arx2 overlay dictionary has been loaded. */
export function isExternalArx2OverlayDictionaryLoaded(): boolean {
  return arx2OverlayDictionaryLoaded;
}

/** Returns the active dictionary version (0 = built-in fallback). */
export function getActiveDictVersion(): number {
  return activeDictVersion;
}

/** Returns the active arx2 overlay dictionary version. */
export function getActiveArx2OverlayVersion(): number {
  return activeArx2OverlayVersion;
}

function resolveDefaultDictionaryUrl(): string {
  return withBasePath("/arx-dictionary.json");
}

function resolveDefaultArx2OverlayDictionaryUrl(): string {
  return withBasePath("/arx2-dictionary.json");
}

// ---------------------------------------------------------------------------
// Substitution encode / decode
// ---------------------------------------------------------------------------

function dictEncode(text: string): string {
  return applySubstitutionTrie(text, activeSubstitutionTable.encodeTrie);
}

function dictDecode(text: string): string {
  return applySubstitutionTrie(text, activeSubstitutionTable.decodeTrie);
}

function overlayEncode(text: string): string {
  return applySubstitutionTrie(text, activeOverlaySubstitutionTable.encodeTrie);
}

function overlayDecode(text: string): string {
  return applySubstitutionTrie(text, activeOverlaySubstitutionTable.decodeTrie);
}

/**
 * Applies the active arx dictionary substitution.
 * This is exported for codec conformance tests that compare the trie scanner to the legacy
 * split/join substitution semantics.
 */
export function encodeArxDictionaryForTest(text: string): string {
  return dictEncode(text);
}

// ---------------------------------------------------------------------------
// ARX2 tuple envelope
// ---------------------------------------------------------------------------

function trimOptionalTuple<T extends unknown[]>(fields: T): T {
  let end = fields.length;
  while (end > 0 && fields[end - 1] === undefined) {
    end--;
  }

  const trimmed = new Array<unknown>(end);
  for (let index = 0; index < end; index += 1) {
    trimmed[index] = fields[index] === undefined ? null : fields[index];
  }
  return trimmed as T;
}

function artifactToArx2Tuple(artifact: ArtifactPayload): Arx2ArtifactTuple {
  switch (artifact.kind) {
    case "markdown":
      return trimOptionalTuple(["m", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "code":
      return trimOptionalTuple(["c", artifact.id, artifact.content, artifact.language, artifact.title, artifact.filename]);
    case "diff":
      return trimOptionalTuple([
        "d",
        artifact.id,
        artifact.patch,
        artifact.oldContent,
        artifact.newContent,
        artifact.language,
        artifact.view,
        artifact.title,
        artifact.filename,
      ]);
    case "csv":
      return trimOptionalTuple(["s", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "json":
      return trimOptionalTuple(["j", artifact.id, artifact.content, artifact.title, artifact.filename]);
  }
}

function envelopeToArx2Tuple(envelope: PayloadEnvelope): Arx2EnvelopeTuple {
  const artifacts: Arx2ArtifactTuple[] = new Array(envelope.artifacts.length);
  const activeArtifactId = envelope.activeArtifactId;
  let activeIndex = -1;

  for (let index = 0; index < envelope.artifacts.length; index += 1) {
    const artifact = envelope.artifacts[index]!;
    artifacts[index] = artifactToArx2Tuple(artifact);

    if (artifact.id === activeArtifactId) {
      activeIndex = index;
    }
  }

  if (artifacts.length === 1) {
    return trimOptionalTuple([3, artifacts[0], envelope.title]);
  }

  return trimOptionalTuple([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

function optionalStringAt(tuple: unknown[], index: number): string | undefined {
  return typeof tuple[index] === "string" ? tuple[index] : undefined;
}

function optionalViewAt(tuple: unknown[], index: number): "unified" | "split" | undefined {
  const value = tuple[index];
  if (value === undefined || value === null) return undefined;
  if (value === "unified" || value === "split") return value;
  throw new Error("Invalid arx2 diff view.");
}

function decodeArx2ArtifactTuple(value: unknown): ArtifactPayload {
  if (!Array.isArray(value) || typeof value[0] !== "string" || typeof value[1] !== "string") {
    throw new Error("Invalid arx2 artifact tuple.");
  }

  const kindCode = value[0];
  const id = value[1];

  if (kindCode === "d") {
    return {
      id,
      kind: "diff",
      patch: optionalStringAt(value, 2),
      oldContent: optionalStringAt(value, 3),
      newContent: optionalStringAt(value, 4),
      language: optionalStringAt(value, 5),
      view: optionalViewAt(value, 6),
      title: optionalStringAt(value, 7),
      filename: optionalStringAt(value, 8),
    };
  }

  if (typeof value[2] !== "string") {
    throw new Error("Invalid arx2 text artifact tuple.");
  }

  switch (kindCode) {
    case "m":
      return {
        id,
        kind: "markdown",
        content: value[2],
        title: optionalStringAt(value, 3),
        filename: optionalStringAt(value, 4),
      };
    case "c":
      return {
        id,
        kind: "code",
        content: value[2],
        language: optionalStringAt(value, 3),
        title: optionalStringAt(value, 4),
        filename: optionalStringAt(value, 5),
      };
    case "s":
      return {
        id,
        kind: "csv",
        content: value[2],
        title: optionalStringAt(value, 3),
        filename: optionalStringAt(value, 4),
      };
    case "j":
      return {
        id,
        kind: "json",
        content: value[2],
        title: optionalStringAt(value, 3),
        filename: optionalStringAt(value, 4),
      };
    default:
      throw new Error("Unsupported arx2 artifact kind.");
  }
}

function envelopeFromArxTuple(value: unknown, codec: Extract<PayloadCodec, "arx2" | "arx3">): PayloadEnvelope {
  if (!Array.isArray(value)) {
    throw new Error("Invalid arx2 envelope tuple.");
  }

  if (value[0] === 3) {
    const artifact = decodeArx2ArtifactTuple(value[1]);
    return {
      v: 1,
      codec,
      title: optionalStringAt(value, 2),
      activeArtifactId: artifact.id,
      artifacts: [artifact],
    };
  }

  if (value[0] === 2 && Array.isArray(value[1]) && value[1].length > 0) {
    const tupleArtifacts = value[1];
    const artifacts: ArtifactPayload[] = new Array(tupleArtifacts.length);

    for (let index = 0; index < tupleArtifacts.length; index += 1) {
      artifacts[index] = decodeArx2ArtifactTuple(tupleArtifacts[index]);
    }

    const activeIndex = Number.isInteger(value[3]) ? value[3] as number : 0;
    const activeArtifact = activeIndex >= 0 && activeIndex < artifacts.length ? artifacts[activeIndex] : artifacts[0];
    return {
      v: 1,
      codec,
      title: optionalStringAt(value, 2),
      activeArtifactId: activeArtifact.id,
      artifacts,
    };
  }

  throw new Error("Unsupported arx2 envelope tuple.");
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

/** Returns true if the encoded string uses baseBMP encoding (starts with U+FFF0 marker). */
export function isBaseBMPEncoded(str: string): boolean {
  return str.startsWith(BMP_MARKER);
}

// ---------------------------------------------------------------------------
// Base64url — ASCII-only, chat/URL-safe (Discord, Slack, Teams)
//
// Standard RFC 4648 base64url alphabet (A-Za-z0-9-_) with no padding.
// Wire prefix `B.` distinguishes this layer from base76 (length prefix),
// base1k, and baseBMP: base76 can also begin with `B.` for some byte lengths,
// so {@link arxDecompress} tries base64url first and falls back to base76
// when Brotli decompression fails.
// ---------------------------------------------------------------------------

const BASE64URL_WIRE_PREFIX = "B.";
const BINARY_STRING_CHUNK_SIZE = 0x8000;

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BINARY_STRING_CHUNK_SIZE)));
  }
  const binary = chunks.join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToUint8Array(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Encodes bytes as base64url (no padding), prefixed with `B.` for ARX wire disambiguation. */
export function encodeBase64url(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return BASE64URL_WIRE_PREFIX;
  }
  return BASE64URL_WIRE_PREFIX + uint8ArrayToBase64Url(bytes);
}

/** Decodes a string produced by {@link encodeBase64url} (requires the `B.` prefix). */
export function decodeBase64url(str: string): Uint8Array {
  if (!str.startsWith(BASE64URL_WIRE_PREFIX)) {
    throw new Error("Expected base64url ARX payload with B. prefix.");
  }
  const body = str.slice(BASE64URL_WIRE_PREFIX.length);
  if (body.length === 0) {
    return new Uint8Array(0);
  }
  return base64UrlToUint8Array(body);
}

/** True when the payload uses the base64url ARX wire form (`B.` + optional base64url body). */
export function isBase64urlEncoded(str: string): boolean {
  if (!str.startsWith(BASE64URL_WIRE_PREFIX)) return false;
  const rest = str.slice(BASE64URL_WIRE_PREFIX.length);
  return /^[A-Za-z0-9_-]*$/.test(rest);
}

// ---------------------------------------------------------------------------
// Brotli wrapper — lazy-loads brotli-wasm for browser compatibility
// ---------------------------------------------------------------------------

type BrotliModule = {
  compress: (buf: Uint8Array, options?: { quality?: number }) => Uint8Array;
  decompress: (buf: Uint8Array) => Uint8Array;
  DecompressStream?: new () => {
    decompress: (input: Uint8Array, outputSize: number) => {
      buf: Uint8Array;
      code: number;
      input_offset: number;
    };
    free?: () => void;
  };
  BrotliStreamResultCode?: {
    ResultSuccess: number;
    NeedsMoreInput: number;
    NeedsMoreOutput: number;
  };
};

let brotliModule: BrotliModule | null = null;

async function getBrotli(): Promise<BrotliModule> {
  if (brotliModule) return brotliModule;
  const mod = await import("brotli-wasm");
  brotliModule = (await mod.default) as unknown as BrotliModule;
  return brotliModule;
}

const BROTLI_OUTPUT_CHUNK_SIZE = 16_384;
const MAX_BROTLI_OUTPUT_BYTES = MAX_DECODED_PAYLOAD_LENGTH * 4;

export class ArxDecodedPayloadTooLargeError extends Error {
  constructor() {
    super(`The decoded payload exceeds the supported limit of ${MAX_DECODED_PAYLOAD_LENGTH.toLocaleString()} characters.`);
    this.name = "ArxDecodedPayloadTooLargeError";
  }
}

function assertDecodedTextBudget(text: string): void {
  if (text.length > MAX_DECODED_PAYLOAD_LENGTH) {
    throw new ArxDecodedPayloadTooLargeError();
  }
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function brotliDecompressWithLimit(brotli: BrotliModule, bytes: Uint8Array): Uint8Array {
  if (!brotli.DecompressStream || !brotli.BrotliStreamResultCode) {
    const out = brotli.decompress(bytes);
    if (out.length > MAX_BROTLI_OUTPUT_BYTES) {
      throw new ArxDecodedPayloadTooLargeError();
    }
    return out;
  }

  const stream = new brotli.DecompressStream();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let inputOffset = 0;

  try {
    while (true) {
      const remainingBudget = MAX_BROTLI_OUTPUT_BYTES - totalLength;
      const outputSize = Math.min(BROTLI_OUTPUT_CHUNK_SIZE, remainingBudget + 1);
      const input = inputOffset < bytes.length ? bytes.slice(inputOffset) : new Uint8Array(0);
      const result = stream.decompress(input, outputSize);

      inputOffset += result.input_offset;
      if (result.buf.length > 0) {
        totalLength += result.buf.length;
        if (totalLength > MAX_BROTLI_OUTPUT_BYTES) {
          throw new ArxDecodedPayloadTooLargeError();
        }
        chunks.push(result.buf);
      }

      if (result.code === brotli.BrotliStreamResultCode.ResultSuccess) {
        return concatChunks(chunks, totalLength);
      }

      if (result.code === brotli.BrotliStreamResultCode.NeedsMoreInput && inputOffset >= bytes.length) {
        throw new Error("Brotli decompression ended before the stream completed.");
      }
    }
  } finally {
    stream.free?.();
  }
}

async function compressSubstitutedText(text: string): Promise<Uint8Array> {
  const brotli = await getBrotli();
  return brotli.compress(new TextEncoder().encode(text), { quality: 11 });
}

async function compressArxJson(json: string): Promise<Uint8Array> {
  return compressSubstitutedText(dictEncode(json));
}

function encodeWirePayloads(compressed: Uint8Array): ArxWirePayloads {
  return {
    base76: encodeBase76(compressed),
    base1k: encodeBase1k(compressed),
    baseBMP: encodeBaseBMP(compressed),
    base64url: encodeBase64url(compressed),
  };
}

async function decompressWirePayload(encoded: string): Promise<string> {
  const brotli = await getBrotli();

  const decompressFromBytes = (bytes: Uint8Array): string => {
    const out = brotliDecompressWithLimit(brotli, bytes);
    return new TextDecoder().decode(out);
  };

  if (isBaseBMPEncoded(encoded)) {
    return decompressFromBytes(decodeBaseBMP(encoded));
  }

  if (isBase64urlEncoded(encoded)) {
    try {
      return decompressFromBytes(decodeBase64url(encoded));
    } catch (error) {
      if (error instanceof ArxDecodedPayloadTooLargeError) {
        throw error;
      }
      // base76 length prefix can also be `B.` (e.g. 140-byte payloads); retry as base76.
    }
  }

  if (isBase1kEncoded(encoded)) {
    return decompressFromBytes(decodeBase1k(encoded));
  }

  return decompressFromBytes(decodeBase76(encoded));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Public API for `arxCompress`. */
export async function arxCompress(json: string): Promise<string> {
  const compressed = await compressArxJson(json);
  return encodeBase76(compressed);
}

/**
 * Compresses an ARX JSON payload once and returns every supported wire encoding.
 * Used by fragment candidate generation so trying base76/base1k/baseBMP/base64url
 * does not repeat the dictionary substitution and Brotli compression stages.
 */
export async function arxCompressPayloads(json: string): Promise<ArxWirePayloads> {
  const compressed = await compressArxJson(json);
  return encodeWirePayloads(compressed);
}

/**
 * Compress with the arx pipeline using base1k Unicode encoding.
 * Produces ~42% fewer characters than `arxCompress` at the cost of
 * non-ASCII fragment content.
 */
export async function arxCompressUnicode(json: string): Promise<string> {
  const compressed = await compressArxJson(json);
  return encodeBase1k(compressed);
}

/**
 * Compress with the arx pipeline using baseBMP high-density encoding.
 * Produces ~32% fewer characters than base1k (~55% fewer than base76)
 * by using ~62k safe BMP code points (~15.92 bits/char).
 */
export async function arxCompressBMP(json: string): Promise<string> {
  const compressed = await compressArxJson(json);
  return encodeBaseBMP(compressed);
}

/**
 * Compress with the arx pipeline using base64url for the binary-to-text step.
 * ASCII-only and safe on surfaces that percent-encode non-ASCII (unlike base1k/baseBMP).
 */
export async function arxCompressBase64url(json: string): Promise<string> {
  const compressed = await compressArxJson(json);
  return encodeBase64url(compressed);
}

/**
 * Compresses a payload envelope with the arx2 tuple-envelope pipeline.
 * Returns all supported binary-to-text wire shapes so callers can choose by transport size.
 */
async function compressTupleEnvelope(envelope: PayloadEnvelope): Promise<ArxWirePayloads> {
  const tupleJson = JSON.stringify(envelopeToArx2Tuple(envelope));
  const substituted = dictEncode(overlayEncode(tupleJson));
  const compressed = await compressSubstitutedText(substituted);
  return encodeWirePayloads(compressed);
}

/**
 * Compresses a payload envelope with the arx2 tuple-envelope pipeline.
 * Returns all supported binary-to-text wire shapes so callers can choose by transport size.
 */
export async function arx2CompressEnvelope(envelope: PayloadEnvelope): Promise<ArxWirePayloads> {
  return compressTupleEnvelope(envelope);
}

/**
 * Compresses a payload envelope with the arx3 compact tuple pipeline.
 * ARX3 intentionally reuses the proven ARX2 tuple/overlay/Brotli bytes; the protocol
 * distinction is that fragment selection may prefer the dense visible baseBMP wire.
 */
export async function arx3CompressEnvelope(envelope: PayloadEnvelope): Promise<ArxWirePayloads> {
  return compressTupleEnvelope(envelope);
}

/** Public API for `arxDecompress`. */
export async function arxDecompress(encoded: string): Promise<string> {
  const decoded = dictDecode(await decompressWirePayload(encoded));
  assertDecodedTextBudget(decoded);
  return decoded;
}

/**
 * Decompresses an arx2 tuple-envelope payload and rebuilds the standard envelope shape.
 */
export async function arx2DecompressEnvelope(encoded: string): Promise<PayloadEnvelope> {
  const v1Decoded = dictDecode(await decompressWirePayload(encoded));
  assertDecodedTextBudget(v1Decoded);
  const tupleJson = overlayDecode(v1Decoded);
  assertDecodedTextBudget(tupleJson);
  return envelopeFromArxTuple(JSON.parse(tupleJson), "arx2");
}

/**
 * Decompresses an arx3 tuple-envelope payload and rebuilds the standard envelope shape.
 */
export async function arx3DecompressEnvelope(encoded: string): Promise<PayloadEnvelope> {
  const v1Decoded = dictDecode(await decompressWirePayload(encoded));
  assertDecodedTextBudget(v1Decoded);
  const tupleJson = overlayDecode(v1Decoded);
  assertDecodedTextBudget(tupleJson);
  return envelopeFromArxTuple(JSON.parse(tupleJson), "arx3");
}
