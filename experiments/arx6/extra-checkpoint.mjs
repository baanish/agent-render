/** Independent-process comparison of frozen g2 priming with bounded exact-byte checkpoints. */
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'../..');
const temporary=mkdtempSync(join(tmpdir(),'arx6-checkpoint-'));
try {
  const codecPath=join(temporary,'codec.mjs');
  const source=readFileSync(join(root,'src/lib/payload/arx6-codec.ts'),'utf8')+`
export {envelopeToRawContainer,encodeWire,decodeWire,encodeArx6String};
export {Arx6V2ContextModel} from '@/lib/payload/arx6-v2-model';
export {loadArxDictionarySync,loadArx2OverlayDictionarySync} from '@/lib/payload/arx-codec';
export {loadArx4PriorsSync} from '@/lib/payload/arx4-codec';
`;
  buildSync({stdin:{contents:source,resolveDir:root,sourcefile:'src/lib/payload/arx6-codec.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:codecPath,external:['brotli-wasm'],tsconfig:join(root,'tsconfig.json')});
  const measurements=['baseline','cached','uncompressed','proof'].map(mode=>JSON.parse(execFileSync(process.execPath,['--expose-gc',join(here,'extra-checkpoint-worker.mjs'),codecPath,mode],{encoding:'utf8'})));
  const expected=measurements[0].rows[0].wire;
  if(measurements.some(m=>m.rows?.some(row=>row.wire!==expected)))throw new Error('Checkpoint changed the wire');
  const result={date:new Date().toISOString(),node:process.version,modelSha256:createHash('sha256').update(readFileSync(join(root,'src/lib/payload/arx6-v2-model.ts'))).digest('hex'),measurements};
  if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally { rmSync(temporary,{recursive:true,force:true}); }
