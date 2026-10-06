import fs from 'node:fs';

// Research-only source transformations. Never imported by the production codec.
const base=fs.readFileSync(new URL('../../src/lib/payload/arx6-model.ts', import.meta.url),'utf8');
const direct=s=>s.replace('() => new Uint32Array(TABLE_SIZE),','(_, index) => new Uint32Array(index === 0 ? 256 : index === 1 ? 65536 : TABLE_SIZE),').replace('const slotIndex = slotHash >>> TABLE_SHIFT;', 'const slotIndex = index === 0 ? this.c0 : index === 1 ? ((this.history[0] ?? 0) << 8) | this.c0 : slotHash >>> TABLE_SHIFT;');
const match=(s,n)=>s.replace('const MATCH_HASH_BYTES = 7;',`const MATCH_HASH_BYTES = ${n};`);
function contexts(s, words, cls) {
 const n=words+(cls?1:0);
 s=s.replace('const MODEL_COUNT = BASE_MODEL_COUNT + 1;',`const MODEL_COUNT = BASE_MODEL_COUNT + ${1+n};`);
 s=s.replace('private wordLength = 0;', 'private wordLength = 0;\n  private previousWord = 0;\n  private previousWord2 = 0;\n  private classHash = 0;');
 let h='';
 if(words>=1)h+='\n    this.historyHashes[BASE_MODEL_COUNT + 1] = (this.historyHashes[BASE_MODEL_COUNT - 1] ^ Math.imul(this.previousWord, 0x85ebca6b)) >>> 0;';
 if(words>=2)h+='\n    this.historyHashes[BASE_MODEL_COUNT + 2] = (this.historyHashes[BASE_MODEL_COUNT - 1] ^ Math.imul(this.previousWord, 0x85ebca6b) ^ Math.imul(this.previousWord2, 0xc2b2ae35)) >>> 0;';
 if(cls)h+=`\n    this.historyHashes[BASE_MODEL_COUNT + ${words+1}] = (Math.imul(this.classHash, 0x9e3779b1) ^ Math.imul((this.history[0] ?? 0) + 1, 0x85ebca6b)) >>> 0;`;
 s=s.replace('this.historyHashes[LINETYPE_MODEL_INDEX] = mixHash(hash, byte2);','this.historyHashes[LINETYPE_MODEL_INDEX] = mixHash(hash, byte2);'+h);
 s=s.replace('this.wordHash = 0;\n      this.wordLength = 0;', 'if (this.wordLength > 0) { this.previousWord2 = this.previousWord; this.previousWord = this.wordHash; }\n      this.wordHash = 0;\n      this.wordLength = 0;');
 s=s.replace('this.updateRuns(byte);', 'const cls = byte >= 97 && byte <= 122 ? 1 : byte >= 65 && byte <= 90 ? 2 : byte >= 48 && byte <= 57 ? 3 : byte === 32 ? 4 : byte === 10 ? 5 : byte < 32 ? 6 : 7;\n    this.classHash = ((this.classHash << 3) | cls) & 0x7fff;\n    this.updateRuns(byte);');
 return s;
}
const variants={baseline:base,direct:direct(base),match4:match(base,4),direct_match4:match(direct(base),4),word1:contexts(base,1,false),words:contexts(base,2,false),classes:contexts(base,0,true),lexical:contexts(base,2,true),combined:contexts(match(direct(base),4),2,true)};
function directRuns(s){return s.replace('() => new Uint32Array(1 << RUN_TABLE_BITS),','(_, index) => new Uint32Array(index === 0 ? 1 : index === 1 ? 257 : 1 << RUN_TABLE_BITS),').replace('const slot = hash >>> (32 - RUN_TABLE_BITS);','const slot = index === 0 ? 0 : index === 1 ? (this.history[0] ?? -1) + 1 : hash >>> (32 - RUN_TABLE_BITS);');}
function syntaxMixer(s){return s.replace('const FIRST_LAYER_SET_COUNT = ORDER_SET_COUNT + 256;', 'const FIRST_LAYER_SET_COUNT = ORDER_SET_COUNT + 256 + 2048;').replace('const FIRST_LAYER_MIXERS = 2;','const FIRST_LAYER_MIXERS = 3;').replace('const set = mixer === 0 ? (this.foundCount << 2) | this.matchState : C1_SET_BASE + c1;', 'const cls = c1 >= 97 && c1 <= 122 ? 1 : c1 >= 65 && c1 <= 90 ? 2 : c1 >= 48 && c1 <= 57 ? 3 : c1 === 32 ? 4 : c1 === 10 ? 5 : c1 < 32 ? 6 : 7;\n      const set = mixer === 0 ? (this.foundCount << 2) | this.matchState : mixer === 1 ? C1_SET_BASE + c1 : C1_SET_BASE + 256 + (cls << 8) + c0;');}
function utf8Class(s){return s.replace('byte < 32 ? 6 : 7;','byte < 32 ? 6 : byte < 128 ? 7 : byte < 192 ? 8 : byte < 224 ? 9 : byte < 240 ? 10 : 11;').replace('((this.classHash << 3) | cls) & 0x7fff','((this.classHash << 4) | cls) & 0xfffff');}
const lexical=contexts(directRuns(direct(base)),2,true);
const extra={direct_runs:directRuns(direct(base)),classes_direct:contexts(directRuns(direct(base)),0,true),lexical_direct:lexical,lexical_match5:match(lexical,5),lexical_match6:match(lexical,6),syntax:syntaxMixer(base),lexical_syntax:syntaxMixer(lexical),lexical_utf8:utf8Class(lexical)};
function residual(s){s=s.replace('private finalOffset = 0;', 'private finalOffset = 0;\n  private readonly residualWeights = new Int32Array(2048 * MIXER_INPUT_COUNT);\n  private residualOffset = 0;');s=s.replace('this.finalOffset = finalOffset;\n    const mixed', `this.finalOffset = finalOffset;
    const cls = c1 >= 97 && c1 <= 122 ? 1 : c1 >= 65 && c1 <= 90 ? 2 : c1 >= 48 && c1 <= 57 ? 3 : c1 === 32 ? 4 : c1 === 10 ? 5 : c1 < 32 ? 6 : 7;
    this.residualOffset = ((cls << 8) | c0) * MIXER_INPUT_COUNT;
    for (let slot = 0; slot < activeCount; slot++) { const index = active[slot]; finalDot += this.residualWeights[this.residualOffset + index] * inputs[index]; }
    const mixed`);s=s.replace('const finalError = bit * 4096 - this.cachedRawProbability;', `const finalError = bit * 4096 - this.cachedRawProbability;
    for (let slot = 0; slot < activeCount; slot++) { const index = active[slot], wi = this.residualOffset + index; this.residualWeights[wi] = Math.max(-MIXER_WEIGHT_LIMIT, Math.min(MIXER_WEIGHT_LIMIT, this.residualWeights[wi] + divideRound(finalError * inputs[index], MIXER_LEARNING_DIVISOR * 2))); }`);return s;}
function lineSignificant(s){return s.replace('if (this.lineFirstByte === 256) this.lineFirstByte = byte;','if (this.lineFirstByte === 256 && byte !== SPACE_BYTE && byte !== TAB_BYTE) this.lineFirstByte = byte;');}
function smallerLexical(s){return s.replace('index === 1 ? 65536 : TABLE_SIZE','index === 1 ? 65536 : index > LINETYPE_MODEL_INDEX ? 1 << 18 : TABLE_SIZE').replace('this.c0 : slotHash >>> TABLE_SHIFT;','this.c0 : slotHash >>> (index > LINETYPE_MODEL_INDEX ? 14 : TABLE_SHIFT);');}
const extra3={lexical_residual:residual(lexical),classes_syntax:syntaxMixer(contexts(directRuns(direct(base)),0,true)),lexical_significant:lineSignificant(syntaxMixer(lexical)),lexical_smaller:smallerLexical(syntaxMixer(lexical)),lexical_utf8_syntax:utf8Class(syntaxMixer(lexical))};
const extra4={residual:residual(directRuns(direct(base))),classes_residual:residual(contexts(directRuns(direct(base)),0,true)),lexical_residual_smaller:smallerLexical(residual(lexical)),lexical_residual_significant:lineSignificant(smallerLexical(residual(lexical)))};
const finalBase=smallerLexical(residual(lexical));
function sparse(s){return s.replace('const MODEL_COUNT = BASE_MODEL_COUNT + 4;','const MODEL_COUNT = BASE_MODEL_COUNT + 5;').replace('this.historyHashes[LINETYPE_MODEL_INDEX] = mixHash(hash, byte2);','this.historyHashes[LINETYPE_MODEL_INDEX] = mixHash(hash, byte2);\n    this.historyHashes[BASE_MODEL_COUNT + 4] = mixHash(mixHash(FNV_OFFSET_BASIS ^ 0xa7, byte1), (this.history[2] ?? -1) + 1);');}
function fullFound(s){return s.replace('const ORDER_SET_COUNT = 32;','const ORDER_SET_COUNT = MODEL_COUNT * 4;').replace('this.foundCount = Math.min(found, 7);','this.foundCount = found;');}
const extra5={lexical_sparse:sparse(finalBase),lexical_fullfound:fullFound(finalBase),lexical_normalized:finalBase.replaceAll('divideRound(MIXER_WEIGHT_SCALE, BASE_MODEL_COUNT)','divideRound(MIXER_WEIGHT_SCALE, MODEL_COUNT)'),lexical_fold:finalBase.replace('this.wordHash = Math.imul(this.wordHash ^ byte, FNV_PRIME) >>> 0;','this.wordHash = Math.imul(this.wordHash ^ (byte >= 65 && byte <= 90 ? byte + 32 : byte), FNV_PRIME) >>> 0;')};
function optimize(s){
 s=s.replace('private classHash = 0;','private classHash = 0;\n  private previousClass = 6;');
 s=s.replace('this.residualOffset = ((cls << 8) | c0) * MIXER_INPUT_COUNT;', 'this.residualOffset = ((this.previousClass << 8) | c0) * MIXER_INPUT_COUNT;');
 s=s.replace('const cls = c1 >= 97 && c1 <= 122 ? 1 : c1 >= 65 && c1 <= 90 ? 2 : c1 >= 48 && c1 <= 57 ? 3 : c1 === 32 ? 4 : c1 === 10 ? 5 : c1 < 32 ? 6 : 7;\n    this.residualOffset', 'this.residualOffset');
 s=s.replace('this.classHash = ((this.classHash << 3) | cls) & 0x7fff;', 'this.classHash = ((this.classHash << 3) | cls) & 0x7fff;\n    this.previousClass = cls;');
 s=s.replace('for (let slot = 0; slot < activeCount; slot++) { const index = active[slot], wi = this.residualOffset + index; this.residualWeights[wi] = Math.max(-MIXER_WEIGHT_LIMIT, Math.min(MIXER_WEIGHT_LIMIT, this.residualWeights[wi] + divideRound(finalError * inputs[index], MIXER_LEARNING_DIVISOR * 2))); }', `for (let slot = 0; slot < activeCount; slot++) {
      const index = active[slot];
      const weightIndex = this.residualOffset + index;
      const product = finalError * inputs[index];
      const step = product >= 0
        ? ((product + MIXER_LEARNING_DIVISOR) / (MIXER_LEARNING_DIVISOR * 2)) | 0
        : -(((MIXER_LEARNING_DIVISOR - product) / (MIXER_LEARNING_DIVISOR * 2)) | 0);
      const nextWeight = this.residualWeights[weightIndex] + step;
      this.residualWeights[weightIndex] = nextWeight > MIXER_WEIGHT_LIMIT ? MIXER_WEIGHT_LIMIT
        : nextWeight < -MIXER_WEIGHT_LIMIT ? -MIXER_WEIGHT_LIMIT : nextWeight;
    }`);
 return s;
}
const extra6={lexical_fold_optimized:optimize(extra5.lexical_fold),lexical_fold_significant:optimize(lineSignificant(extra5.lexical_fold))};

/** All considered model sources, including rejected alternatives, for reproducible ablations. */
export const modelCandidates = { ...variants, ...extra, ...extra3, ...extra4, ...extra5, ...extra6 };
