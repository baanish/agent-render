/**
 * EXPERIMENTAL ARX6 model derived from baanish/agent-render src/lib/payload/arx4-codec.ts
 * at 72fb152e0cf92a11ff658c3b0dd3916b387f3e98, entropy stage only.
 * Original MIT license belongs to the repository author.
 * ARX6 v1: raw structure, lexical/class contexts, residual syntax mixer, direct low-order tables.
 * Frozen model geometry is a protocol contract. Do not change under an existing version.
 */
const TABLE_BITS=20, TABLE_SIZE=1<<TABLE_BITS, TABLE_SHIFT=32-TABLE_BITS;
const MODEL_ORDERS=[0,1,2,3,4,6,-1,-2,-3,-4], MODEL_COUNT=MODEL_ORDERS.length;
const COLUMN_INPUT_INDEX=MODEL_COUNT+2, MIXER_INPUT_COUNT=COLUMN_INPUT_INDEX+1;
const MIXER_WEIGHT_SCALE=1<<12, MIXER_WEIGHT_LIMIT=4*MIXER_WEIGHT_SCALE;
const MIXER_LEARNING_DIVISOR=25600, STRETCH_LIMIT=2048;
const MATCH_HASH_BYTES=4, MATCH_TABLE_BITS=18, MATCH_TABLE_SIZE=1<<18;
const MATCH_BUFFER_SIZE=1<<19, MAX_MODEL_COUNT=31, HISTORY_BYTES=6;
const COLUMN_TABLE_SIZE=1<<20, COLUMN_MIN_DELIMITERS=2;
const COLUMN_MAX_FIELD_INDEX=31, COLUMN_MAX_FIELD_OFFSET=63, COLUMN_MAX_LINE_BYTES=1024;
const COLUMN_ABOVE_NONE=256, COLUMN_DOMAIN_TAG=0x54;
const NEWLINE_BYTE=10, PIPE_BYTE=124, COMMA_BYTE=44;
const FNV_OFFSET_BASIS=0x811c9dc5, FNV_PRIME=0x01000193;
export function divideRound(n,d) {
  if(n>=0) return Math.floor((n+Math.floor(d/2))/d);
  return -Math.floor((-n+Math.floor(d/2))/d);
}
function log2Q16(value) {
  const integerPart=31-Math.clz32(value);
  let normalized=BigInt(value)<<BigInt(31-integerPart), fraction=0;
  for(let bit=15;bit>=0;bit--) {
    normalized=(normalized*normalized)>>31n;
    if(normalized>=1n<<32n) { normalized>>=1n; fraction|=1<<bit; }
  }
  return integerPart*65536+fraction;
}
export const stretchTable=new Int16Array(4096);
for(let p=1;p<4096;p++) stretchTable[p]=divideRound((log2Q16(p)-log2Q16(4096-p))*45426,1<<24);
const squashTable=new Uint16Array(STRETCH_LIMIT*2+1);
for(let stretch=-STRETCH_LIMIT;stretch<=STRETCH_LIMIT;stretch++) {
  let low=1, high=4095;
  while(low<high) { const middle=(low+high)>>>1; if(stretchTable[middle]<stretch) low=middle+1; else high=middle; }
  const previous=Math.max(1,low-1);
  squashTable[stretch+STRETCH_LIMIT]=Math.abs(stretchTable[previous]-stretch)<=Math.abs(stretchTable[low]-stretch)?previous:low;
}
export function squashStretch(s) { return squashTable[Math.max(-STRETCH_LIMIT,Math.min(STRETCH_LIMIT,s))+STRETCH_LIMIT]; }
function updatePackedState(packed,bit) {
  const probability=packed===0?2048:packed&0xfff;
  const count=packed===0?0:(packed>>>12)&0x3f;
  const target=bit===1?4096:0;
  const numerator=count===MAX_MODEL_COUNT?target-probability:2*(target-probability);
  const denominator=count===MAX_MODEL_COUNT?32:2*count+3;
  const nextProbability=Math.max(1,Math.min(4095,probability+divideRound(numerator,denominator)));
  return nextProbability|(Math.min(MAX_MODEL_COUNT,count+1)<<12);
}
function taggedSlotProbability(packed,tag) { return packed===0||((packed>>>18)&0xff)!==tag?2048:packed&0xfff; }
function isWordByte(b) { return (b>=48&&b<=57)||(b>=65&&b<=90)||b===95||(b>=97&&b<=122); }
export class ContextMixModel {
  constructor() {
    this.tables=Array.from({length:MODEL_COUNT},(_,i)=>new Uint32Array(i===0?256:i===1?65536:TABLE_SIZE));
    this.weights=new Int32Array(256*MIXER_INPUT_COUNT);this.residualWeights=new Int32Array(2048*MIXER_INPUT_COUNT);this.residualOffset=0;
    this.initializedMixers=new Uint8Array(256);
    this.historyHashes=new Uint32Array(MODEL_COUNT);
    this.matchTable=new Uint32Array(MATCH_TABLE_SIZE);
    this.matchBuffer=new Uint8Array(MATCH_BUFFER_SIZE);
    this.columnTable=new Uint32Array(COLUMN_TABLE_SIZE);
    this.cachedIndexes=new Uint32Array(MODEL_COUNT);
    this.cachedTags=new Uint8Array(MODEL_COUNT);
    this.cachedStretches=new Int16Array(MIXER_INPUT_COUNT);
    this.history=[];this.byteCount=0;this.matchPosition=-1;this.matchLength=0;
    this.wordHash=0;this.wordLength=0;this.previousWord=0;this.previousWord2=0;this.classHash=0;this.c0=1;this.bitShift=7;
    this.cachedMixerOffset=0;this.cachedRawProbability=2048;this.cachedMatchBit=-1;
    this.columnLineStats=[];this.columnPreviousLineBytes=[];this.columnCurrentLineBytes=[];
    this.columnCurrentLength=0;this.columnCurrentPipes=0;this.columnCurrentCommas=0;
    this.columnRowActive=false;this.columnDelimiter=-1;this.columnFieldIndex=0;
    this.columnFieldOffset=0;this.columnPreviousFields=null;this.columnSlotIndex=-1;
    this.columnTag=0;this.columnHash=0;
    // Observational counters: not used by predictions or coding decisions.
    this.stats={bytes:0,newlines:0,columnBytes:0};
    this.prepareByteContexts();
  }
  hashHistory(order) {
    let hash=(FNV_OFFSET_BASIS^order^(this.history.length<<24))>>>0;
    for(let index=0;index<order;index++) {
      const value=index<this.history.length?this.history[index]+1:0;
      hash=Math.imul(hash^value^(index<<8),FNV_PRIME)>>>0;
    }
    return hash;
  }
  prepareByteContexts() {
    const word=(this.wordLength===0?0x9e3779b9:this.wordHash^Math.imul(this.wordLength,0x85ebca6b))>>>0;
    for(let i=0;i<MODEL_COUNT;i++){
      const order=MODEL_ORDERS[i];
      if(order===0)this.historyHashes[i]=0x243f6a88;
      else if(order>0)this.historyHashes[i]=this.hashHistory(order);
      else if(order===-1)this.historyHashes[i]=word;
      else if(order===-2)this.historyHashes[i]=(word^Math.imul(this.previousWord,0x85ebca6b))>>>0;
      else if(order===-3)this.historyHashes[i]=(word^Math.imul(this.previousWord,0x85ebca6b)^Math.imul(this.previousWord2,0xc2b2ae35))>>>0;
      else if(order===-4)this.historyHashes[i]=(Math.imul(this.classHash,0x9e3779b1)^Math.imul((this.history[0]??0)+1,0x85ebca6b))>>>0;
    }
  }
  matchByteAt(p) { return this.matchBuffer[p&(MATCH_BUFFER_SIZE-1)]; }
  isReadableMatchPosition(p) { return p>=0&&p<this.byteCount&&this.byteCount-p<=MATCH_BUFFER_SIZE; }
  matchHash(end) {
    let hash=FNV_OFFSET_BASIS;
    for(let offset=MATCH_HASH_BYTES-1;offset>=0;offset--) hash=Math.imul(hash^this.matchByteAt(end-offset),FNV_PRIME)>>>0;
    return hash>>>(32-MATCH_TABLE_BITS);
  }
  matchContextsEqual(left,right) {
    for(let offset=0;offset<MATCH_HASH_BYTES;offset++) if(this.matchByteAt(left-offset)!==this.matchByteAt(right-offset)) return false;
    return true;
  }
  updateMatch(byte) {
    const matchedWholeByte=this.matchPosition>=0;
    if(matchedWholeByte) { this.matchPosition++;this.matchLength=Math.min(255,this.matchLength+1); }
    const currentPosition=this.byteCount;
    this.matchBuffer[currentPosition&(MATCH_BUFFER_SIZE-1)]=byte;
    this.byteCount++;
    if(this.byteCount<MATCH_HASH_BYTES) return;
    const hash=this.matchHash(currentPosition), previousEnd=this.matchTable[hash]-1;
    this.matchTable[hash]=currentPosition+1;
    if(matchedWholeByte) return;
    const candidateNext=previousEnd+1;
    if(previousEnd>=MATCH_HASH_BYTES-1&&this.isReadableMatchPosition(candidateNext)&&this.matchContextsEqual(previousEnd,currentPosition)) {
      this.matchPosition=candidateNext;this.matchLength=MATCH_HASH_BYTES;
    } else { this.matchPosition=-1;this.matchLength=0; }
  }
  beginColumnRow() {
    this.columnRowActive=false;this.columnDelimiter=-1;this.columnFieldIndex=0;
    this.columnFieldOffset=0;this.columnPreviousFields=null;
    const previous=this.columnLineStats[0],older=this.columnLineStats[1];
    if(previous===undefined||older===undefined||previous.length===0||older.length===0) return;
    if(previous.pipes===older.pipes&&previous.pipes>=COLUMN_MIN_DELIMITERS) this.columnDelimiter=PIPE_BYTE;
    else if(previous.commas===older.commas&&previous.commas>=COLUMN_MIN_DELIMITERS) this.columnDelimiter=COMMA_BYTE;
    else return;
    this.columnRowActive=true;
    this.columnPreviousFields=this.splitColumnFields(this.columnPreviousLineBytes);
  }
  splitColumnFields(lineBytes) {
    const fields=[];let field=[];
    for(let index=0;index<lineBytes.length;index++) {
      const byte=lineBytes[index];
      if(byte===this.columnDelimiter) {
        fields.push(field);if(fields.length>COLUMN_MAX_FIELD_INDEX) return fields;
        field=[];continue;
      }
      if(field.length<=COLUMN_MAX_FIELD_OFFSET) field.push(byte);
    }
    fields.push(field);return fields;
  }
  updateColumnState(byte) {
    if(byte===NEWLINE_BYTE) {
      this.columnLineStats.unshift({length:this.columnCurrentLength,pipes:this.columnCurrentPipes,commas:this.columnCurrentCommas});
      if(this.columnLineStats.length>2) this.columnLineStats.length=2;
      this.columnPreviousLineBytes=this.columnCurrentLineBytes;this.columnCurrentLineBytes=[];
      this.columnCurrentLength=0;this.columnCurrentPipes=0;this.columnCurrentCommas=0;
      this.beginColumnRow();
    } else {
      if(this.columnCurrentLineBytes.length<COLUMN_MAX_LINE_BYTES) this.columnCurrentLineBytes.push(byte);
      this.columnCurrentLength++;
      if(byte===PIPE_BYTE) this.columnCurrentPipes++;else if(byte===COMMA_BYTE) this.columnCurrentCommas++;
      if(this.columnRowActive) {
        if(byte===this.columnDelimiter) {this.columnFieldIndex++;this.columnFieldOffset=0;}
        else this.columnFieldOffset++;
      }
    }
    this.columnHash=this.columnContextHash();
  }
  columnContextHash() {
    if(!this.columnRowActive) return 0;
    const fieldIndex=Math.min(this.columnFieldIndex,COLUMN_MAX_FIELD_INDEX);
    const fieldOffset=Math.min(this.columnFieldOffset,COLUMN_MAX_FIELD_OFFSET);
    const field=this.columnPreviousFields===null?undefined:this.columnPreviousFields[fieldIndex];
    const above=field!==undefined&&fieldOffset<field.length?field[fieldOffset]:COLUMN_ABOVE_NONE;
    let hash=FNV_OFFSET_BASIS;
    hash=Math.imul(hash^COLUMN_DOMAIN_TAG,FNV_PRIME)>>>0;
    hash=Math.imul(hash^(fieldIndex+1),FNV_PRIME)>>>0;
    hash=Math.imul(hash^(fieldOffset+1),FNV_PRIME)>>>0;
    hash=Math.imul(hash^(above+1),FNV_PRIME)>>>0;
    return hash===0?1:hash;
  }
  predict() {
    const mixerContext=this.c0&0xff, mixerOffset=mixerContext*MIXER_INPUT_COUNT;
    if(this.initializedMixers[mixerContext]===0) {
      for(let index=0;index<MODEL_COUNT;index++) this.weights[mixerOffset+index]=divideRound(MIXER_WEIGHT_SCALE,MODEL_COUNT);
      this.weights[mixerOffset+MODEL_COUNT]=MIXER_WEIGHT_SCALE;
      this.weights[mixerOffset+MODEL_COUNT+1]=MIXER_WEIGHT_SCALE;
      this.weights[mixerOffset+COLUMN_INPUT_INDEX]=divideRound(MIXER_WEIGHT_SCALE,MODEL_COUNT);
      this.initializedMixers[mixerContext]=1;
    }
    let mixedStretch=0;
    for(let index=0;index<MODEL_COUNT;index++) {
      const slotHash=(Math.imul(this.historyHashes[index],0x9e3779b1)^Math.imul(this.c0,0x85ebca6b))>>>0;
      const slotIndex=index===0?this.c0:index===1?(((this.history[0]??0)<<8)|this.c0):slotHash>>>TABLE_SHIFT,tag=slotHash&0xff;
      const stretched=stretchTable[taggedSlotProbability(this.tables[index][slotIndex],tag)];
      this.cachedIndexes[index]=slotIndex;this.cachedTags[index]=tag;this.cachedStretches[index]=stretched;
      mixedStretch+=this.weights[mixerOffset+index]*stretched;
    }
    this.cachedMatchBit=-1;this.cachedStretches[MODEL_COUNT]=0;this.cachedStretches[MODEL_COUNT+1]=0;
    if(this.isReadableMatchPosition(this.matchPosition)) {
      const matchBit=(this.matchByteAt(this.matchPosition)>>>this.bitShift)&1;
      const direction=matchBit===1?1:-1,cappedMatchLength=Math.min(this.matchLength,32);
      this.cachedMatchBit=matchBit;
      this.cachedStretches[MODEL_COUNT]=direction*cappedMatchLength*64;
      this.cachedStretches[MODEL_COUNT+1]=direction*Math.max(0,cappedMatchLength-11)*64;
      mixedStretch+=this.weights[mixerOffset+MODEL_COUNT]*this.cachedStretches[MODEL_COUNT]+this.weights[mixerOffset+MODEL_COUNT+1]*this.cachedStretches[MODEL_COUNT+1];
    }
    this.columnSlotIndex=-1;this.cachedStretches[COLUMN_INPUT_INDEX]=0;
    if(this.columnHash!==0) {
      const slotHash=(Math.imul(this.columnHash,0x9e3779b1)^Math.imul(this.c0,0x85ebca6b))>>>0;
      const slotIndex=slotHash>>>TABLE_SHIFT,tag=slotHash&0xff;
      const stretched=stretchTable[taggedSlotProbability(this.columnTable[slotIndex],tag)];
      this.columnSlotIndex=slotIndex;this.columnTag=tag;this.cachedStretches[COLUMN_INPUT_INDEX]=stretched;
      mixedStretch+=this.weights[mixerOffset+COLUMN_INPUT_INDEX]*stretched;
    }
    const prev=this.history[0]??0;
    const cls=prev>=97&&prev<=122?1:prev>=65&&prev<=90?2:prev>=48&&prev<=57?3:prev===32?4:prev===10?5:prev<32?6:7;
    this.residualOffset=((cls<<8)|(this.c0&255))*MIXER_INPUT_COUNT;
    for(let i=0;i<MIXER_INPUT_COUNT;i++)mixedStretch+=this.residualWeights[this.residualOffset+i]*this.cachedStretches[i];
    const rawProbability=squashStretch(divideRound(mixedStretch,MIXER_WEIGHT_SCALE));
    this.cachedMixerOffset=mixerOffset;this.cachedRawProbability=rawProbability;return rawProbability;
  }
  update(bit) {
    const error=bit*4096-this.cachedRawProbability;
    for(let i=0;i<MIXER_INPUT_COUNT;i++){const j=this.residualOffset+i;this.residualWeights[j]=Math.max(-MIXER_WEIGHT_LIMIT,Math.min(MIXER_WEIGHT_LIMIT,this.residualWeights[j]+divideRound(error*this.cachedStretches[i],MIXER_LEARNING_DIVISOR*2)));}
    for(let index=0;index<MIXER_INPUT_COUNT;index++) {
      const wi=this.cachedMixerOffset+index;
      const nw=this.weights[wi]+divideRound(error*this.cachedStretches[index],MIXER_LEARNING_DIVISOR);
      this.weights[wi]=Math.max(-MIXER_WEIGHT_LIMIT,Math.min(MIXER_WEIGHT_LIMIT,nw));
    }
    for(let index=0;index<MODEL_COUNT;index++) {
      const si=this.cachedIndexes[index],tag=this.cachedTags[index],packed=this.tables[index][si];
      const state=packed!==0&&((packed>>>18)&0xff)===tag?packed:0;
      this.tables[index][si]=updatePackedState(state,bit)|(tag<<18);
    }
    if(this.columnSlotIndex>=0) {
      const packed=this.columnTable[this.columnSlotIndex];
      const state=packed!==0&&((packed>>>18)&0xff)===this.columnTag?packed:0;
      this.columnTable[this.columnSlotIndex]=updatePackedState(state,bit)|(this.columnTag<<18);
    }
    if(this.cachedMatchBit>=0&&bit!==this.cachedMatchBit) { this.matchPosition=-1;this.matchLength=0; }
    this.c0=(this.c0<<1)|bit;this.bitShift--;
  }
  finishByte(byte) {
    this.stats.bytes++;if(byte===10)this.stats.newlines++;if(this.columnRowActive)this.stats.columnBytes++;
    this.updateMatch(byte);this.history.unshift(byte);if(this.history.length>HISTORY_BYTES)this.history.length=HISTORY_BYTES;
    if(isWordByte(byte)) {
      if(this.wordLength===0)this.wordHash=FNV_OFFSET_BASIS;
      this.wordHash=Math.imul(this.wordHash^byte,FNV_PRIME)>>>0;
      this.wordLength=Math.min(255,this.wordLength+1);
    } else {if(this.wordLength){this.previousWord2=this.previousWord;this.previousWord=this.wordHash;}this.wordHash=0;this.wordLength=0;}
    const cls=byte>=97&&byte<=122?1:byte>=65&&byte<=90?2:byte>=48&&byte<=57?3:byte===32?4:byte===10?5:byte<32?6:7;
    this.classHash=((this.classHash<<3)|cls)&0x7fff;
    this.c0=1;this.bitShift=7;this.prepareByteContexts();this.updateColumnState(byte);
  }
  processKnownByte(byte,consumePrediction) {
    for(let shift=7;shift>=0;shift--) {
      const p=this.predict(),bit=(byte>>>shift)&1;
      consumePrediction(p,bit);this.update(bit);
    }
    this.finishByte(byte);
  }
  processDecodedByte(readBit) {
    let byte=0;
    for(let shift=7;shift>=0;shift--) {
      const p=this.predict(),bit=readBit(p);byte|=bit<<shift;this.update(bit);
    }
    this.finishByte(byte);return byte;
  }
}
export class BinaryArithmeticEncoder {
  constructor(){this.x1=0;this.x2=0xffffffff;this.output=[];}
  writeBit(bit,p){
    const mid=this.x1+Math.floor((this.x2-this.x1)/4096)*p;
    if(mid<this.x1||mid>this.x2)throw Error('midpoint');
    if(bit===1)this.x2=mid>>>0;else this.x1=(mid+1)>>>0;
    while(((this.x1^this.x2)&0xff000000)===0){this.output.push(this.x2>>>24);this.x1=(this.x1<<8)>>>0;this.x2=((this.x2<<8)|255)>>>0;}
  }
  finish(){this.output.push(this.x1>>>24,(this.x1>>>16)&255,(this.x1>>>8)&255,this.x1&255);return Uint8Array.from(this.output);}
}
export class BinaryArithmeticDecoder {
  constructor(input){if(input.length<4)throw Error('short arithmetic payload');this.input=input;this.offset=4;this.x1=0;this.x2=0xffffffff;this.x=(input[0]*0x1000000+input[1]*0x10000+input[2]*0x100+input[3])>>>0;}
  readByte(){if(this.offset>=this.input.length)throw Error('arithmetic decoder exhausted');return this.input[this.offset++];}
  readBit(p){
    const mid=this.x1+Math.floor((this.x2-this.x1)/4096)*p;
    if(mid<this.x1||mid>this.x2)throw Error('midpoint');
    const bit=this.x<=mid?1:0;
    if(bit===1)this.x2=mid>>>0;else this.x1=(mid+1)>>>0;
    while(((this.x1^this.x2)&0xff000000)===0){this.x1=(this.x1<<8)>>>0;this.x2=((this.x2<<8)|255)>>>0;this.x=((this.x<<8)|this.readByte())>>>0;}
    return bit;
  }
}
export function encodeVarint(v){const bytes=[];do{let byte=v%128;v=Math.floor(v/128);if(v>0)byte|=128;bytes.push(byte);}while(v>0);return bytes;}
export function decodeVarint(input){let value=0,multiplier=1;for(let offset=0;offset<input.length&&offset<8;offset++){const byte=input[offset];value+=(byte&127)*multiplier;if(!(byte&128))return{value,bytesRead:offset+1};multiplier*=128;}throw Error('invalid varint');}
export function encodeCm(input,prime=null,Model=ContextMixModel){
  const model=new Model();if(prime)for(const byte of prime)model.processKnownByte(byte,()=>{});
  model.stats={bytes:0,newlines:0,columnBytes:0};
  const coder=new BinaryArithmeticEncoder();
  for(const byte of input)model.processKnownByte(byte,(p,b)=>coder.writeBit(b,p));
  const prefix=encodeVarint(input.length),coded=coder.finish(),out=new Uint8Array(prefix.length+coded.length);
  out.set(prefix);out.set(coded,prefix.length);return{bytes:out,stats:model.stats};
}
export function decodeCm(input,prime=null,Model=ContextMixModel){
  const{value,bytesRead}=decodeVarint(input);
  if(!Number.isSafeInteger(value)||value<0||value>800000)throw Error('decoded length exceeds limit');
  const model=new Model();if(prime)for(const byte of prime)model.processKnownByte(byte,()=>{});
  const coder=new BinaryArithmeticDecoder(input.subarray(bytesRead)),out=new Uint8Array(value);
  for(let i=0;i<value;i++)out[i]=model.processDecodedByte(p=>coder.readBit(p));if(coder.offset!==coder.input.length)throw Error("trailing arithmetic bytes");return out;
}
