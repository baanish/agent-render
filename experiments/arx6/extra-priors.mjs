import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const require=createRequire(root+'/package.json');
const {buildSync}=require('esbuild');
const source=readFileSync(root+'/src/lib/payload/arx6-codec.ts','utf8');
const bundle=buildSync({stdin:{contents:source+`\nexport {normalizeV2Envelope};\nexport {formatMarkdownLink} from '@/lib/markdown-link';\nexport {loadArxDictionarySync,loadArx2OverlayDictionarySync} from '@/lib/payload/arx-codec';\nexport {loadArx4PriorsSync,arx4PriorIdForEnvelope} from '@/lib/payload/arx4-codec';`,resolveDir:root,sourcefile:'src/lib/payload/arx6-codec.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['brotli-wasm'],tsconfig:root+'/tsconfig.json'});
const c=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
for(const [asset,fn] of [['arx-dictionary.json','loadArxDictionarySync'],['arx2-dictionary.json','loadArx2OverlayDictionarySync'],['arx4-priors.json','loadArx4PriorsSync']])c[fn](JSON.parse(readFileSync(root+'/public/'+asset)));
const corpusBytes=readFileSync(process.argv[2]||root+'/experiments/arx6/corpora/diagnostic.json');
const corpus=JSON.parse(corpusBytes);
const sha=s=>createHash('sha256').update(s).digest('hex');
const out={scope:'All existing priors versus kind+n; same frozen model/wire. Diagnostic only. Indicative contended timings, not latency claims.',sourceSha256:sha(source),modelSha256:sha(readFileSync(root+'/src/lib/payload/arx6-v2-model.ts')),assetSha256:Object.fromEntries(['arx-dictionary.json','arx2-dictionary.json','arx4-priors.json'].map(f=>[f,sha(readFileSync(root+'/public/'+f))])),corpusSha256:sha(corpusBytes),rows:[]};
for(const sample of corpus){
 const envelope=c.normalizeV2Envelope({...sample.envelope,codec:'arx6'});const kind=c.arx4PriorIdForEnvelope(envelope);const wires={},ms={};
 for(const id of ['m','c','j','s','n']){const t=performance.now();wires[id]=c.arx6CompressEnvelope(envelope,id,2);ms[id]=performance.now()-t;}
 const baseline=wires.n.length<wires[kind].length?'n':kind;let best=baseline;
 for(const id of ['m','c','j','s','n'])if(wires[id].length<wires[best].length)best=id;
 assert.deepEqual(JSON.parse(JSON.stringify(c.arx6DecompressEnvelope(wires[best]))),JSON.parse(JSON.stringify(envelope)));
 const measure=wire=>{const url=new URL('https://agent-render.com/');url.hash='g'+wire;return c.formatMarkdownLink('View',url.href).length;};
 const baselineChars=measure(wires[baseline]);
 const bestChars=measure(wires[best]);
 out.rows.push({id:sample.id,family:sample.family,kind,baseline,best,baselineChars,bestChars,saved:baselineChars-bestChars,priorChars:Object.fromEntries(Object.entries(wires).map(([k,v])=>[k,v.length])),baselineMs:ms[kind]+(kind==='n'?0:ms.n),allMs:Object.values(ms).reduce((a,b)=>a+b,0),roundTrip:true});
 writeFileSync(process.argv[3]||root+'/experiments/arx6/extra-priors-results.json',JSON.stringify(out,null,2)+'\n');
 if(out.rows.length%10===0)console.error(out.rows.length+'/'+corpus.length);
}
const b=out.rows.reduce((a,r)=>a+r.baselineChars,0),n=out.rows.reduce((a,r)=>a+r.bestChars,0);console.log(JSON.stringify({cases:out.rows.length,baseline:b,best:n,saved:b-n,pct:100*(b-n)/b,wins:out.rows.filter(r=>r.saved).length,timeRatio:out.rows.reduce((a,r)=>a+r.allMs,0)/out.rows.reduce((a,r)=>a+r.baselineMs,0),bestPriors:Object.fromEntries(['m','c','j','s','n'].map(p=>[p,out.rows.filter(r=>r.best===p).length]))}));
