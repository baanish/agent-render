/**
 * arx6 codec: the context mixer coding a raw container instead of substituted tuple JSON.
 *
 * Pipeline: envelope → arx2 tuple with every artifact body swapped for its length → raw container →
 * context-mixing arithmetic coder → fraction wire. The raw container is the bodies verbatim, a newline,
 * then the tuple's JSON line, so the mixer sees real newlines and unescaped quotes, the shape its priors
 * are written in, and no overlay or dictionary substitution runs at all. The one rewrite is on diff patches,
 * which drop the paths and hunk counts they state twice (see {@link elideDiffPatch}).
 *
 * Fragment shape: `g<priorId><digits>`, digits over [0-9A-Za-z-._~] with an alphanumeric last digit.
 * Prior ids and curated corpora are arx4's (arx4-codec.ts), composed differently (see ARX6_PRIOR_LAYOUT);
 * the model is arx6-model.ts, which this file reaches only through `Arx6ContextModel`'s two byte-level
 * methods.
 */

import {
  assertArxWireByteLength,
  envelopeFromParsedArxTuple,
  envelopeToArx2Tuple,
  getArxDictionaryPriorText,
} from "@/lib/payload/arx-codec";
import {
  arx4PriorIdForEnvelope,
  curatedArx4PriorBlocks,
  encodablePriorId,
  isArx4PriorId,
  priorBytesFor,
  type Arx4PriorId,
  type Arx4PriorKind,
} from "@/lib/payload/arx4-codec";
import { Arx6ContextModel } from "@/lib/payload/arx6-model";
import { MAX_DECODED_PAYLOAD_LENGTH, type PayloadEnvelope } from "@/lib/payload/schema";

// ---------------------------------------------------------------------------
// Diff patch elision
// ---------------------------------------------------------------------------

/**
 * Kind code for a diff whose patch the container holds elided by {@link elideDiffPatch}. It costs nothing
 * over "d" in the tuple line, and decode restores the patch and the "d" code. A diff whose patch does not
 * survive the round trip keeps "d" and its patch verbatim.
 */
const ELIDED_DIFF_KIND_CODE = "D";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const ELIDED_HUNK_HEADER = /^@@ -(\d+) @@(.*)$/;
const GIT_SAME_PATH_HEADER = /^diff --git a\/(.+) b\/\1$/;

function isHunkBodyLine(line: string): boolean {
  return line.length > 0 && " +-\\".includes(line[0]);
}

/** Old and new line counts of the hunk body run starting at `start`, and the index where it ends. */
function countHunkRun(lines: readonly string[], start: number): { oldCount: number; newCount: number; end: number } {
  let oldCount = 0;
  let newCount = 0;
  let index = start;
  for (; index < lines.length && isHunkBodyLine(lines[index]); index++) {
    const marker = lines[index][0];
    if (marker === " ") {
      oldCount++;
      newCount++;
    } else if (marker === "-") {
      oldCount++;
    } else if (marker === "+") {
      newCount++;
    }
  }
  return { oldCount, newCount, end: index };
}

/** Where a hunk body holding the declared counts ends, or -1 when the lines run out or break first. */
function countedHunkEnd(lines: readonly string[], start: number, oldCount: number, newCount: number): number {
  let index = start;
  let oldSeen = 0;
  let newSeen = 0;
  while (oldSeen < oldCount || newSeen < newCount || (index < lines.length && lines[index].startsWith("\\"))) {
    if (index >= lines.length) return -1;
    const marker = lines[index][0];
    if (marker === " ") {
      oldSeen++;
      newSeen++;
    } else if (marker === "-") {
      oldSeen++;
    } else if (marker === "+") {
      newSeen++;
    } else if (marker !== "\\") {
      return -1;
    }
    index++;
  }
  return index;
}

function hunkRangeText(start: number, count: number): string {
  return count === 1 ? `${start}` : `${start},${count}`;
}

/** The new start git writes for a hunk, given the old start and the line delta of the file's earlier hunks. */
function predictedNewStart(oldStart: number, oldCount: number, newCount: number, delta: number): number {
  return oldStart + delta + (oldCount === 0 ? 1 : 0) - (newCount === 0 ? 1 : 0);
}

/**
 * Elides what a unified git patch states twice: the path of "diff --git a/P b/P", repeated in the
 * "--- a/P" and "+++ b/P" lines that follow it, and a hunk header's counts and new start whenever the hunk
 * body and the file's running line delta imply them ("@@ -a,b +c,d @@" becomes "@@ -a @@"). Null when
 * nothing elides. Exported with {@link restoreDiffPatch} so the pair can be tested without the coder.
 */
export function elideDiffPatch(patch: string): string | null {
  const lines = patch.split("\n");
  const out: string[] = [];
  let path: string | null = null;
  let inFileHeader = false;
  let delta = 0;
  let changed = false;
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      const oldStart = Number(hunk[1]);
      const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const newStart = Number(hunk[3]);
      const newCount = hunk[4] === undefined ? 1 : Number(hunk[4]);
      const end = countedHunkEnd(lines, index + 1, oldCount, newCount);
      if (end < 0) return null;
      const run = countHunkRun(lines, index + 1);
      const canonical =
        line === `@@ -${hunkRangeText(oldStart, oldCount)} +${hunkRangeText(newStart, newCount)} @@${hunk[5]}`;
      if (
        canonical &&
        run.end === end &&
        run.oldCount === oldCount &&
        run.newCount === newCount &&
        newStart === predictedNewStart(oldStart, oldCount, newCount, delta)
      ) {
        out.push(`@@ -${oldStart} @@${hunk[5]}`);
        changed = true;
      } else {
        out.push(line);
      }
      for (let bodyIndex = index + 1; bodyIndex < end; bodyIndex++) out.push(lines[bodyIndex]);
      delta += newCount - oldCount;
      inFileHeader = false;
      index = end;
      continue;
    }

    delta = 0;
    if (line.startsWith("diff --git ")) {
      const samePath = GIT_SAME_PATH_HEADER.exec(line);
      inFileHeader = true;
      path = samePath ? samePath[1] : null;
      if (path !== null && !path.startsWith("a/")) {
        out.push(`diff --git ${path}`);
        changed = true;
      } else {
        out.push(line);
      }
    } else if (inFileHeader && path !== null && line === `--- a/${path}`) {
      out.push("---");
      changed = true;
    } else if (inFileHeader && path !== null && line === `+++ b/${path}`) {
      out.push("+++");
      changed = true;
    } else {
      out.push(line);
    }
    index++;
  }
  return changed ? out.join("\n") : null;
}

/**
 * Inverse of {@link elideDiffPatch}. Every char it writes is charged to `spendChars` first, so a crafted
 * patch of many short elided lines cannot expand past the decoded payload budget. Throws on a hunk whose
 * declared counts run past the patch.
 */
export function restoreDiffPatch(elided: string, spendChars: (count: number) => void): string {
  const lines = elided.split("\n");
  const out: string[] = [];
  const push = (line: string) => {
    spendChars(line.length + (out.length > 0 ? 1 : 0));
    out.push(line);
  };
  let path: string | null = null;
  let inFileHeader = false;
  let delta = 0;
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const full = HUNK_HEADER.exec(line);
    const short = full ? null : ELIDED_HUNK_HEADER.exec(line);
    if (full || short) {
      let oldCount: number;
      let newCount: number;
      let end: number;
      if (full) {
        oldCount = full[2] === undefined ? 1 : Number(full[2]);
        newCount = full[4] === undefined ? 1 : Number(full[4]);
        end = countedHunkEnd(lines, index + 1, oldCount, newCount);
        if (end < 0) throw new Error("An arx6 diff hunk runs past the end of its patch.");
        push(line);
      } else {
        const oldStart = Number(short![1]);
        const run = countHunkRun(lines, index + 1);
        oldCount = run.oldCount;
        newCount = run.newCount;
        end = run.end;
        const newStart = predictedNewStart(oldStart, oldCount, newCount, delta);
        push(`@@ -${hunkRangeText(oldStart, oldCount)} +${hunkRangeText(newStart, newCount)} @@${short![2]}`);
      }
      for (let bodyIndex = index + 1; bodyIndex < end; bodyIndex++) push(lines[bodyIndex]);
      delta += newCount - oldCount;
      inFileHeader = false;
      index = end;
      continue;
    }

    delta = 0;
    if (line.startsWith("diff --git ")) {
      const rest = line.slice("diff --git ".length);
      inFileHeader = true;
      if (rest.startsWith("a/")) {
        const samePath = GIT_SAME_PATH_HEADER.exec(line);
        path = samePath ? samePath[1] : null;
        push(line);
      } else {
        path = rest;
        push(`diff --git a/${rest} b/${rest}`);
      }
    } else if (inFileHeader && path !== null && line === "---") {
      push(`--- a/${path}`);
    } else if (inFileHeader && path !== null && line === "+++") {
      push(`+++ b/${path}`);
    } else {
      push(line);
    }
    index++;
  }
  return out.join("\n");
}

/** A running charge against the decoded payload budget that throws once the total passes it. */
function createDecodedLengthMeter(): (count: number) => void {
  let spent = 0;
  return (count) => {
    spent += count;
    if (spent > MAX_DECODED_PAYLOAD_LENGTH) {
      throw new Error("A restored arx6 diff patch exceeds the decoded payload budget.");
    }
  };
}

/** The elided patch, only when restoring it gives back `patch` exactly; null keeps the patch verbatim. */
function guardedElideDiffPatch(patch: string): string | null {
  const elided = elideDiffPatch(patch);
  if (elided === null) return null;
  try {
    return restoreDiffPatch(elided, createDecodedLengthMeter()) === patch ? elided : null;
  } catch {
    return null;
  }
}

/**
 * Restores an elided patch read from a container, and rejects one the encoder could not have written:
 * the encoder only emits `elided` when restoring it gives back the patch, so eliding the restored patch
 * must reproduce `elided` exactly.
 */
function restoreContainerDiffPatch(elided: string, spendChars: (count: number) => void): string {
  const patch = restoreDiffPatch(elided, spendChars);
  if (elideDiffPatch(patch) !== elided) {
    throw new Error("The arx6 container holds an elided diff patch the encoder cannot emit.");
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Raw container
// ---------------------------------------------------------------------------

/** Tuple slots that hold artifact bodies, by arx2 kind code: diffs carry patch, old and new. */
const BODY_INDEXES_BY_KIND_CODE = new Map<unknown, readonly number[]>([
  ["m", [2]],
  ["c", [2]],
  ["s", [2]],
  ["j", [2]],
  ["d", [2, 3, 4]],
  [ELIDED_DIFF_KIND_CODE, [2, 3, 4]],
]);

/** The last body runs up to the tuple's newline, so it declares this instead of a length. */
const IMPLIED_BODY_LENGTH = -1;

/** In `u` mode a surrogate range matches only unpaired halves, which TextEncoder turns into U+FFFD. */
const LONE_SURROGATE_PATTERN = /[\uD800-\uDFFF]/u;

/**
 * The bodies in tuple order, a newline, then the tuple with each body replaced by its UTF-16 length.
 * JSON escapes every newline inside the tuple, so the last newline always starts it. The tuple goes
 * last because a truncated link garbles the end of the container: there it breaks the tuple, which
 * decode rejects, where a last body would just come back short. Null when a body holds a lone
 * surrogate, which no UTF-8 container can carry.
 */
function envelopeToRawContainer(envelope: PayloadEnvelope): string | null {
  const tuple = envelopeToArx2Tuple(envelope);
  const artifacts: unknown[][] = tuple[0] === 3 ? [tuple[1]] : tuple[1];
  const bodies: string[] = [];
  let lastBodySlot: { artifact: unknown[]; index: number } | null = null;

  for (const artifact of artifacts) {
    const elidedPatch = artifact[0] === "d" && typeof artifact[2] === "string" ? guardedElideDiffPatch(artifact[2]) : null;
    if (elidedPatch !== null) {
      artifact[0] = ELIDED_DIFF_KIND_CODE;
      artifact[2] = elidedPatch;
    }
    for (const index of BODY_INDEXES_BY_KIND_CODE.get(artifact[0]) ?? []) {
      const body = artifact[index];
      if (typeof body !== "string") continue;
      bodies.push(body);
      artifact[index] = body.length;
      lastBodySlot = { artifact, index };
    }
  }
  if (lastBodySlot) lastBodySlot.artifact[lastBodySlot.index] = IMPLIED_BODY_LENGTH;

  const container = `${bodies.join("")}\n${JSON.stringify(tuple)}`;
  return LONE_SURROGATE_PATTERN.test(container) ? null : container;
}

/** Inverse of {@link envelopeToRawContainer}. Throws on any tuple or length the encoder cannot emit. */
function rawContainerToEnvelope(container: string): PayloadEnvelope {
  const bodiesEnd = container.lastIndexOf("\n");
  if (bodiesEnd < 0) throw new Error("The arx6 container has no tuple line.");

  const tuple: unknown = JSON.parse(container.slice(bodiesEnd + 1));
  const artifacts: unknown = Array.isArray(tuple) ? (tuple[0] === 3 ? [tuple[1]] : tuple[1]) : null;
  if (!Array.isArray(artifacts)) throw new Error("Invalid arx6 tuple.");

  const bodySlots: { artifact: unknown[]; index: number }[] = [];
  for (const artifact of artifacts as unknown[]) {
    if (!Array.isArray(artifact)) throw new Error("Invalid arx6 artifact tuple.");
    const indexes = BODY_INDEXES_BY_KIND_CODE.get(artifact[0]);
    if (indexes === undefined) throw new Error("Unsupported arx6 artifact kind.");
    for (const index of indexes) {
      if (artifact[index] !== undefined && artifact[index] !== null) bodySlots.push({ artifact, index });
    }
  }

  let offset = 0;
  bodySlots.forEach(({ artifact, index }, slotIndex) => {
    const declared = artifact[index];
    const isLast = slotIndex === bodySlots.length - 1;
    if (isLast !== (declared === IMPLIED_BODY_LENGTH)) {
      throw new Error("Only the last arx6 body may leave its length implied, and it must.");
    }

    const length = isLast ? bodiesEnd - offset : declared;
    if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || offset + length > bodiesEnd) {
      throw new Error("An arx6 body length runs outside the container.");
    }
    artifact[index] = container.slice(offset, offset + length);
    offset += length;
  });
  if (offset !== bodiesEnd) throw new Error("The arx6 container has text past its last body.");

  const spendRestoredChars = createDecodedLengthMeter();
  for (const artifact of artifacts as unknown[][]) {
    if (artifact[0] !== ELIDED_DIFF_KIND_CODE) continue;
    if (typeof artifact[2] !== "string") throw new Error("An elided arx6 diff has no patch.");
    artifact[2] = restoreContainerDiffPatch(artifact[2], spendRestoredChars);
    artifact[0] = "d";
  }

  return envelopeFromParsedArxTuple(tuple, "arx6");
}

// ---------------------------------------------------------------------------
// Binary arithmetic coder
// ---------------------------------------------------------------------------

/**
 * Where the encoder stopped: the bytes it committed, then its open 32-bit interval [x1, x2]. Every code
 * whose four bytes after `head` read as a value in that interval decodes the same, whatever follows
 * them, and the fraction wire spends that freedom on its shortest digit string.
 */
type CodedInterval = { head: Uint8Array; x1: number; x2: number };

class BinaryArithmeticEncoder {
  private x1 = 0;
  private x2 = 0xffffffff;
  private readonly output: number[];

  constructor(head: readonly number[]) {
    this.output = [...head];
  }

  writeBit(bit: number, probability: number): void {
    const xmid = this.x1 + Math.floor((this.x2 - this.x1) / 4096) * probability;
    if (xmid < this.x1 || xmid > this.x2) {
      throw new Error(`arithmetic encoder midpoint escaped range: ${this.x1} <= ${xmid} <= ${this.x2}`);
    }

    if (bit === 1) {
      this.x2 = xmid >>> 0;
    } else {
      this.x1 = (xmid + 1) >>> 0;
    }

    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.output.push(this.x2 >>> 24);
      this.x1 = (this.x1 << 8) >>> 0;
      this.x2 = ((this.x2 << 8) | 0xff) >>> 0;
    }
  }

  finalInterval(): CodedInterval {
    return { head: Uint8Array.from(this.output), x1: this.x1, x2: this.x2 };
  }
}

class BinaryArithmeticDecoder {
  private readonly input: Uint8Array;
  private offset: number;
  private x1 = 0;
  private x2 = 0xffffffff;
  private x = 0;

  constructor(input: Uint8Array, start: number) {
    this.input = input;
    this.offset = start;
    for (let index = 0; index < 4; index++) {
      this.x = ((this.x << 8) | this.readByte()) >>> 0;
    }
  }

  /**
   * The fraction wire materializes every byte a valid decode reads, so running past the end means a
   * malformed fragment. Throwing here bounds the work a tiny crafted link can demand by declaring a
   * huge length, instead of running the model over padding until the UTF-8 or tuple check fails.
   */
  private readByte(): number {
    if (this.offset >= this.input.length) {
      throw new Error("arx6 decoder exhausted the coded payload");
    }
    return this.input[this.offset++];
  }

  readBit(probability: number): number {
    const xmid = this.x1 + Math.floor((this.x2 - this.x1) / 4096) * probability;
    if (xmid < this.x1 || xmid > this.x2) {
      throw new Error(`arithmetic decoder midpoint escaped range: ${this.x1} <= ${xmid} <= ${this.x2}`);
    }

    const bit = this.x <= xmid ? 1 : 0;
    if (bit === 1) {
      this.x2 = xmid >>> 0;
    } else {
      this.x1 = (xmid + 1) >>> 0;
    }

    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.x1 = (this.x1 << 8) >>> 0;
      this.x2 = ((this.x2 << 8) | 0xff) >>> 0;
      this.x = ((this.x << 8) | this.readByte()) >>> 0;
    }
    return bit;
  }
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return bytes;
}

function decodeVarint(input: Uint8Array): { value: number; bytesRead: number } {
  let value = 0;
  let multiplier = 1;
  for (let offset = 0; offset < input.length && offset < 8; offset++) {
    const byte = input[offset];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, bytesRead: offset + 1 };
    multiplier *= 128;
  }
  throw new Error("invalid or truncated varint");
}

/** Runs the priming bytes through the model uncoded, so both sides start from the same statistics. */
function primeModel(model: Arx6ContextModel, primeBytes: Uint8Array): void {
  for (const byte of primeBytes) {
    model.processKnownByte(byte, () => {});
  }
}

// ---------------------------------------------------------------------------
// Fraction wire
// ---------------------------------------------------------------------------

// The wire reads its digits d1..dn as the fraction F = 0.d1d2...dn and hands the decoder F's base-256
// expansion as the code. The digit count fixes the denominator, so the wire needs no length marker, and
// the encoder picks the fewest digits whose F lands in the coder's final interval, which makes the
// coder's flush digit-granular instead of byte-granular. Everything here is BigInt or small-integer
// arithmetic, so the expansion is the same on every engine.

/** RFC 3986 unreserved characters, each one chat-safe ASCII, so transport length equals visible length. */
const FRACTION_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~";
/** Linkifiers trim a trailing ".", "~", "-" or "_" off a URL, so the last digit is alphanumeric. */
const FINAL_FRACTION_DIGITS = FRACTION_DIGITS.slice(0, 62);
const FRACTION_RADIX = BigInt(FRACTION_DIGITS.length);
const FINAL_FRACTION_RADIX = BigInt(FINAL_FRACTION_DIGITS.length);
/** Digit strings up to this long convert by Horner's rule; longer ones split in half recursively. */
const DIGIT_CHUNK_LENGTH = 24;
const BIGINT_0 = BigInt(0);
const BIGINT_1 = BigInt(1);

/** 66^exponent by square-and-multiply, off `**` so no downlevel transform can hand a BigInt to Math.pow. */
function fractionRadixPower(exponent: number): bigint {
  let power = BIGINT_1;
  let base = FRACTION_RADIX;
  for (let remaining = exponent; remaining > 0; remaining >>= 1) {
    if ((remaining & 1) === 1) power *= base;
    if (remaining > 1) base *= base;
  }
  return power;
}

/** Denominator of an n-digit fraction: every digit is base 66 except the base-62 last one. */
function fractionDenominator(digitCount: number): bigint {
  return digitCount === 0 ? BIGINT_1 : fractionRadixPower(digitCount - 1) * FINAL_FRACTION_RADIX;
}

/**
 * Bytes of F's expansion the decoder materializes: the denominator's byte length plus 5 spare, so the
 * expansion covers the code's committed bytes and 32-bit window once the digits are precise enough to
 * land in the interval. The encoder only emits digit counts where that holds.
 */
function fractionCodeByteLength(denominator: bigint): number {
  return ((denominator.toString(16).length + 1) >> 1) + 5;
}

/** Upper bound on 64*log2(66), so the digit-count estimate built from it never overshoots. */
const FRACTION_RADIX_BITS_TIMES_64 = fractionRadixPower(64).toString(2).length;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return BigInt(`0x${hex}`);
}

/** Big-endian bytes of `value`, which must be below 256^byteLength. */
function bigIntToBytes(value: bigint, byteLength: number): Uint8Array {
  const hex = value.toString(16).padStart(byteLength * 2, "0");
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** `value` as exactly `digitCount` base-66 digits, most significant first. */
function radixDigits(value: bigint, digitCount: number): string {
  if (digitCount > DIGIT_CHUNK_LENGTH) {
    const lowCount = digitCount >> 1;
    const power = fractionRadixPower(lowCount);
    return radixDigits(value / power, digitCount - lowCount) + radixDigits(value % power, lowCount);
  }

  const digits: string[] = new Array(digitCount);
  let remaining = value;
  for (let index = digitCount - 1; index >= 0; index--) {
    digits[index] = FRACTION_DIGITS[Number(remaining % FRACTION_RADIX)];
    remaining /= FRACTION_RADIX;
  }
  return digits.join("");
}

/** Inverse of {@link radixDigits}. Throws on a character outside the wire alphabet. */
function radixValue(digits: string): bigint {
  if (digits.length > DIGIT_CHUNK_LENGTH) {
    const lowCount = digits.length >> 1;
    const split = digits.length - lowCount;
    return radixValue(digits.slice(0, split)) * fractionRadixPower(lowCount) + radixValue(digits.slice(split));
  }

  let value = BIGINT_0;
  for (const char of digits) {
    const digit = FRACTION_DIGITS.indexOf(char);
    if (digit < 0) throw new Error("The arx6 wire holds a character outside [0-9A-Za-z-._~].");
    value = value * FRACTION_RADIX + BigInt(digit);
  }
  return value;
}

/** The fewest digits whose fraction, expanded the way the decoder expands it, lands in `interval`. */
function intervalToFractionDigits({ head, x1, x2 }: CodedInterval): string {
  // The code's first byteCount bytes must read as a value in [low, low + width).
  const byteCount = head.length + 4;
  const shift = BigInt(8 * byteCount);
  const low = (bytesToBigInt(head) << BigInt(32)) | BigInt(x1);
  const width = BigInt(x2 - x1 + 1);

  // The smallest numerator at or above low/2^shift is the candidate; it fits when
  // numerator*2^shift - low*denominator < width*denominator. Fitting digit counts are upward-closed (an
  // n-digit fraction is also an (n+1)-digit one), so the scan starts from a lower bound set by the width.
  const precisionBits = 8 * byteCount - 4 * width.toString(16).length;
  const firstCount = Math.max(0, Math.floor((precisionBits * 64) / FRACTION_RADIX_BITS_TIMES_64) - 2);
  for (let digitCount = firstCount; ; digitCount++) {
    const denominator = fractionDenominator(digitCount);
    if (fractionCodeByteLength(denominator) < byteCount) continue;

    const scaled = low * denominator;
    const numerator = (scaled + (BIGINT_1 << shift) - BIGINT_1) >> shift;
    if (numerator < denominator && (numerator << shift) - scaled < width * denominator) {
      if (digitCount === 0) return "";
      const last = FINAL_FRACTION_DIGITS[Number(numerator % FINAL_FRACTION_RADIX)];
      return radixDigits(numerator / FINAL_FRACTION_RADIX, digitCount - 1) + last;
    }
  }
}

/** The code a digit string stands for: its fraction's base-256 expansion, see {@link fractionCodeByteLength}. */
function fractionDigitsToBytes(digits: string): Uint8Array {
  let numerator = BIGINT_0;
  if (digits.length > 0) {
    const last = FINAL_FRACTION_DIGITS.indexOf(digits.charAt(digits.length - 1));
    if (last < 0) throw new Error("The arx6 wire must end in [0-9A-Za-z].");
    numerator = radixValue(digits.slice(0, -1)) * FINAL_FRACTION_RADIX + BigInt(last);
  }

  const denominator = fractionDenominator(digits.length);
  const byteLength = fractionCodeByteLength(denominator);
  return bigIntToBytes((numerator << BigInt(8 * byteLength)) / denominator, byteLength);
}

/**
 * Codes bytes with the arx6 model onto the fraction wire: a varint byte count, then the arithmetic
 * code, read as one fraction. Exported with {@link decodeArx6Wire} so the coder and wire can be
 * exercised without an envelope.
 */
export function encodeArx6Wire(input: Uint8Array, primeBytes: Uint8Array | null): string {
  const model = new Arx6ContextModel();
  if (primeBytes) primeModel(model, primeBytes);

  const coder = new BinaryArithmeticEncoder(encodeVarint(input.length));
  for (const byte of input) {
    model.processKnownByte(byte, (probability, bit) => coder.writeBit(bit, probability));
  }
  return intervalToFractionDigits(coder.finalInterval());
}

/** Inverse of {@link encodeArx6Wire}, given the same priming bytes. Throws on a malformed digit. */
export function decodeArx6Wire(digits: string, primeBytes: Uint8Array | null): Uint8Array {
  const code = fractionDigitsToBytes(digits);
  const { value: byteLength, bytesRead } = decodeVarint(code);
  // The varint is attacker-controlled and reaches 2^56, so bound it before allocating the output.
  assertArxWireByteLength(byteLength);

  const model = new Arx6ContextModel();
  if (primeBytes) primeModel(model, primeBytes);

  const coder = new BinaryArithmeticDecoder(code, bytesRead);
  const output = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index++) {
    output[index] = model.processDecodedByte((probability) => coder.readBit(probability));
  }
  return output;
}

// ---------------------------------------------------------------------------
// Priors
// ---------------------------------------------------------------------------

/**
 * How each curated prior id is composed: the dictionary slot text, the head of a second curated block,
 * then the id's own block last, so the kind's own statistics are the freshest when the payload starts.
 * The second block measured about 2% shorter links than priming on the own block alone; markdown pairs
 * with json and every other kind with markdown. Each head ends at the last newline before its block's
 * midpoint. The character counts are part of the wire format, pinned against the asset by
 * tests/arx6-codec.test.ts.
 */
const ARX6_PRIOR_LAYOUT: Record<"m" | "c" | "j", { own: Arx4PriorKind; head: Arx4PriorKind; headChars: number }> = {
  m: { own: "markdown", head: "json", headChars: 7073 },
  c: { own: "code", head: "markdown", headChars: 7072 },
  j: { own: "json", head: "markdown", headChars: 7072 },
};

/**
 * Priming bytes for an arx6 prior id; `s` and `n` prime exactly as arx4 does. Exported so the composed
 * priors can be digest-pinned: a changed byte here silently breaks every shared `#g` link.
 */
export function arx6PriorBytes(priorId: Arx4PriorId): Uint8Array | null {
  if (priorId === "s" || priorId === "n") return priorBytesFor(priorId);

  const layout = ARX6_PRIOR_LAYOUT[priorId];
  const blocks = curatedArx4PriorBlocks(priorId);
  return new TextEncoder().encode(
    `${getArxDictionaryPriorText()}\n${blocks[layout.head].slice(0, layout.headChars)}\n${blocks[layout.own]}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compresses an envelope with the arx6 pipeline into `<priorId><wire>`, so a fragment is `g` plus the
 * returned string. The prior id follows arx4's rules, including the downgrade to `s` when the curated
 * asset is not loaded.
 *
 * Returns null for an envelope holding a lone surrogate: UTF-8 cannot carry one, while arx5's JSON
 * escaping can, so auto-selection falls back to arx5 for it.
 */
export function arx6CompressEnvelope(envelope: PayloadEnvelope, priorId?: Arx4PriorId): string | null {
  const container = envelopeToRawContainer(envelope);
  if (container === null) return null;

  const selectedPriorId = encodablePriorId(priorId ?? arx4PriorIdForEnvelope(envelope));
  return `${selectedPriorId}${encodeArx6Wire(new TextEncoder().encode(container), arx6PriorBytes(selectedPriorId))}`;
}

/**
 * Decompresses an arx6 payload (prior id char + wire) and rebuilds the envelope stamped `arx6`.
 * Throws on an unknown prior id, a digit outside the wire alphabet, bytes that are not UTF-8, or a
 * container whose tuple or lengths do not add up, rather than rendering a guess.
 */
export function arx6DecompressEnvelope(encoded: string): PayloadEnvelope {
  const priorId = encoded.slice(0, 1);
  if (!isArx4PriorId(priorId)) {
    throw new Error(`Unsupported arx6 prior id "${priorId}".`);
  }

  const containerBytes = decodeArx6Wire(encoded.slice(1), arx6PriorBytes(priorId));
  // ignoreBOM keeps a leading U+FEFF: the container starts with the first body, and stripping it would
  // shift every declared body length by one char without failing the decode.
  return rawContainerToEnvelope(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(containerBytes));
}
