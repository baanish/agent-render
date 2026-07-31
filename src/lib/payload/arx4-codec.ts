/**
 * arx4 codec: the context-mixing entropy stage for the arx tuple pipeline.
 *
 * Pipeline: envelope → compact tuple JSON → overlay + shared dictionary substitution →
 * context-mixing arithmetic coder → binary-to-text wire encoding. arx4 replaces only arx3's Brotli
 * stage; the tuple and substitution stages are the same functions arx2/arx3 call.
 *
 * Fragment shape: `<tag><priorId><wirePayload>`. The prior id names the priming corpus the coder ran
 * before the payload, because a decoder has to reproduce the encoder's model state exactly. The
 * curated part of those corpora ships as the lazily fetched `/arx4-priors.json` asset.
 *
 * The model is the frozen ARX4 experiment codec (`CM_SOURCE` in scripts/arx4-cm-determinism.mjs,
 * sha256 1f94ebb1fec5207df00e1ecdced7805c0c1d71dbc1c13c4c0baf11bc7b995f01, benchmarked in
 * docs/arx4-cm-bench.md) ported to TypeScript, plus one added mixer input: a column-position context
 * that predicts a table cell from the cell above it, worth a p50 15.9 percent gain on csv with no
 * subset regressed.
 *
 * Every coding decision is integer-only: no floats, no Date, no Math.random. That is what makes
 * encode bit-identical across Node, Chromium and WebKit (docs/arx4-cm-determinism.md), and a single
 * ambient or floating-point input in the coding path would silently break every link already shared.
 *
 * Cost: about 40 ms to code an 8 KB artifact and 770 ms for 60 KB, against ~8 ms for Brotli. That is
 * why the whole arx family is async-only.
 */

import {
  assertArxWireByteLength,
  decodeArxWirePayload,
  encodeArxWirePayloads,
  envelopeFromSubstitutedArxTupleText,
  getArxDictionaryPriorText,
  substituteArxTupleText,
  type ArxWirePayloads,
} from "@/lib/payload/arx-codec";
import type { ArtifactKind, PayloadEnvelope } from "@/lib/payload/schema";
import { sha256Hex } from "@/lib/sha256";
import { withBasePath } from "@/lib/site/base-path";

// ---------------------------------------------------------------------------
// Model geometry (frozen: these numbers are part of the wire format)
// ---------------------------------------------------------------------------

const TABLE_BITS = 20;
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_SHIFT = 32 - TABLE_BITS;
/** Byte orders per direct-context model; -1 is the current-word model. */
const MODEL_ORDERS = [0, 1, 2, 3, 4, 6, -1];
const MODEL_COUNT = MODEL_ORDERS.length;
const MATCH_INPUT_COUNT = 2;
/** Mixer input index of the column-position context, appended after the two match inputs. */
const COLUMN_INPUT_INDEX = MODEL_COUNT + MATCH_INPUT_COUNT;
const MIXER_INPUT_COUNT = COLUMN_INPUT_INDEX + 1;
const MIXER_CONTEXTS = 256;
const MIXER_WEIGHT_SCALE = 1 << 12;
const MIXER_WEIGHT_LIMIT = 4 * MIXER_WEIGHT_SCALE;
const MIXER_LEARNING_DIVISOR = 25_600;
const STRETCH_SCALE = 1 << 8;
const STRETCH_LIMIT = 8 * STRETCH_SCALE;
const MATCH_HASH_BYTES = 7;
const MATCH_TABLE_BITS = 18;
const MATCH_TABLE_SIZE = 1 << MATCH_TABLE_BITS;
const MATCH_BUFFER_SIZE = 1 << 19;
const MAX_MODEL_COUNT = 31;
const HISTORY_BYTES = 6;

const COLUMN_TABLE_SIZE = 1 << 20;
const COLUMN_MIN_DELIMITERS = 2;
const COLUMN_MAX_FIELD_INDEX = 31;
const COLUMN_MAX_FIELD_OFFSET = 63;
const COLUMN_MAX_LINE_BYTES = 1024;
/** Stands in for "the row above has no byte here", so it must sit outside the byte range. */
const COLUMN_ABOVE_NONE = 256;
const COLUMN_DOMAIN_TAG = 0x54;
const NEWLINE_BYTE = 0x0a;
const PIPE_BYTE = 0x7c;
const COMMA_BYTE = 0x2c;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// ---------------------------------------------------------------------------
// Integer arithmetic helpers
// ---------------------------------------------------------------------------

/** Round-half-away-from-zero integer division, symmetric about zero so weights train evenly. */
function divideRound(numerator: number, denominator: number): number {
  if (numerator >= 0) return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
  return -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator);
}

const BIGINT_1 = BigInt(1);
const BIGINT_31 = BigInt(31);
const BIGINT_2_POW_32 = BigInt(1) << BigInt(32);

/** log2 of a positive integer in Q16 fixed point, via BigInt squaring so no float ever appears. */
function log2Q16(value: number): number {
  const integerPart = 31 - Math.clz32(value);
  let normalized = BigInt(value) << BigInt(31 - integerPart);
  let fraction = 0;
  for (let bit = 15; bit >= 0; bit--) {
    normalized = (normalized * normalized) >> BIGINT_31;
    if (normalized >= BIGINT_2_POW_32) {
      normalized >>= BIGINT_1;
      fraction |= 1 << bit;
    }
  }
  return integerPart * 65_536 + fraction;
}

/** Q12 probability → signed Q8 log-odds. */
const stretchTable = new Int16Array(4096);
for (let probability = 1; probability < 4096; probability++) {
  const log2RatioQ16 = log2Q16(probability) - log2Q16(4096 - probability);
  stretchTable[probability] = divideRound(log2RatioQ16 * 45_426, 1 << 24);
}

/** Inverse of `stretchTable`, built by search so the two stay consistent by construction. */
const squashTable = new Uint16Array(STRETCH_LIMIT * 2 + 1);
for (let stretch = -STRETCH_LIMIT; stretch <= STRETCH_LIMIT; stretch++) {
  let low = 1;
  let high = 4095;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (stretchTable[middle] < stretch) low = middle + 1;
    else high = middle;
  }
  const previous = Math.max(1, low - 1);
  squashTable[stretch + STRETCH_LIMIT] = (
    Math.abs(stretchTable[previous] - stretch) <= Math.abs(stretchTable[low] - stretch)
      ? previous
      : low
  );
}

function squashStretch(stretch: number): number {
  const clamped = Math.max(-STRETCH_LIMIT, Math.min(STRETCH_LIMIT, stretch));
  return squashTable[clamped + STRETCH_LIMIT];
}

/**
 * Adaptive slot state: Q12 probability in the low 12 bits, observation count in bits 12-17, and an
 * 8-bit check tag in bits 18-25. The tag is what makes a hash collision read as "unseen slot"
 * instead of as another context's statistics.
 */
function updatePackedState(packed: number, bit: number): number {
  const probability = packed === 0 ? 2048 : packed & 0x0fff;
  const count = packed === 0 ? 0 : (packed >>> 12) & 0x3f;
  const target = bit === 1 ? 4096 : 0;
  const numerator = count === MAX_MODEL_COUNT ? target - probability : 2 * (target - probability);
  const denominator = count === MAX_MODEL_COUNT ? 32 : 2 * count + 3;
  const nextProbability = Math.max(1, Math.min(4095, probability + divideRound(numerator, denominator)));
  const nextCount = Math.min(MAX_MODEL_COUNT, count + 1);
  return nextProbability | (nextCount << 12);
}

/** Probability held in a tagged slot, or the 2048 prior when the slot is empty or collided. */
function taggedSlotProbability(packed: number, tag: number): number {
  return packed === 0 || ((packed >>> 18) & 0xff) !== tag ? 2048 : packed & 0x0fff;
}

function isWordByte(byte: number): boolean {
  return (
    (byte >= 0x30 && byte <= 0x39)
    || (byte >= 0x41 && byte <= 0x5a)
    || byte === 0x5f
    || (byte >= 0x61 && byte <= 0x7a)
  );
}

type ColumnLineStats = { length: number; pipes: number; commas: number };

// ---------------------------------------------------------------------------
// Context mixing model
// ---------------------------------------------------------------------------

class ContextMixModel {
  private readonly tables: Uint32Array[] = Array.from(
    { length: MODEL_COUNT },
    () => new Uint32Array(TABLE_SIZE),
  );
  private readonly weights = new Int32Array(MIXER_CONTEXTS * MIXER_INPUT_COUNT);
  private readonly initializedMixers = new Uint8Array(MIXER_CONTEXTS);
  private readonly historyHashes = new Uint32Array(MODEL_COUNT);
  private readonly matchTable = new Uint32Array(MATCH_TABLE_SIZE);
  private readonly matchBuffer = new Uint8Array(MATCH_BUFFER_SIZE);
  private readonly columnTable = new Uint32Array(COLUMN_TABLE_SIZE);
  private readonly cachedIndexes = new Uint32Array(MODEL_COUNT);
  private readonly cachedTags = new Uint8Array(MODEL_COUNT);
  private readonly cachedStretches = new Int16Array(MIXER_INPUT_COUNT);

  private history: number[] = [];
  private byteCount = 0;
  private matchPosition = -1;
  private matchLength = 0;
  private wordHash = 0;
  private wordLength = 0;
  private c0 = 1;
  private bitShift = 7;
  private cachedMixerOffset = 0;
  private cachedRawProbability = 2048;
  private cachedMatchBit = -1;

  private columnLineStats: ColumnLineStats[] = [];
  private columnPreviousLineBytes: number[] = [];
  private columnCurrentLineBytes: number[] = [];
  private columnCurrentLength = 0;
  private columnCurrentPipes = 0;
  private columnCurrentCommas = 0;
  private columnRowActive = false;
  private columnDelimiter = -1;
  private columnFieldIndex = 0;
  private columnFieldOffset = 0;
  private columnPreviousFields: number[][] | null = null;
  private columnSlotIndex = -1;
  private columnTag = 0;
  private columnHash = 0;

  constructor() {
    this.prepareByteContexts();
  }

  private hashHistory(order: number): number {
    let hash = (FNV_OFFSET_BASIS ^ order ^ (this.history.length << 24)) >>> 0;
    for (let index = 0; index < order; index++) {
      const value = index < this.history.length ? this.history[index] + 1 : 0;
      hash = Math.imul(hash ^ value ^ (index << 8), FNV_PRIME) >>> 0;
    }
    return hash;
  }

  private prepareByteContexts(): void {
    this.historyHashes[0] = 0x243f6a88;
    for (let index = 1; index < MODEL_COUNT - 1; index++) {
      this.historyHashes[index] = this.hashHistory(MODEL_ORDERS[index]);
    }
    this.historyHashes[MODEL_COUNT - 1] = (
      this.wordLength === 0
        ? 0x9e3779b9
        : (this.wordHash ^ Math.imul(this.wordLength, 0x85ebca6b))
    ) >>> 0;
  }

  private matchByteAt(position: number): number {
    return this.matchBuffer[position & (MATCH_BUFFER_SIZE - 1)];
  }

  private isReadableMatchPosition(position: number): boolean {
    return (
      position >= 0
      && position < this.byteCount
      && this.byteCount - position <= MATCH_BUFFER_SIZE
    );
  }

  private matchHash(endPosition: number): number {
    let hash = FNV_OFFSET_BASIS;
    for (let offset = MATCH_HASH_BYTES - 1; offset >= 0; offset--) {
      hash = Math.imul(hash ^ this.matchByteAt(endPosition - offset), FNV_PRIME) >>> 0;
    }
    return hash >>> (32 - MATCH_TABLE_BITS);
  }

  private matchContextsEqual(leftEnd: number, rightEnd: number): boolean {
    for (let offset = 0; offset < MATCH_HASH_BYTES; offset++) {
      if (this.matchByteAt(leftEnd - offset) !== this.matchByteAt(rightEnd - offset)) return false;
    }
    return true;
  }

  private updateMatch(byte: number): void {
    const matchedWholeByte = this.matchPosition >= 0;
    if (matchedWholeByte) {
      this.matchPosition++;
      this.matchLength = Math.min(255, this.matchLength + 1);
    }

    const currentPosition = this.byteCount;
    this.matchBuffer[currentPosition & (MATCH_BUFFER_SIZE - 1)] = byte;
    this.byteCount++;
    if (this.byteCount < MATCH_HASH_BYTES) return;

    const hash = this.matchHash(currentPosition);
    const previousEnd = this.matchTable[hash] - 1;
    this.matchTable[hash] = currentPosition + 1;
    if (matchedWholeByte) return;

    const candidateNext = previousEnd + 1;
    if (
      previousEnd >= MATCH_HASH_BYTES - 1
      && this.isReadableMatchPosition(candidateNext)
      && this.matchContextsEqual(previousEnd, currentPosition)
    ) {
      this.matchPosition = candidateNext;
      this.matchLength = MATCH_HASH_BYTES;
    } else {
      this.matchPosition = -1;
      this.matchLength = 0;
    }
  }

  /**
   * Row detection is causal: only the two already-coded lines before this one decide whether it is
   * a table row, so the decoder reaches the same conclusion from the same bytes.
   */
  private beginColumnRow(): void {
    this.columnRowActive = false;
    this.columnDelimiter = -1;
    this.columnFieldIndex = 0;
    this.columnFieldOffset = 0;
    this.columnPreviousFields = null;

    const previous = this.columnLineStats[0];
    const older = this.columnLineStats[1];
    if (previous === undefined || older === undefined) return;
    if (previous.length === 0 || older.length === 0) return;

    if (previous.pipes === older.pipes && previous.pipes >= COLUMN_MIN_DELIMITERS) {
      this.columnDelimiter = PIPE_BYTE;
    } else if (previous.commas === older.commas && previous.commas >= COLUMN_MIN_DELIMITERS) {
      this.columnDelimiter = COMMA_BYTE;
    } else {
      return;
    }

    this.columnRowActive = true;
    this.columnPreviousFields = this.splitColumnFields(this.columnPreviousLineBytes);
  }

  private splitColumnFields(lineBytes: number[]): number[][] {
    const fields: number[][] = [];
    let field: number[] = [];

    for (let index = 0; index < lineBytes.length; index++) {
      const byte = lineBytes[index];
      if (byte === this.columnDelimiter) {
        fields.push(field);
        if (fields.length > COLUMN_MAX_FIELD_INDEX) return fields;
        field = [];
        continue;
      }
      if (field.length <= COLUMN_MAX_FIELD_OFFSET) field.push(byte);
    }

    fields.push(field);
    return fields;
  }

  private updateColumnState(byte: number): void {
    if (byte === NEWLINE_BYTE) {
      this.columnLineStats.unshift({
        length: this.columnCurrentLength,
        pipes: this.columnCurrentPipes,
        commas: this.columnCurrentCommas,
      });
      if (this.columnLineStats.length > 2) this.columnLineStats.length = 2;
      this.columnPreviousLineBytes = this.columnCurrentLineBytes;
      this.columnCurrentLineBytes = [];
      this.columnCurrentLength = 0;
      this.columnCurrentPipes = 0;
      this.columnCurrentCommas = 0;
      this.beginColumnRow();
    } else {
      if (this.columnCurrentLineBytes.length < COLUMN_MAX_LINE_BYTES) {
        this.columnCurrentLineBytes.push(byte);
      }
      this.columnCurrentLength++;
      if (byte === PIPE_BYTE) this.columnCurrentPipes++;
      else if (byte === COMMA_BYTE) this.columnCurrentCommas++;
      if (this.columnRowActive) {
        if (byte === this.columnDelimiter) {
          this.columnFieldIndex++;
          this.columnFieldOffset = 0;
        } else {
          this.columnFieldOffset++;
        }
      }
    }

    this.columnHash = this.columnContextHash();
  }

  /** Keys on (field index, byte offset in field, byte at the same cell position one row up). */
  private columnContextHash(): number {
    if (!this.columnRowActive) return 0;

    const fieldIndex = Math.min(this.columnFieldIndex, COLUMN_MAX_FIELD_INDEX);
    const fieldOffset = Math.min(this.columnFieldOffset, COLUMN_MAX_FIELD_OFFSET);
    const field = this.columnPreviousFields === null ? undefined : this.columnPreviousFields[fieldIndex];
    const above = field !== undefined && fieldOffset < field.length ? field[fieldOffset] : COLUMN_ABOVE_NONE;

    let hash = FNV_OFFSET_BASIS;
    hash = Math.imul(hash ^ COLUMN_DOMAIN_TAG, FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ (fieldIndex + 1), FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ (fieldOffset + 1), FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ (above + 1), FNV_PRIME) >>> 0;
    // 0 is reserved for "context inactive", so a hash that lands there is nudged off it.
    return hash === 0 ? 1 : hash;
  }

  predict(): number {
    const mixerContext = this.c0 & 0xff;
    const mixerOffset = mixerContext * MIXER_INPUT_COUNT;
    if (this.initializedMixers[mixerContext] === 0) {
      for (let index = 0; index < MODEL_COUNT; index++) {
        this.weights[mixerOffset + index] = divideRound(MIXER_WEIGHT_SCALE, MODEL_COUNT);
      }
      this.weights[mixerOffset + MODEL_COUNT] = MIXER_WEIGHT_SCALE;
      this.weights[mixerOffset + MODEL_COUNT + 1] = MIXER_WEIGHT_SCALE;
      this.weights[mixerOffset + COLUMN_INPUT_INDEX] = divideRound(MIXER_WEIGHT_SCALE, MODEL_COUNT);
      this.initializedMixers[mixerContext] = 1;
    }

    let mixedStretch = 0;
    for (let index = 0; index < MODEL_COUNT; index++) {
      const slotHash = (
        Math.imul(this.historyHashes[index], 0x9e3779b1)
        ^ Math.imul(this.c0, 0x85ebca6b)
      ) >>> 0;
      const slotIndex = slotHash >>> TABLE_SHIFT;
      const tag = slotHash & 0xff;
      const stretched = stretchTable[taggedSlotProbability(this.tables[index][slotIndex], tag)];
      this.cachedIndexes[index] = slotIndex;
      this.cachedTags[index] = tag;
      this.cachedStretches[index] = stretched;
      mixedStretch += this.weights[mixerOffset + index] * stretched;
    }

    this.cachedMatchBit = -1;
    this.cachedStretches[MODEL_COUNT] = 0;
    this.cachedStretches[MODEL_COUNT + 1] = 0;
    if (this.isReadableMatchPosition(this.matchPosition)) {
      const matchBit = (this.matchByteAt(this.matchPosition) >>> this.bitShift) & 1;
      const direction = matchBit === 1 ? 1 : -1;
      const cappedMatchLength = Math.min(this.matchLength, 32);
      this.cachedMatchBit = matchBit;
      this.cachedStretches[MODEL_COUNT] = direction * cappedMatchLength * 64;
      this.cachedStretches[MODEL_COUNT + 1] = direction * Math.max(0, cappedMatchLength - 11) * 64;
      mixedStretch += (
        this.weights[mixerOffset + MODEL_COUNT] * this.cachedStretches[MODEL_COUNT]
        + this.weights[mixerOffset + MODEL_COUNT + 1] * this.cachedStretches[MODEL_COUNT + 1]
      );
    }

    this.columnSlotIndex = -1;
    this.cachedStretches[COLUMN_INPUT_INDEX] = 0;
    if (this.columnHash !== 0) {
      const slotHash = (
        Math.imul(this.columnHash, 0x9e3779b1)
        ^ Math.imul(this.c0, 0x85ebca6b)
      ) >>> 0;
      const slotIndex = slotHash >>> TABLE_SHIFT;
      const tag = slotHash & 0xff;
      const stretched = stretchTable[taggedSlotProbability(this.columnTable[slotIndex], tag)];
      this.columnSlotIndex = slotIndex;
      this.columnTag = tag;
      this.cachedStretches[COLUMN_INPUT_INDEX] = stretched;
      mixedStretch += this.weights[mixerOffset + COLUMN_INPUT_INDEX] * stretched;
    }

    const rawProbability = squashStretch(divideRound(mixedStretch, MIXER_WEIGHT_SCALE));
    this.cachedMixerOffset = mixerOffset;
    this.cachedRawProbability = rawProbability;
    return rawProbability;
  }

  update(bit: number): void {
    const error = bit * 4096 - this.cachedRawProbability;
    for (let index = 0; index < MIXER_INPUT_COUNT; index++) {
      const weightIndex = this.cachedMixerOffset + index;
      const nextWeight = this.weights[weightIndex] + divideRound(
        error * this.cachedStretches[index],
        MIXER_LEARNING_DIVISOR,
      );
      this.weights[weightIndex] = Math.max(-MIXER_WEIGHT_LIMIT, Math.min(MIXER_WEIGHT_LIMIT, nextWeight));
    }

    for (let index = 0; index < MODEL_COUNT; index++) {
      const slotIndex = this.cachedIndexes[index];
      const tag = this.cachedTags[index];
      const packed = this.tables[index][slotIndex];
      const matchingState = packed !== 0 && ((packed >>> 18) & 0xff) === tag ? packed : 0;
      this.tables[index][slotIndex] = updatePackedState(matchingState, bit) | (tag << 18);
    }

    if (this.columnSlotIndex >= 0) {
      const packed = this.columnTable[this.columnSlotIndex];
      const matchingState = packed !== 0 && ((packed >>> 18) & 0xff) === this.columnTag ? packed : 0;
      this.columnTable[this.columnSlotIndex] = (
        updatePackedState(matchingState, bit) | (this.columnTag << 18)
      );
    }

    if (this.cachedMatchBit >= 0 && bit !== this.cachedMatchBit) {
      this.matchPosition = -1;
      this.matchLength = 0;
    }

    this.c0 = (this.c0 << 1) | bit;
    this.bitShift--;
  }

  private finishByte(byte: number): void {
    this.updateMatch(byte);
    this.history.unshift(byte);
    if (this.history.length > HISTORY_BYTES) this.history.length = HISTORY_BYTES;

    if (isWordByte(byte)) {
      if (this.wordLength === 0) this.wordHash = FNV_OFFSET_BASIS;
      this.wordHash = Math.imul(this.wordHash ^ byte, FNV_PRIME) >>> 0;
      this.wordLength = Math.min(255, this.wordLength + 1);
    } else {
      this.wordHash = 0;
      this.wordLength = 0;
    }

    this.c0 = 1;
    this.bitShift = 7;
    this.prepareByteContexts();
    this.updateColumnState(byte);
  }

  processKnownByte(byte: number, consumePrediction: (probability: number, bit: number) => void): void {
    for (let shift = 7; shift >= 0; shift--) {
      const probability = this.predict();
      const bit = (byte >>> shift) & 1;
      consumePrediction(probability, bit);
      this.update(bit);
    }
    this.finishByte(byte);
  }

  processDecodedByte(readBit: (probability: number) => number): number {
    let byte = 0;
    for (let shift = 7; shift >= 0; shift--) {
      const probability = this.predict();
      const bit = readBit(probability);
      byte |= bit << shift;
      this.update(bit);
    }
    this.finishByte(byte);
    return byte;
  }
}

// ---------------------------------------------------------------------------
// Binary arithmetic coder
// ---------------------------------------------------------------------------

class BinaryArithmeticEncoder {
  private x1 = 0;
  private x2 = 0xffffffff;
  private readonly output: number[] = [];

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

  finish(): Uint8Array {
    this.output.push(this.x1 >>> 24, (this.x1 >>> 16) & 0xff, (this.x1 >>> 8) & 0xff, this.x1 & 0xff);
    return Uint8Array.from(this.output);
  }
}

class BinaryArithmeticDecoder {
  private readonly input: Uint8Array;
  private offset = 4;
  private x1 = 0;
  private x2 = 0xffffffff;
  private x: number;

  constructor(input: Uint8Array) {
    if (input.length < 4) throw new Error("arithmetic payload is shorter than its four-byte flush");
    this.input = input;
    this.x = (input[0] * 0x1000000 + input[1] * 0x10000 + input[2] * 0x100 + input[3]) >>> 0;
  }

  private readByte(): number {
    if (this.offset >= this.input.length) {
      throw new Error("arithmetic decoder exhausted the coded payload");
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

/**
 * Runs the priming bytes through the model without coding them, which is what lets a fixed corpus
 * shape both sides' statistics for free. Priming also fills the match ring, so the prior supplies
 * match candidates as well as byte statistics.
 */
function primeModel(model: ContextMixModel, primeBytes: Uint8Array): void {
  for (const byte of primeBytes) {
    model.processKnownByte(byte, () => {});
  }
}

function encodeCm(input: Uint8Array, primeBytes: Uint8Array | null): Uint8Array {
  const model = new ContextMixModel();
  if (primeBytes) primeModel(model, primeBytes);

  const coder = new BinaryArithmeticEncoder();
  for (const byte of input) {
    model.processKnownByte(byte, (probability, bit) => coder.writeBit(bit, probability));
  }

  const lengthPrefix = encodeVarint(input.length);
  const coded = coder.finish();
  const output = new Uint8Array(lengthPrefix.length + coded.length);
  output.set(lengthPrefix, 0);
  output.set(coded, lengthPrefix.length);
  return output;
}

function decodeCm(input: Uint8Array, primeBytes: Uint8Array | null): Uint8Array {
  const { value: byteLength, bytesRead } = decodeVarint(input);
  // The varint is attacker-controlled and reaches 2^56, so bound it before allocating the output.
  assertArxWireByteLength(byteLength);

  const model = new ContextMixModel();
  if (primeBytes) primeModel(model, primeBytes);

  const coder = new BinaryArithmeticDecoder(input.subarray(bytesRead));
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
 * Wire ids for the priming corpus: markdown, code, json, the shared corpus, and none. The id is one
 * ASCII char at the head of the arx4 payload, so a fragment always says which prior decodes it.
 */
export const arx4PriorIds = ["m", "c", "j", "s", "n"] as const;

export type Arx4PriorId = (typeof arx4PriorIds)[number];

const arx4PriorIdSet = new Set<string>(arx4PriorIds);

/** True when `value` is a prior id this build can decode. */
export function isArx4PriorId(value: string): value is Arx4PriorId {
  return arx4PriorIdSet.has(value);
}

const PRIOR_ID_BY_ARTIFACT_KIND: Record<ArtifactKind, Arx4PriorId> = {
  markdown: "m",
  code: "c",
  json: "j",
  csv: "j",
  diff: "c",
};

/** The prior id an encoder picks for an envelope, from its first artifact's kind. */
export function arx4PriorIdForEnvelope(envelope: PayloadEnvelope): Arx4PriorId {
  const kind = envelope.artifacts[0]?.kind;
  return kind === undefined ? "s" : PRIOR_ID_BY_ARTIFACT_KIND[kind];
}

/** Curated corpora the priors asset carries, keyed the way the asset keys them. */
const ARX4_PRIOR_KINDS = ["markdown", "code", "json"] as const;

type Arx4PriorKind = (typeof ARX4_PRIOR_KINDS)[number];

/**
 * The `/arx4-priors.json` asset: the kind-specific tail of each curated prior. The 2203-char common
 * prefix is left out because {@link getArxDictionaryPriorText} already rebuilds it from the pinned
 * dictionaries, which the `e` tag pins anyway.
 */
export type Arx4Priors = {
  version: number;
  kinds: Record<Arx4PriorKind, string>;
};

/** Prior ids that need a curated corpus; `s` primes on the dictionaries alone and `n` on nothing. */
const PRIOR_KIND_BY_ID: Record<Arx4PriorId, Arx4PriorKind | null> = {
  m: "markdown",
  c: "code",
  j: "json",
  s: null,
  n: null,
};

/**
 * The prior ids that need the curated asset, derived from the kind map so no caller re-spells them.
 * Exported because callers route on a fragment's leading char to decide whether the asset is needed
 * at all: `s` and `n` fragments must not trigger the fetch.
 */
export const CURATED_PRIOR_IDS: readonly Arx4PriorId[] = arx4PriorIds.filter(
  (priorId) => PRIOR_KIND_BY_ID[priorId] !== null,
);

/**
 * The one priors version this build codes curated fragments against. The compact `e` tag carries no
 * priors version, so a fragment names only "the curated prior for kind X" and both sides have to
 * already agree on which corpus that is. An asset at any other version is unusable, a stale or
 * rolled-back copy exactly as much as a forward-deployed one, because priming with corpus bytes the
 * fragment was never coded against yields plausible garbage rather than an error. Bumping this is a
 * wire change that also needs a new compact tag, like the dictionary pins in fragment-arx.ts.
 */
export const EXPECTED_ARX4_PRIORS_VERSION = 1;

/** Byte length of every curated prior, the size the ARX4 research benchmarks measured. */
export const ARX4_PRIOR_BYTES = 16 * 1024;

/**
 * sha256 of each curated prior as {@link reassembleCuratedPrior} rebuilds it: the pinned dictionary
 * slot text, a newline, then the asset's kind block. The version field alone cannot say whether an
 * asset holds the corpora this build's fragments were coded against, so the install point checks
 * identity, not just the label. tests/arx4-priors.test.ts asserts the shipped asset against these with
 * node:crypto, and scripts/build-arx4-priors.mjs prints them when it regenerates the asset.
 */
export const PINNED_ARX4_PRIOR_SHA256 = {
  markdown: "90da74cfa7a7394099aefd7d8f3ba9ed2acc40237b23d58048f4b8b4dd596c9c",
  code: "3596c70d73b7d3f95e5f978a0c3bcb4ae1d4aa8711d563f4a22f39d0123aa6af",
  json: "37e1cfa8f8885afda7e560d63616b4e84e891a1c3a63d2ac3a139ebe6558fb18",
} as const satisfies Record<Arx4PriorKind, string>;

/**
 * Thrown when a fragment names a curated prior this build cannot rebuild, because the asset is not
 * loaded or is not at {@link EXPECTED_ARX4_PRIORS_VERSION}. Decoding it against the shared prior, or
 * against a skewed corpus, would return plausible garbage instead, so the failure surfaces and the
 * caller can retry once the asset endpoint serves the expected version.
 */
export class Arx4PriorsUnavailableError extends Error {
  constructor(priorId: Arx4PriorId) {
    super(`The arx4 priors asset is unavailable, so the "${priorId}" prior cannot be rebuilt.`);
    this.name = "Arx4PriorsUnavailableError";
  }
}

// Mirrors the dictionary slots in arx-codec.ts, minus the built-in fallback: there is no compiled-in
// curated corpus, so version 0 means "no asset loaded" and the encoder degrades to the `s` prior
// rather than blocking on a fetch it cannot complete.
const priorsSlot: { priors: Arx4Priors | null; version: number } = { priors: null, version: 0 };

/**
 * The full curated prior for one kind block: the pinned dictionary slot text, a newline, the block.
 * Both the install-time identity check and the coder go through here, so what was validated is exactly
 * what primes the mixer.
 */
function reassembleCuratedPrior(kindBlock: string): string {
  return `${getArxDictionaryPriorText()}\n${kindBlock}`;
}

function isArx4Priors(value: unknown): value is Arx4Priors {
  if (typeof value !== "object" || value === null) return false;
  const asset = value as Record<string, unknown>;
  // A non-integer or negative version would install while every caller read it as the -1 failure
  // sentinel, leaving the priors live but reported unloaded, so the shape check owns it here.
  const version = asset.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return false;
  if (typeof asset.kinds !== "object" || asset.kinds === null) return false;

  const kinds = asset.kinds as Record<string, unknown>;
  // The size bound is part of the shape: a kind block can never exceed the prior it is a tail of, and
  // rejecting an oversize one here keeps a corrupt or hostile asset out of the hashing below and out of
  // the mixer's byte-by-byte priming walk.
  return ARX4_PRIOR_KINDS.every((kind) => {
    const block = kinds[kind];
    return typeof block === "string" && block !== "" && block.length <= ARX4_PRIOR_BYTES;
  });
}

/**
 * True when every kind block reassembles to the prior this build codes against, checked by byte length
 * and pinned digest. A truncated, padded or swapped block is otherwise indistinguishable from the real
 * asset at the version field, and installing it caches it as authoritative: later loads return early on
 * the matching version, so the recovered endpoint is never refetched and curated links stay broken.
 */
function priorsMatchPinnedDigests(priors: Arx4Priors): boolean {
  return ARX4_PRIOR_KINDS.every((kind) => {
    const bytes = new TextEncoder().encode(reassembleCuratedPrior(priors.kinds[kind]));
    return bytes.length === ARX4_PRIOR_BYTES && sha256Hex(bytes) === PINNED_ARX4_PRIOR_SHA256[kind];
  });
}

function getDefaultArx4PriorsUrls(): string[] {
  const url = withBasePath("/arx4-priors.json");
  return [`${url}.br`, url];
}

/**
 * This fetch sits on the link-creation path, and a connection that never responds would leave the
 * awaited promise pending forever instead of degrading to the `s` prior. The dictionary fetches can
 * afford no bound because they have a built-in fallback table; the priors slot has none.
 */
const PRIORS_FETCH_TIMEOUT_MS = 10_000;

async function fetchArx4Priors(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PRIORS_FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * The one install point, so a half-shaped or unpinned asset can never reach the coder. -1 means
 * unusable and leaves the slot alone, which is what makes such a load retryable.
 */
function installArx4Priors(value: unknown): number {
  if (!isArx4Priors(value) || !priorsMatchPinnedDigests(value)) return -1;

  priorsSlot.priors = value;
  priorsSlot.version = value.version;
  return value.version;
}

/**
 * Loads the curated priors from a URL or parsed object, trying the pre-compressed asset first on a
 * default load. Returns the asset version on success, or -1 on failure (the slot keeps whatever it
 * already had), so a transient failure can be retried rather than cached.
 *
 * A fetched asset is installed only at {@link EXPECTED_ARX4_PRIORS_VERSION}: `.br` and `.json` are two
 * files that a mid-deploy CDN can serve at different versions, and installing whatever the first URL
 * answers with would both skip the URL that still had the right one and wedge every later retry, which
 * hits the same skewed URL again. An off-version asset handed in as an object still installs, because
 * that is the injection path tests and offline agents use to put the slot in a known state.
 */
export async function loadArx4Priors(source?: string | Arx4Priors): Promise<number> {
  try {
    if (source && typeof source === "object") return installArx4Priors(source);

    const urls = typeof source === "string" ? [source] : getDefaultArx4PriorsUrls();
    for (const url of urls) {
      const fetched = await fetchArx4Priors(url);
      if (isArx4Priors(fetched) && fetched.version === EXPECTED_ARX4_PRIORS_VERSION) {
        const installed = installArx4Priors(fetched);
        // A digest-mismatched asset from one URL must not short-circuit the others: the
        // remaining URL may still serve the intact file (mid-deploy or corrupted cache).
        if (installed >= 0) return installed;
      }
    }
    return -1;
  } catch {
    return -1;
  }
}

/**
 * Loads the curated priors from a pre-parsed object (synchronous), for tests and offline agents that
 * already hold the asset JSON. Returns the version, or -1 when the object is not a usable asset.
 */
export function loadArx4PriorsSync(priors: Arx4Priors): number {
  return installArx4Priors(priors);
}

/**
 * Returns true when the curated priors asset has been loaded, whatever version it is. Deliberately
 * NOT a usability check: an asset off {@link EXPECTED_ARX4_PRIORS_VERSION} loads and reports true
 * while no curated coding may use it, so the coding paths ask `versionMatchedPriors` instead.
 */
export function isArx4PriorsLoaded(): boolean {
  return priorsSlot.priors !== null;
}

/** Returns the active curated priors version (0 = no asset loaded). */
export function getActiveArx4PriorsVersion(): number {
  return priorsSlot.version;
}

/**
 * The loaded priors, but only at {@link EXPECTED_ARX4_PRIORS_VERSION}: the single gate both coding
 * paths ask, so a version-skewed asset can never reach the mixer from either side.
 */
function versionMatchedPriors(): Arx4Priors | null {
  return priorsSlot.version === EXPECTED_ARX4_PRIORS_VERSION ? priorsSlot.priors : null;
}

/**
 * Priming bytes for a prior id, or null for "n" (cold model).
 *
 * Every prior starts from the pinned arx dictionary slot text in its RAW form, not the substituted
 * form: the slots are themselves the substitution patterns, so substituting the prior collapses it to
 * control bytes and measured ~5% worse than priming on the raw text.
 *
 * `s` is that text alone. `m`, `c` and `j` append the matching curated corpus from the priors asset,
 * which is what the 16 KiB per-kind priors in docs/arx4-cm-bench.md measured, and throw when that
 * corpus is missing or version-skewed rather than quietly coding against a different prior than the
 * id names.
 */
function priorBytesFor(priorId: Arx4PriorId): Uint8Array | null {
  if (priorId === "n") return null;

  const kind = PRIOR_KIND_BY_ID[priorId];
  if (kind === null) return new TextEncoder().encode(getArxDictionaryPriorText());

  const priors = versionMatchedPriors();
  if (priors === null) throw new Arx4PriorsUnavailableError(priorId);
  return new TextEncoder().encode(reassembleCuratedPrior(priors.kinds[kind]));
}

/**
 * The prior id an encode can actually honor. A curated id degrades to `s` when the asset is missing or
 * version-skewed, so a failed or stale asset fetch costs compression instead of blocking link
 * creation; the emitted id always names the prior the payload was really coded against.
 */
function encodablePriorId(priorId: Arx4PriorId): Arx4PriorId {
  if (PRIOR_KIND_BY_ID[priorId] === null) return priorId;
  return versionMatchedPriors() === null ? "s" : priorId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compresses a payload envelope with the arx4 pipeline. Every returned wire string already carries
 * the prior id char, so a candidate is `<tag>` + the string returned here.
 *
 * `priorId` defaults to {@link arx4PriorIdForEnvelope}; pass it explicitly only to exercise a prior
 * the kind map does not select. A curated id downgrades to `s` unless the priors asset is loaded at
 * {@link EXPECTED_ARX4_PRIORS_VERSION}, so the returned payloads always carry the id they were really
 * coded against.
 */
export function arx4CompressEnvelope(envelope: PayloadEnvelope, priorId?: Arx4PriorId): ArxWirePayloads {
  const selectedPriorId = encodablePriorId(priorId ?? arx4PriorIdForEnvelope(envelope));
  const substituted = substituteArxTupleText(envelope);
  const coded = encodeCm(new TextEncoder().encode(substituted), priorBytesFor(selectedPriorId));
  const payloads = encodeArxWirePayloads(coded);

  return {
    base76: `${selectedPriorId}${payloads.base76}`,
    base1k: `${selectedPriorId}${payloads.base1k}`,
    baseBMP: `${selectedPriorId}${payloads.baseBMP}`,
    base64url: `${selectedPriorId}${payloads.base64url}`,
  };
}

/**
 * Decompresses an arx4 payload (prior id char + wire payload) and rebuilds the envelope.
 * Throws on an unrecognized prior id rather than guessing, because decoding with the wrong prior
 * produces plausible-looking garbage instead of an error.
 */
export function arx4DecompressEnvelope(encoded: string): PayloadEnvelope {
  const priorId = encoded.slice(0, 1);
  if (!isArx4PriorId(priorId)) {
    throw new Error(`Unsupported arx4 prior id "${priorId}".`);
  }

  const primeBytes = priorBytesFor(priorId);
  const substituted = decodeArxWirePayload(encoded.slice(1), (bytes) => (
    new TextDecoder().decode(decodeCm(bytes, primeBytes))
  ));
  return envelopeFromSubstitutedArxTupleText(substituted, "arx4");
}
