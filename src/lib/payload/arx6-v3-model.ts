/**
 * Frozen ARX6 v3 context mixer. Legacy and v2 models remain unchanged in their own modules.
 *
 * Adds two causal experts to v2: the last four nonword bytes (excluding ASCII space/tab),
 * combined with the previous byte; and a six-byte history with ASCII digits mapped to one value.
 * These contexts share structural statistics across changing words and numbers without changing
 * any source bytes, tokenizing a language, adding vocabulary, or training on evaluation text.
 * Nonword history also retains newlines, controls and non-ASCII UTF-8 bytes.
 *
 * The model was frozen before the separate 27-case external validation corpus was evaluated.
 * Its 13 context tables and 42 mixer inputs allocate 54.50 MiB of instance typed arrays.
 * Every coding decision is deterministic integer arithmetic. Any model or priming change needs
 * another version; never alter this model under existing g3 links.
 */
// ---------------------------------------------------------------------------
// Model geometry
// ---------------------------------------------------------------------------

const TABLE_BITS = 20;
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_SHIFT = 32 - TABLE_BITS;
/** Byte orders per direct-context model; -1 is the current-word model. */
const MODEL_ORDERS = [0, 1, 2, 3, 4, 6, -1];
const BASE_MODEL_COUNT = MODEL_ORDERS.length;
/** hash(first byte of line, indent depth, previous two bytes), appended after the shipped models. */
const LINETYPE_MODEL_INDEX = BASE_MODEL_COUNT;
const PREVIOUS_WORD_MODEL_INDEX = LINETYPE_MODEL_INDEX + 1;
const PREVIOUS_TWO_WORDS_MODEL_INDEX = PREVIOUS_WORD_MODEL_INDEX + 1;
const CLASS_MODEL_INDEX = PREVIOUS_TWO_WORDS_MODEL_INDEX + 1;
const SYMBOL_MODEL_INDEX = CLASS_MODEL_INDEX + 1;
const NUMBER_MODEL_INDEX = SYMBOL_MODEL_INDEX + 1;
const MODEL_COUNT = NUMBER_MODEL_INDEX + 1;
const LEXICAL_TABLE_BITS = 18;
const LEXICAL_TABLE_SIZE = 1 << LEXICAL_TABLE_BITS;
const LEXICAL_TABLE_SHIFT = 32 - LEXICAL_TABLE_BITS;
const MATCH_INPUT_COUNT = 2;
/** Mixer input index of the column-position context, appended after the two match inputs. */
const COLUMN_INPUT_INDEX = MODEL_COUNT + MATCH_INPUT_COUNT;
/** One input per model: its stretch when the slot has only ever seen one bit value, else 0. */
const DET_INPUT_INDEX = COLUMN_INPUT_INDEX + 1;
/** One input per model: the run model's signed confidence in the byte last seen in that context. */
const RUN_INPUT_INDEX = DET_INPUT_INDEX + MODEL_COUNT;
const MIXER_INPUT_COUNT = RUN_INPUT_INDEX + MODEL_COUNT;
/** Run model (paq8 ContextMap): per byte context, the last byte seen there and how often it repeated. */
const RUN_TABLE_BITS = 18;
const RUN_COUNT_LIMIT = 126;
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

/** First-layer weight sets: "order" is (tagged hits among the nonzero-order models, capped at 7) x (match state 0..3). */
const ORDER_SET_COUNT = 32;
/** "c1" weight sets follow the order sets in the same flat array, one per previous byte. */
const C1_SET_BASE = ORDER_SET_COUNT;
const FIRST_LAYER_SET_COUNT = ORDER_SET_COUNT + 256;
const FIRST_LAYER_MIXERS = 2;
/** Final mixer: one weight set per partial byte c0. */
const FINAL_SET_COUNT = 256;

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
const TAB_BYTE = 0x09;
const SPACE_BYTE = 0x20;

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

/** 16 * log2(x) rounded, for run-length confidence (paq8 ilog). */
const ilogTable = new Uint16Array(256);
for (let value = 1; value < 256; value++) ilogTable[value] = divideRound(log2Q16(value), 4096);

function squashStretch(stretch: number): number {
  const clamped = Math.max(-STRETCH_LIMIT, Math.min(STRETCH_LIMIT, stretch));
  return squashTable[clamped + STRETCH_LIMIT];
}

/**
 * Adaptive slot state: Q12 probability in the low 12 bits, observation count in bits 12-17, and an
 * 8-bit check tag in bits 18-25. The tag is what makes a hash collision read as "unseen slot"
 * instead of as another context's statistics. Model tables also keep "bit values seen" flags in
 * bits 26-27 (bit 26: a 0 was seen, bit 27: a 1 was seen); callers strip them before this update.
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

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, FNV_PRIME) >>> 0;
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
// Adaptive probability map (lpaq1 APM)
// ---------------------------------------------------------------------------

const APM_BUCKETS = 33;
const APM_RATE = 7;

/** One APM row: the identity map sampled at 33 stretch buckets, Q16. */
const APM_INITIAL_ROW = Uint16Array.from({ length: APM_BUCKETS }, (_, bucket) => squashStretch((bucket - 16) * 128) * 16);

/**
 * Interpolating adaptive probability map over 33 stretch buckets, Q16 entries. Rows are filled on
 * first touch, which is equivalent to filling them all up front but skips the multi-megabyte fill
 * that most contexts never need. The update moves the nearer bucket only (lpaq1).
 */
class AdaptiveProbabilityMap {
  private readonly table: Uint16Array;
  private readonly rowReady: Uint8Array;
  private index = 0;

  constructor(contexts: number) {
    this.table = new Uint16Array(contexts * APM_BUCKETS);
    this.rowReady = new Uint8Array(contexts);
  }

  refine(probability: number, context: number): number {
    if (this.rowReady[context] === 0) {
      this.table.set(APM_INITIAL_ROW, context * APM_BUCKETS);
      this.rowReady[context] = 1;
    }
    const raw = stretchTable[probability];
    const stretch = raw > 2047 ? 2047 : raw < -2047 ? -2047 : raw;
    const position = (stretch + 2048) * 32;
    const weight = position & 0xfff;
    const lowIndex = context * APM_BUCKETS + (position >> 12);
    this.index = lowIndex + (weight >> 11);
    const refined = (this.table[lowIndex] * (4096 - weight) + this.table[lowIndex + 1] * weight) >> 16;
    return refined < 1 ? 1 : refined > 4095 ? 4095 : refined;
  }

  update(bit: number): void {
    const target = (bit << 16) + (bit << APM_RATE) - bit - bit;
    this.table[this.index] += (target - this.table[this.index]) >> APM_RATE;
  }
}

// ---------------------------------------------------------------------------
// Context mixing model
// ---------------------------------------------------------------------------

export class Arx6V3ContextModel {
  private readonly tables: Uint32Array[] = Array.from(
    { length: MODEL_COUNT },
    (_, index) => new Uint32Array(
      index === 0 ? 256 : index === 1 ? 65_536 : index > LINETYPE_MODEL_INDEX ? LEXICAL_TABLE_SIZE : TABLE_SIZE,
    ),
  );
  /** Both first-layer mixers' weight sets in one flat array: order sets first, then c1 sets. */
  private readonly weights = new Int32Array(FIRST_LAYER_SET_COUNT * MIXER_INPUT_COUNT);
  private readonly initializedSets = new Uint8Array(FIRST_LAYER_SET_COUNT);
  private readonly mixerOffsets = new Int32Array(FIRST_LAYER_MIXERS);
  private readonly mixerStretches = new Int32Array(FIRST_LAYER_MIXERS);
  private readonly mixerProbabilities = new Int32Array(FIRST_LAYER_MIXERS);
  private readonly finalWeights = new Int32Array(FINAL_SET_COUNT * FIRST_LAYER_MIXERS);
  private readonly finalInitialized = new Uint8Array(FINAL_SET_COUNT);
  private finalOffset = 0;
  /** Zero-initialized corrections keyed by previous-byte class and current partial byte. */
  private readonly residualWeights = new Int32Array(2048 * MIXER_INPUT_COUNT);
  private residualOffset = 0;
  /** Indexes of the nonzero inputs this bit; a zero input neither moves a dot product nor trains a weight. */
  private readonly activeInputs = new Uint8Array(MIXER_INPUT_COUNT);
  private activeInputCount = 0;
  private readonly apmOrder1 = new AdaptiveProbabilityMap(1 << 16);
  private readonly apmOrder2 = new AdaptiveProbabilityMap(1 << 16);
  private foundCount = 0;
  private matchState = 0;

  private readonly historyHashes = new Uint32Array(MODEL_COUNT);
  private readonly matchTable = new Uint32Array(MATCH_TABLE_SIZE);
  private readonly matchBuffer = new Uint8Array(MATCH_BUFFER_SIZE);
  private readonly columnTable = new Uint32Array(COLUMN_TABLE_SIZE);
  private readonly cachedIndexes = new Uint32Array(MODEL_COUNT);
  private readonly cachedTags = new Uint8Array(MODEL_COUNT);
  private readonly cachedStretches = new Int16Array(MIXER_INPUT_COUNT);
  private readonly runTables: Uint32Array[] = Array.from(
    { length: MODEL_COUNT },
    (_, index) => new Uint32Array(index === 0 ? 1 : index === 1 ? 257 : 1 << RUN_TABLE_BITS),
  );
  private readonly runIndexes = new Uint32Array(MODEL_COUNT);
  private readonly runTags = new Uint8Array(MODEL_COUNT);
  /** Predicted byte | 256, or 0 when the context has no run entry. */
  private readonly runBytes = new Uint16Array(MODEL_COUNT);
  private readonly runStrengths = new Int16Array(MODEL_COUNT);

  private history: number[] = [];
  private byteCount = 0;
  private matchPosition = -1;
  private matchLength = 0;
  private symbolHistory = FNV_OFFSET_BASIS;
  private wordHash = 0;
  private wordLength = 0;
  private previousWord = 0;
  private previousWord2 = 0;
  private classHash = 0;
  private previousClass = 6;
  private lineIndent = 0;
  private lineInIndent = true;
  private lineFirstByte = 256;
  private c0 = 1;
  private bitShift = 7;
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
    this.loadRuns();
  }

  /** Entry layout: byte in bits 0-7, run count in 8-14, "another byte seen before" in 15, check tag in 16-23. */
  private loadRuns(): void {
    for (let index = 0; index < MODEL_COUNT; index++) {
      const hash = Math.imul(this.historyHashes[index] ^ 0x632be5ab, 0x9e3779b1) >>> 0;
      const slot = index === 0 ? 0 : index === 1 ? (this.history[0] ?? -1) + 1 : hash >>> (32 - RUN_TABLE_BITS);
      const tag = hash & 0xff;
      this.runIndexes[index] = slot;
      this.runTags[index] = tag;
      const entry = this.runTables[index][slot];
      if (entry === 0 || ((entry >>> 16) & 0xff) !== tag) {
        this.runBytes[index] = 0;
        this.runStrengths[index] = 0;
      } else {
        const count = (entry >>> 8) & 0x7f;
        const mixed = (entry >>> 15) & 1;
        this.runBytes[index] = (entry & 0xff) | 256;
        // paq8 strength: ilog(rc + 1) << (2 + !mixed), rc = 2 * run count + mixed.
        this.runStrengths[index] = ilogTable[2 * count + mixed + 1] << (mixed === 1 ? 2 : 3);
      }
    }
  }

  private updateRuns(byte: number): void {
    for (let index = 0; index < MODEL_COUNT; index++) {
      const table = this.runTables[index];
      const slot = this.runIndexes[index];
      const tag = this.runTags[index];
      const entry = table[slot];
      let count = 1;
      let mixed = 0;
      if (entry !== 0 && ((entry >>> 16) & 0xff) === tag) {
        if ((entry & 0xff) === byte) {
          count = Math.min(RUN_COUNT_LIMIT, ((entry >>> 8) & 0x7f) + 1);
          mixed = (entry >>> 15) & 1;
        } else {
          count = 0;
          mixed = 1;
        }
      }
      table[slot] = (byte | (count << 8) | (mixed << 15) | (tag << 16)) >>> 0;
    }
  }

  private apmOrder1Context(): number {
    return (this.c0 & 0xff) | ((this.history.length > 0 ? this.history[0] : 0) << 8);
  }

  private apmOrder2Context(): number {
    const c1 = this.history.length > 0 ? this.history[0] : 0;
    const c2 = this.history.length > 1 ? this.history[1] : 0;
    const hash = Math.imul((c1 | (c2 << 8)) + 1, 0x9e3779b1) >>> 16;
    return (hash ^ (this.c0 & 0xff)) & 0xffff;
  }

  private hashHistory(order: number): number {
    let hash = (FNV_OFFSET_BASIS ^ order ^ (this.history.length << 24)) >>> 0;
    for (let index = 0; index < order; index++) {
      const value = index < this.history.length ? this.history[index] + 1 : 0;
      hash = Math.imul(hash ^ value ^ (index << 8), FNV_PRIME) >>> 0;
    }
    return hash;
  }

  /** Reads line state, so it must run after `updateColumnState` has consumed the byte. */
  private prepareByteContexts(): void {
    this.historyHashes[0] = 0x243f6a88;
    for (let index = 1; index < BASE_MODEL_COUNT - 1; index++) {
      this.historyHashes[index] = this.hashHistory(MODEL_ORDERS[index]);
    }
    this.historyHashes[BASE_MODEL_COUNT - 1] = (
      this.wordLength === 0
        ? 0x9e3779b9
        : (this.wordHash ^ Math.imul(this.wordLength, 0x85ebca6b))
    ) >>> 0;

    const byte1 = this.history.length > 0 ? this.history[0] + 1 : 0;
    const byte2 = this.history.length > 1 ? this.history[1] + 1 : 0;
    let hash = mixHash(FNV_OFFSET_BASIS, 0xa3);
    hash = mixHash(hash, this.lineFirstByte + 1);
    hash = mixHash(hash, Math.min(this.lineIndent, 63) + (this.lineInIndent ? 64 : 0));
    hash = mixHash(hash, byte1);
    this.historyHashes[LINETYPE_MODEL_INDEX] = mixHash(hash, byte2);
    const word = this.historyHashes[BASE_MODEL_COUNT - 1];
    this.historyHashes[PREVIOUS_WORD_MODEL_INDEX] = (word ^ Math.imul(this.previousWord, 0x85ebca6b)) >>> 0;
    this.historyHashes[PREVIOUS_TWO_WORDS_MODEL_INDEX] = (
      word ^ Math.imul(this.previousWord, 0x85ebca6b) ^ Math.imul(this.previousWord2, 0xc2b2ae35)
    ) >>> 0;
    this.historyHashes[CLASS_MODEL_INDEX] = (
      Math.imul(this.classHash, 0x9e3779b1) ^ Math.imul((this.history[0] ?? 0) + 1, 0x85ebca6b)
    ) >>> 0;
    let numberHistory = FNV_OFFSET_BASIS;
    for (let index = 0; index < this.history.length; index++) {
      const byte = this.history[index];
      numberHistory = mixHash(numberHistory, byte >= 48 && byte <= 57 ? 48 : byte);
    }
    this.historyHashes[NUMBER_MODEL_INDEX] = numberHistory;
    this.historyHashes[SYMBOL_MODEL_INDEX] = mixHash(this.symbolHistory, byte1);
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
      this.lineIndent = 0;
      this.lineInIndent = true;
      this.lineFirstByte = 256;
      this.beginColumnRow();
    } else {
      if (this.columnCurrentLineBytes.length < COLUMN_MAX_LINE_BYTES) {
        this.columnCurrentLineBytes.push(byte);
      }
      this.columnCurrentLength++;
      if (byte === PIPE_BYTE) this.columnCurrentPipes++;
      else if (byte === COMMA_BYTE) this.columnCurrentCommas++;
      if (this.lineFirstByte === 256) this.lineFirstByte = byte;
      if (this.lineInIndent) {
        if (byte === SPACE_BYTE || byte === TAB_BYTE) this.lineIndent++;
        else this.lineInIndent = false;
      }
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

  /** Deterministic and run experts start at zero weight; the mixers learn when to trust them. */
  private initializeWeightSet(offset: number): void {
    for (let index = 0; index < MODEL_COUNT; index++) {
      this.weights[offset + index] = divideRound(MIXER_WEIGHT_SCALE, BASE_MODEL_COUNT);
    }
    this.weights[offset + MODEL_COUNT] = MIXER_WEIGHT_SCALE;
    this.weights[offset + MODEL_COUNT + 1] = MIXER_WEIGHT_SCALE;
    this.weights[offset + COLUMN_INPUT_INDEX] = divideRound(MIXER_WEIGHT_SCALE, BASE_MODEL_COUNT);
  }

  predict(): number {
    const inputs = this.cachedStretches;
    let found = 0;
    for (let index = 0; index < MODEL_COUNT; index++) {
      const slotHash = (
        Math.imul(this.historyHashes[index], 0x9e3779b1)
        ^ Math.imul(this.c0, 0x85ebca6b)
      ) >>> 0;
      const slotIndex = index === 0 ? this.c0
        : index === 1 ? ((this.history[0] ?? 0) << 8) | this.c0
        : slotHash >>> (index > LINETYPE_MODEL_INDEX ? LEXICAL_TABLE_SHIFT : TABLE_SHIFT);
      const tag = slotHash & 0xff;
      const packed = this.tables[index][slotIndex];
      const hit = packed !== 0 && ((packed >>> 18) & 0xff) === tag;
      if (hit && index > 0) found++;
      const stretched = stretchTable[hit ? packed & 0x0fff : 2048];
      this.cachedIndexes[index] = slotIndex;
      this.cachedTags[index] = tag;
      inputs[index] = stretched;

      const flags = hit ? (packed >>> 26) & 3 : 0;
      inputs[DET_INPUT_INDEX + index] = flags === 1 || flags === 2 ? stretched : 0;

      const runByte = this.runBytes[index];
      let runInput = 0;
      if (runByte !== 0 && (runByte >>> (this.bitShift + 1)) === this.c0) {
        runInput = ((runByte >>> this.bitShift) & 1) === 1 ? this.runStrengths[index] : -this.runStrengths[index];
      }
      inputs[RUN_INPUT_INDEX + index] = runInput;
    }
    this.foundCount = Math.min(found, 7);

    this.cachedMatchBit = -1;
    this.matchState = 0;
    inputs[MODEL_COUNT] = 0;
    inputs[MODEL_COUNT + 1] = 0;
    if (this.isReadableMatchPosition(this.matchPosition)) {
      const matchBit = (this.matchByteAt(this.matchPosition) >>> this.bitShift) & 1;
      const direction = matchBit === 1 ? 1 : -1;
      const cappedMatchLength = Math.min(this.matchLength, 32);
      this.cachedMatchBit = matchBit;
      this.matchState = this.matchLength < 16 ? 1 : this.matchLength < 32 ? 2 : 3;
      inputs[MODEL_COUNT] = direction * cappedMatchLength * 64;
      inputs[MODEL_COUNT + 1] = direction * Math.max(0, cappedMatchLength - 11) * 64;
    }

    this.columnSlotIndex = -1;
    inputs[COLUMN_INPUT_INDEX] = 0;
    if (this.columnHash !== 0) {
      const slotHash = (
        Math.imul(this.columnHash, 0x9e3779b1)
        ^ Math.imul(this.c0, 0x85ebca6b)
      ) >>> 0;
      const slotIndex = slotHash >>> TABLE_SHIFT;
      const tag = slotHash & 0xff;
      this.columnSlotIndex = slotIndex;
      this.columnTag = tag;
      inputs[COLUMN_INPUT_INDEX] = stretchTable[taggedSlotProbability(this.columnTable[slotIndex], tag)];
    }

    const weights = this.weights;
    const active = this.activeInputs;
    let activeCount = 0;
    for (let index = 0; index < MIXER_INPUT_COUNT; index++) {
      if (inputs[index] !== 0) active[activeCount++] = index;
    }
    this.activeInputCount = activeCount;

    const c0 = this.c0 & 0xff;
    const c1 = this.history.length > 0 ? this.history[0] : 0;
    for (let mixer = 0; mixer < FIRST_LAYER_MIXERS; mixer++) {
      const set = mixer === 0 ? (this.foundCount << 2) | this.matchState : C1_SET_BASE + c1;
      const offset = set * MIXER_INPUT_COUNT;
      if (this.initializedSets[set] === 0) {
        this.initializeWeightSet(offset);
        this.initializedSets[set] = 1;
      }
      let dot = 0;
      for (let slot = 0; slot < activeCount; slot++) {
        const index = active[slot];
        dot += weights[offset + index] * inputs[index];
      }
      const rounded = divideRound(dot, MIXER_WEIGHT_SCALE);
      const stretch = rounded > STRETCH_LIMIT ? STRETCH_LIMIT : rounded < -STRETCH_LIMIT ? -STRETCH_LIMIT : rounded;
      this.mixerOffsets[mixer] = offset;
      this.mixerStretches[mixer] = stretch;
      this.mixerProbabilities[mixer] = squashStretch(stretch);
    }

    const finalOffset = c0 * FIRST_LAYER_MIXERS;
    if (this.finalInitialized[c0] === 0) {
      for (let mixer = 0; mixer < FIRST_LAYER_MIXERS; mixer++) {
        this.finalWeights[finalOffset + mixer] = divideRound(MIXER_WEIGHT_SCALE, FIRST_LAYER_MIXERS);
      }
      this.finalInitialized[c0] = 1;
    }
    let finalDot = 0;
    for (let mixer = 0; mixer < FIRST_LAYER_MIXERS; mixer++) {
      finalDot += this.finalWeights[finalOffset + mixer] * this.mixerStretches[mixer];
    }
    this.finalOffset = finalOffset;
    this.residualOffset = ((this.previousClass << 8) | c0) * MIXER_INPUT_COUNT;
    for (let slot = 0; slot < activeCount; slot++) {
      const index = active[slot];
      finalDot += this.residualWeights[this.residualOffset + index] * inputs[index];
    }
    const mixed = squashStretch(divideRound(finalDot, MIXER_WEIGHT_SCALE));
    this.cachedRawProbability = mixed;

    const first = (mixed + 3 * this.apmOrder1.refine(mixed, this.apmOrder1Context()) + 2) >> 2;
    return (first + 3 * this.apmOrder2.refine(first, this.apmOrder2Context()) + 2) >> 2;
  }

  update(bit: number): void {
    const weights = this.weights;
    const inputs = this.cachedStretches;
    const active = this.activeInputs;
    const activeCount = this.activeInputCount;
    const half = MIXER_LEARNING_DIVISOR >> 1;
    for (let mixer = 0; mixer < FIRST_LAYER_MIXERS; mixer++) {
      const error = bit * 4096 - this.mixerProbabilities[mixer];
      if (error === 0) continue;
      const offset = this.mixerOffsets[mixer];
      for (let slot = 0; slot < activeCount; slot++) {
        const index = active[slot];
        const product = error * inputs[index];
        // divideRound inlined: |product| < 2^31, so truncating the exact-enough quotient equals floor.
        const step = product >= 0
          ? ((product + half) / MIXER_LEARNING_DIVISOR) | 0
          : -(((half - product) / MIXER_LEARNING_DIVISOR) | 0);
        const nextWeight = weights[offset + index] + step;
        weights[offset + index] = nextWeight > MIXER_WEIGHT_LIMIT ? MIXER_WEIGHT_LIMIT
          : nextWeight < -MIXER_WEIGHT_LIMIT ? -MIXER_WEIGHT_LIMIT : nextWeight;
      }
    }
    const finalError = bit * 4096 - this.cachedRawProbability;
    for (let slot = 0; slot < activeCount; slot++) {
      const index = active[slot];
      const weightIndex = this.residualOffset + index;
      const product = finalError * inputs[index];
      const step = product >= 0
        ? ((product + MIXER_LEARNING_DIVISOR) / (MIXER_LEARNING_DIVISOR * 2)) | 0
        : -(((MIXER_LEARNING_DIVISOR - product) / (MIXER_LEARNING_DIVISOR * 2)) | 0);
      const nextWeight = this.residualWeights[weightIndex] + step;
      this.residualWeights[weightIndex] = nextWeight > MIXER_WEIGHT_LIMIT ? MIXER_WEIGHT_LIMIT
        : nextWeight < -MIXER_WEIGHT_LIMIT ? -MIXER_WEIGHT_LIMIT : nextWeight;
    }
    for (let mixer = 0; mixer < FIRST_LAYER_MIXERS; mixer++) {
      const index = this.finalOffset + mixer;
      const nextWeight = this.finalWeights[index] + divideRound(
        finalError * this.mixerStretches[mixer],
        MIXER_LEARNING_DIVISOR,
      );
      this.finalWeights[index] = Math.max(-MIXER_WEIGHT_LIMIT, Math.min(MIXER_WEIGHT_LIMIT, nextWeight));
    }
    this.apmOrder1.update(bit);
    this.apmOrder2.update(bit);

    for (let index = 0; index < MODEL_COUNT; index++) {
      const slotIndex = this.cachedIndexes[index];
      const tag = this.cachedTags[index];
      const packed = this.tables[index][slotIndex];
      const matchingState = packed !== 0 && ((packed >>> 18) & 0xff) === tag ? packed : 0;
      const flags = ((matchingState >>> 26) & 3) | (1 << bit);
      this.tables[index][slotIndex] = (
        updatePackedState(matchingState & 0x3ffffff, bit) | (tag << 18) | (flags << 26)
      ) >>> 0;
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
      const foldedByte = byte >= 65 && byte <= 90 ? byte + 32 : byte;
      this.wordHash = Math.imul(this.wordHash ^ foldedByte, FNV_PRIME) >>> 0;
      this.wordLength = Math.min(255, this.wordLength + 1);
    } else {
      if (this.wordLength > 0) {
        this.previousWord2 = this.previousWord;
        this.previousWord = this.wordHash;
      }
      this.wordHash = 0;
      this.wordLength = 0;
    }

    const cls = byte >= 97 && byte <= 122 ? 1 : byte >= 65 && byte <= 90 ? 2
      : byte >= 48 && byte <= 57 ? 3 : byte === 32 ? 4 : byte === 10 ? 5 : byte < 32 ? 6 : 7;
    this.classHash = ((this.classHash << 3) | cls) & 0x7fff;
    this.previousClass = cls;
    if (!isWordByte(byte) && byte !== SPACE_BYTE && byte !== TAB_BYTE) {
      this.symbolHistory = ((this.symbolHistory << 8) | byte) >>> 0;
    }
    this.updateRuns(byte);
    this.c0 = 1;
    this.bitShift = 7;
    this.updateColumnState(byte);
    this.prepareByteContexts();
    this.loadRuns();
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

