/** Lossless JavaScript string bytes and accidental-corruption checks shared by ARX6 v2. */

const LONE_SURROGATE_PATTERN = /[\uD800-\uDFFF]/u;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

/** UTF-8 for scalar values, with three-byte WTF-8 sequences preserving unpaired UTF-16 surrogates. */
export function encodeArx6String(text: string): Uint8Array {
  if (!LONE_SURROGATE_PATTERN.test(text)) return new TextEncoder().encode(text);

  const bytes = new Uint8Array(text.length * 3);
  let offset = 0;
  for (let index = 0; index < text.length; index++) {
    const point = text.codePointAt(index)!;
    if (point > 0xffff) index++;
    if (point < 0x80) {
      bytes[offset++] = point;
    } else if (point < 0x800) {
      bytes[offset++] = 0xc0 | (point >>> 6);
      bytes[offset++] = 0x80 | (point & 0x3f);
    } else if (point < 0x10000) {
      bytes[offset++] = 0xe0 | (point >>> 12);
      bytes[offset++] = 0x80 | ((point >>> 6) & 0x3f);
      bytes[offset++] = 0x80 | (point & 0x3f);
    } else {
      bytes[offset++] = 0xf0 | (point >>> 18);
      bytes[offset++] = 0x80 | ((point >>> 12) & 0x3f);
      bytes[offset++] = 0x80 | ((point >>> 6) & 0x3f);
      bytes[offset++] = 0x80 | (point & 0x3f);
    }
  }
  return bytes.slice(0, offset);
}

/** Decode canonical WTF-8, rejecting malformed, overlong, out-of-range and split-pair sequences. */
export function decodeArx6String(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let units: number[] = [];
  let previousPoint = -1;
  for (let offset = 0; offset < bytes.length; ) {
    const lead = bytes[offset++];
    let remaining: number;
    let point: number;
    let minimum: number;
    if (lead < 0x80) {
      remaining = 0;
      point = lead;
      minimum = 0;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      remaining = 1;
      point = lead & 0x1f;
      minimum = 0x80;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      remaining = 2;
      point = lead & 0x0f;
      minimum = 0x800;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      remaining = 3;
      point = lead & 7;
      minimum = 0x10000;
    } else {
      throw new Error("Invalid arx6 WTF-8 leading byte.");
    }
    for (let index = 0; index < remaining; index++) {
      if (offset >= bytes.length || (bytes[offset] & 0xc0) !== 0x80) {
        throw new Error("Invalid or truncated arx6 WTF-8 continuation.");
      }
      point = point * 64 + (bytes[offset++] & 0x3f);
    }
    if (point < minimum || point > 0x10ffff || (
      previousPoint >= 0xd800 && previousPoint <= 0xdbff && point >= 0xdc00 && point <= 0xdfff
    )) {
      throw new Error("Noncanonical arx6 WTF-8 sequence.");
    }
    previousPoint = point;
    if (point > 0xffff) {
      point -= 0x10000;
      units.push(0xd800 + (point >>> 10), 0xdc00 + (point & 0x3ff));
    } else {
      units.push(point);
    }
    if (units.length >= 4096) {
      chunks.push(String.fromCharCode(...units));
      units = [];
    }
  }
  chunks.push(String.fromCharCode(...units));
  return chunks.join("");
}

/** CRC32(header || bytes), binding the ASCII format header; detects accidents, not malicious forgery. */
export function arx6Checksum(header: string, bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < header.length; index++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ header.charCodeAt(index)) & 0xff];
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
