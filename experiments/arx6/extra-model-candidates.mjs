/** General context ablations frozen before the separate 27-case external holdout. */
import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
const source = readFileSync(new URL('../../src/lib/payload/arx6-v2-model.ts', import.meta.url), 'utf8');
const baselineSha = createHash('sha256').update(source).digest('hex');
if (baselineSha !== '4be96ce00bb36c518c6e2ece06b07ebcdb1a3a22dd8966d2dc0fc3b8228058b5') throw new Error('Frozen g2 model changed; refuse to silently change the experimental baseline.');
const mods={baseline:source};
mods.non_ascii_words=source.replace('(byte >= 0x30 && byte <= 0x39)','byte >= 0x80\n    || (byte >= 0x30 && byte <= 0x39)');
mods.order8=source.replace('[0, 1, 2, 3, 4, 6, -1]','[0, 1, 2, 3, 4, 6, 8, -1]').replace('const HISTORY_BYTES = 6','const HISTORY_BYTES = 8');
function extra(src,hash,state='',update=''){
 return src.replace('const MODEL_COUNT = CLASS_MODEL_INDEX + 1;','const EXTRA_MODEL_INDEX = CLASS_MODEL_INDEX + 1;\nconst MODEL_COUNT = EXTRA_MODEL_INDEX + 1;')
 .replace('  private wordHash = 0;',state+'\n  private wordHash = 0;')
 .replace('  private matchByteAt(position: number): number {','  private matchByteAt(position: number): number {')
 .replace('  }\n\n  private matchByteAt(position: number): number {',`    this.historyHashes[EXTRA_MODEL_INDEX] = ${hash};\n  }\n\n  private matchByteAt(position: number): number {`)
 .replace('    this.updateRuns(byte);',update+'\n    this.updateRuns(byte);');
}
mods.folded_history=extra(source,'this.history.slice(0, 4).reduce((h,b)=>mixHash(h,b>=65&&b<=90?b+32:b), FNV_OFFSET_BASIS)');
mods.number_history=extra(source,'this.history.slice(0, 6).reduce((h,b)=>mixHash(h,b>=48&&b<=57?48:b), FNV_OFFSET_BASIS)');
mods.bracket_context=extra(source,'mixHash(mixHash(mixHash(FNV_OFFSET_BASIS,this.bracketStack.length),this.bracketStack.at(-1)??0),byte1|(byte2<<9))','  private bracketStack: number[] = [];',`    if (byte===40||byte===91||byte===123) { if(this.bracketStack.length<63)this.bracketStack.push(byte); }
    else if(byte===41||byte===93||byte===125) { if(this.bracketStack.at(-1)===(byte===41?40:byte-2))this.bracketStack.pop(); }`);
mods.mixer_bias=source.replace('const MIXER_INPUT_COUNT = RUN_INPUT_INDEX + MODEL_COUNT;', 'const BIAS_INPUT_INDEX = RUN_INPUT_INDEX + MODEL_COUNT;\nconst MIXER_INPUT_COUNT = BIAS_INPUT_INDEX + 1;').replace('    const active = this.activeInputs;\n    let activeCount = 0;', '    inputs[BIAS_INPUT_INDEX] = STRETCH_SCALE;\n    const active = this.activeInputs;\n    let activeCount = 0;');
mods.skeleton_context=extra(source,'mixHash(this.symbolHistory,byte1)','  private symbolHistory = FNV_OFFSET_BASIS;', '    if (!isWordByte(byte) && byte !== 32 && byte !== 9) this.symbolHistory=((this.symbolHistory << 8) | byte) >>> 0;');
mods.skeleton_number = mods.skeleton_context
  .replace('const MODEL_COUNT = EXTRA_MODEL_INDEX + 1;', 'const NUMBER_MODEL_INDEX = EXTRA_MODEL_INDEX + 1;\nconst MODEL_COUNT = NUMBER_MODEL_INDEX + 1;')
  .replace('    this.historyHashes[EXTRA_MODEL_INDEX] =', '    this.historyHashes[NUMBER_MODEL_INDEX] = this.history.slice(0, 6).reduce((h,b)=>mixHash(h,b>=48&&b<=57?48:b), FNV_OFFSET_BASIS);\n    this.historyHashes[EXTRA_MODEL_INDEX] =');
/** Frozen extra-pass candidates; none changes the production g2 model. */
export const extraModelCandidates = Object.freeze(mods);
