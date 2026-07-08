/**
 * ARX4 experimental content-first / CBOR envelope helpers.
 *
 * Not a shipped codec. These packers exist so ideation benches and unit tests can
 * measure binary envelopes against today's ARX3 JSON-tuple path without changing
 * the fragment protocol surface (`plain|lz|deflate|arx|arx2|arx3`).
 *
 * Content-first (single text artifact):
 *   magic "A4" | version(1) | kind(1) | idLen(1) | id | contentLen(varint) | content
 *   | metaLen(varint) | metaJson(utf8)
 *
 * CBOR-ish: minimal CBOR major types 0/2/3/4/7 for the existing ARX2/3 tuple shape
 * (non-negative ints, byte/text strings, arrays, null).
 */

import type {
  Arx2ArtifactTuple,
  Arx2EnvelopeTuple,
  ArtifactPayload,
  CodeArtifact,
  CsvArtifact,
  JsonArtifact,
  MarkdownArtifact,
  PayloadEnvelope,
} from "@/lib/payload/schema";

/** Magic bytes identifying an ARX4 content-first binary envelope. */
export const ARX4_CONTENT_FIRST_MAGIC = "A4";

/** Current content-first binary format version. */
export const ARX4_CONTENT_FIRST_VERSION = 1;

const KIND_TO_CODE = {
  markdown: 1,
  code: 2,
  csv: 3,
  json: 4,
} as const;

const CODE_TO_KIND = {
  1: "markdown",
  2: "code",
  3: "csv",
  4: "json",
} as const;

type ContentFirstKind = keyof typeof KIND_TO_CODE;
type ContentFirstArtifact = MarkdownArtifact | CodeArtifact | CsvArtifact | JsonArtifact;

type ContentFirstMeta = {
  t?: string;
  f?: string;
  l?: string;
  e?: string;
};

function isContentFirstArtifact(artifact: ArtifactPayload): artifact is ContentFirstArtifact {
  return artifact.kind === "markdown" || artifact.kind === "code" || artifact.kind === "csv" || artifact.kind === "json";
}

function writeVarint(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) {
    throw new Error("ARX4 content-first varint out of range.");
  }
  const bytes: number[] = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Uint8Array.from(bytes);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor]!;
    cursor += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: value >>> 0, next: cursor };
    }
    shift += 7;
    if (shift > 28) {
      throw new Error("ARX4 content-first varint too long.");
    }
  }
  throw new Error("ARX4 content-first truncated varint.");
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

function textDecoder(): TextDecoder {
  return new TextDecoder("utf-8", { fatal: true });
}

function trimOptionalTuple<T extends unknown[]>(fields: T): T {
  let end = fields.length;
  while (end > 0) {
    const value = fields[end - 1];
    if (value !== undefined && value !== null) break;
    end -= 1;
  }
  if (end === fields.length) return fields;
  return fields.slice(0, end) as T;
}

/**
 * Returns true when the envelope is a single markdown/code/csv/json artifact
 * (the Discord share sweet spot for content-first packing).
 */
export function canEncodeArx4ContentFirst(envelope: PayloadEnvelope): boolean {
  if (!Array.isArray(envelope.artifacts) || envelope.artifacts.length !== 1) return false;
  const artifact = envelope.artifacts[0];
  return artifact !== undefined && isContentFirstArtifact(artifact);
}

/**
 * Encodes a single text artifact as a content-first binary envelope.
 * Throws when the envelope is not a supported single-artifact shape.
 */
export function encodeArx4ContentFirst(envelope: PayloadEnvelope): Uint8Array {
  if (!canEncodeArx4ContentFirst(envelope)) {
    throw new Error("ARX4 content-first requires a single markdown/code/csv/json artifact.");
  }

  const artifact = envelope.artifacts[0] as ContentFirstArtifact;
  const kindCode = KIND_TO_CODE[artifact.kind as ContentFirstKind];
  const encoder = textEncoder();
  const idBytes = encoder.encode(artifact.id);
  if (idBytes.length > 255) {
    throw new Error("ARX4 content-first id exceeds 255 bytes.");
  }

  const contentBytes = encoder.encode(artifact.content);
  const meta: ContentFirstMeta = {};
  if (artifact.title) meta.t = artifact.title;
  if (artifact.filename) meta.f = artifact.filename;
  if (artifact.kind === "code" && artifact.language) meta.l = artifact.language;
  if (envelope.title && envelope.title !== artifact.title) meta.e = envelope.title;
  const metaBytes = encoder.encode(Object.keys(meta).length > 0 ? JSON.stringify(meta) : "");

  return concatBytes([
    encoder.encode(ARX4_CONTENT_FIRST_MAGIC),
    Uint8Array.of(ARX4_CONTENT_FIRST_VERSION, kindCode, idBytes.length),
    idBytes,
    writeVarint(contentBytes.length),
    contentBytes,
    writeVarint(metaBytes.length),
    metaBytes,
  ]);
}

/**
 * Decodes a content-first binary envelope back into a standard payload envelope.
 * The rebuilt envelope stamps `codec: "plain"` because ARX4 is not a shipped codec.
 */
export function decodeArx4ContentFirst(bytes: Uint8Array): PayloadEnvelope {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("ARX4 content-first decode expects Uint8Array.");
  }
  if (bytes.length < 5) {
    throw new Error("ARX4 content-first payload too short.");
  }

  const decoder = textDecoder();
  const magic = decoder.decode(bytes.subarray(0, 2));
  if (magic !== ARX4_CONTENT_FIRST_MAGIC) {
    throw new Error("ARX4 content-first magic mismatch.");
  }

  const version = bytes[2]!;
  if (version !== ARX4_CONTENT_FIRST_VERSION) {
    throw new Error(`Unsupported ARX4 content-first version: ${version}.`);
  }

  const kindCode = bytes[3]! as keyof typeof CODE_TO_KIND;
  const kind = CODE_TO_KIND[kindCode];
  if (!kind) {
    throw new Error(`Unknown ARX4 content-first kind code: ${kindCode}.`);
  }

  const idLen = bytes[4]!;
  let cursor = 5;
  if (cursor + idLen > bytes.length) {
    throw new Error("ARX4 content-first truncated id.");
  }
  const id = decoder.decode(bytes.subarray(cursor, cursor + idLen));
  cursor += idLen;

  const contentLen = readVarint(bytes, cursor);
  cursor = contentLen.next;
  if (cursor + contentLen.value > bytes.length) {
    throw new Error("ARX4 content-first truncated content.");
  }
  const content = decoder.decode(bytes.subarray(cursor, cursor + contentLen.value));
  cursor += contentLen.value;

  const metaLen = readVarint(bytes, cursor);
  cursor = metaLen.next;
  if (cursor + metaLen.value > bytes.length) {
    throw new Error("ARX4 content-first truncated meta.");
  }
  if (cursor + metaLen.value !== bytes.length) {
    throw new Error("ARX4 content-first trailing bytes.");
  }

  let meta: ContentFirstMeta = {};
  if (metaLen.value > 0) {
    const parsed: unknown = JSON.parse(decoder.decode(bytes.subarray(cursor, cursor + metaLen.value)));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("ARX4 content-first meta must be a JSON object.");
    }
    meta = parsed as ContentFirstMeta;
  }

  const base = {
    id,
    title: typeof meta.t === "string" ? meta.t : undefined,
    filename: typeof meta.f === "string" ? meta.f : undefined,
  };

  let artifact: ContentFirstArtifact;
  switch (kind) {
    case "markdown":
      artifact = { ...base, kind: "markdown", content };
      break;
    case "code":
      artifact = {
        ...base,
        kind: "code",
        content,
        language: typeof meta.l === "string" ? meta.l : undefined,
      };
      break;
    case "csv":
      artifact = { ...base, kind: "csv", content };
      break;
    case "json":
      artifact = { ...base, kind: "json", content };
      break;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled ARX4 content-first kind: ${_exhaustive}`);
    }
  }

  return {
    v: 1,
    codec: "plain",
    title: typeof meta.e === "string" ? meta.e : artifact.title,
    activeArtifactId: artifact.id,
    artifacts: [artifact],
  };
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
    default: {
      const _exhaustive: never = artifact;
      throw new Error(`Unhandled artifact kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Builds the ARX2/ARX3 tuple shape used by the CBOR-ish encoder (mirrors product tuple packing).
 */
export function envelopeToArx4Tuple(envelope: PayloadEnvelope): Arx2EnvelopeTuple {
  if (!Array.isArray(envelope.artifacts) || envelope.artifacts.length < 1) {
    throw new Error("ARX4 tuple encode requires at least one artifact.");
  }

  const artifacts: Arx2ArtifactTuple[] = new Array(envelope.artifacts.length);
  let activeIndex = -1;

  for (let index = 0; index < envelope.artifacts.length; index += 1) {
    const artifact = envelope.artifacts[index]!;
    artifacts[index] = artifactToArx2Tuple(artifact);
    if (artifact.id === envelope.activeArtifactId) {
      activeIndex = index;
    }
  }

  if (artifacts.length === 1) {
    return trimOptionalTuple([3, artifacts[0]!, envelope.title]);
  }

  return trimOptionalTuple([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

type CborishValue = null | number | string | CborishValue[];

function pushUintHeader(chunks: number[], major: number, n: number): void {
  if (n < 24) {
    chunks.push((major << 5) | n);
  } else if (n < 256) {
    chunks.push((major << 5) | 24, n);
  } else if (n < 65536) {
    chunks.push((major << 5) | 25, (n >> 8) & 0xff, n & 0xff);
  } else {
    chunks.push(
      (major << 5) | 26,
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    );
  }
}

function encodeCborishValue(value: CborishValue, chunks: number[], encoder: TextEncoder): void {
  if (value === null) {
    chunks.push(0xf6);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("ARX4 CBOR-ish only supports non-negative integers.");
    }
    pushUintHeader(chunks, 0, value);
    return;
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    pushUintHeader(chunks, 3, bytes.length);
    for (const byte of bytes) chunks.push(byte);
    return;
  }
  if (Array.isArray(value)) {
    pushUintHeader(chunks, 4, value.length);
    for (const item of value) encodeCborishValue(item as CborishValue, chunks, encoder);
    return;
  }
  throw new Error(`Unsupported ARX4 CBOR-ish value: ${typeof value}`);
}

/**
 * Encodes an ARX2/ARX3-compatible tuple as minimal CBOR (ints/strings/arrays/null).
 */
export function encodeArx4CborishTuple(tuple: Arx2EnvelopeTuple): Uint8Array {
  const chunks: number[] = [];
  encodeCborishValue(tuple as CborishValue, chunks, textEncoder());
  return Uint8Array.from(chunks);
}

/**
 * Encodes a payload envelope as CBOR-ish bytes of its ARX2/ARX3 tuple.
 */
export function encodeArx4CborishEnvelope(envelope: PayloadEnvelope): Uint8Array {
  return encodeArx4CborishTuple(envelopeToArx4Tuple(envelope));
}

function readCborHeader(bytes: Uint8Array, offset: number): { major: number; value: number; next: number } {
  if (offset >= bytes.length) {
    throw new Error("ARX4 CBOR-ish truncated header.");
  }
  const initial = bytes[offset]!;
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let next = offset + 1;
  let value = additional;
  if (additional === 24) {
    if (next >= bytes.length) throw new Error("ARX4 CBOR-ish truncated uint8.");
    value = bytes[next]!;
    next += 1;
  } else if (additional === 25) {
    if (next + 1 >= bytes.length) throw new Error("ARX4 CBOR-ish truncated uint16.");
    value = (bytes[next]! << 8) | bytes[next + 1]!;
    next += 2;
  } else if (additional === 26) {
    if (next + 3 >= bytes.length) throw new Error("ARX4 CBOR-ish truncated uint32.");
    value =
      ((bytes[next]! << 24) | (bytes[next + 1]! << 16) | (bytes[next + 2]! << 8) | bytes[next + 3]!) >>> 0;
    next += 4;
  } else if (additional >= 28) {
    throw new Error(`Unsupported ARX4 CBOR-ish additional info: ${additional}.`);
  }
  return { major, value, next };
}

function decodeCborishValue(bytes: Uint8Array, offset: number): { value: CborishValue; next: number } {
  const header = readCborHeader(bytes, offset);
  if (header.major === 7 && header.value === 22) {
    return { value: null, next: header.next };
  }
  if (header.major === 0) {
    return { value: header.value, next: header.next };
  }
  if (header.major === 3) {
    const end = header.next + header.value;
    if (end > bytes.length) throw new Error("ARX4 CBOR-ish truncated string.");
    return { value: textDecoder().decode(bytes.subarray(header.next, end)), next: end };
  }
  if (header.major === 4) {
    const items: CborishValue[] = [];
    let cursor = header.next;
    for (let i = 0; i < header.value; i += 1) {
      const decoded = decodeCborishValue(bytes, cursor);
      items.push(decoded.value);
      cursor = decoded.next;
    }
    return { value: items, next: cursor };
  }
  throw new Error(`Unsupported ARX4 CBOR-ish major type: ${header.major}.`);
}

/**
 * Decodes CBOR-ish bytes produced by {@link encodeArx4CborishTuple}.
 */
export function decodeArx4CborishTuple(bytes: Uint8Array): Arx2EnvelopeTuple {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("ARX4 CBOR-ish decode expects Uint8Array.");
  }
  const decoded = decodeCborishValue(bytes, 0);
  if (decoded.next !== bytes.length) {
    throw new Error("ARX4 CBOR-ish trailing bytes.");
  }
  if (!Array.isArray(decoded.value)) {
    throw new Error("ARX4 CBOR-ish root must be an array.");
  }
  return decoded.value as Arx2EnvelopeTuple;
}
