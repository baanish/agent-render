import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const codec = await import(pathToFileURL(process.argv[2]).href);
import {deflateSync,inflateSync} from 'fflate';
function pack(patch){
 const parts=[]; let size=0;
 function block(view){const start=size;parts.push({start,view:new Uint8Array(view.buffer,view.byteOffset,view.byteLength)});size+=Math.ceil(view.byteLength/4)*4;return {start,length:view.length,constructorName:view.constructor.name};}
 function walk(p){if(p.type==='typed')return {type:p.type,words:p.words,offsets:p.offsets?block(p.offsets):null,values:block(p.values)};if(p.type==='json')return p;return {type:p.type,fields:Object.fromEntries(Object.entries(p.fields).map(([k,v])=>[k,walk(v)]))};}
 const metadata=walk(patch), buffer=new Uint8Array(size);for(const part of parts)buffer.set(part.view,part.start);
 return {metadata,compressed:deflateSync(buffer,{level:1}),inflatedBytes:size};
}
function unpack(packed){
 const bytes=inflateSync(packed.compressed);
 function block(p){return new globalThis[p.constructorName](bytes.buffer,bytes.byteOffset+p.start,p.length);}
 function walk(p){if(p.type==='typed')return {type:p.type,words:p.words,offsets:p.offsets?block(p.offsets):null,values:block(p.values)};if(p.type==='json')return p;return {type:p.type,fields:Object.fromEntries(Object.entries(p.fields).map(([k,v])=>[k,walk(v)]))};}
 return walk(packed.metadata);
}
for(const [name,fn]of [['arx-dictionary.json','loadArxDictionarySync'],['arx2-dictionary.json','loadArx2OverlayDictionarySync'],['arx4-priors.json','loadArx4PriorsSync']])codec[fn](JSON.parse(readFileSync(root+'/public/'+name,'utf8')));
const Model=codec.Arx6V2ContextModel;
const prime=(model,bytes)=>{for(const byte of bytes)model.processKnownByte(byte,()=>{});};
function capture(value,base,path,stats){
 if(ArrayBuffer.isView(value)){
  const words=value.byteLength%4===0;
  if(words){value=new Uint32Array(value.buffer,value.byteOffset,value.byteLength/4);base=new Uint32Array(base.buffer,base.byteOffset,base.byteLength/4);}

  const runs=[]; let changed=0, stored=0;
  const maxGap=Math.floor(8/value.BYTES_PER_ELEMENT);
  for(let i=0;i<value.length;){
   if(value[i]===base[i]){i++;continue;}
   const start=i; let end=i+1;
   for(;i<value.length;i++){
    if(value[i]!==base[i]){changed++;end=i+1;}
    else if(i-end>=maxGap)break;
   }
   runs.push(start,end-start);stored+=end-start;
  }
  const sparseBytes=runs.length*4+stored*value.BYTES_PER_ELEMENT;
  const dense=sparseBytes>=value.byteLength;
  const offsets=dense?null:new Uint32Array(runs);
  const values=dense?value.slice():new value.constructor(stored);
  if(!dense){let at=0;for(let i=0;i<runs.length;i+=2){values.set(value.subarray(runs[i],runs[i]+runs[i+1]),at);at+=runs[i+1];}}
  stats.push({path,type:value.constructor.name,fullBytes:value.byteLength,changedCells:changed,storedCells:dense?value.length:stored,runs:dense?1:runs.length/2,retainedBytes:values.byteLength+(offsets?.byteLength??0)});
  return {type:'typed',offsets,values,words};
 }
 if(Array.isArray(value)){
  if(value.some(ArrayBuffer.isView))return {type:'object',fields:Object.fromEntries(value.map((v,i)=>[i,capture(v,base[i],`${path}.${i}`,stats)]))};
  return {type:'json',value:structuredClone(value)};
 }
 if(value!==null&&typeof value==='object')return {type:'object',fields:Object.fromEntries(Object.entries(value).map(([key,v])=>[key,capture(v,base[key],`${path}.${key}`,stats)]))};
 return {type:'json',value};
}
function apply(target,patch){
 if(patch.type==='typed'){
  const original=target;if(patch.words)target=new Uint32Array(target.buffer,target.byteOffset,target.byteLength/4);
  if(!patch.offsets)target.set(patch.values);
  else{let at=0;for(let i=0;i<patch.offsets.length;i+=2){const length=patch.offsets[i+1];target.set(patch.values.subarray(at,at+length),patch.offsets[i]);at+=length;}}
  return original;
 }
 if(patch.type==='json')return structuredClone(patch.value);
 for(const [key,p]of Object.entries(patch.fields))target[key]=apply(target[key],p);
 return target;
}




function size(p){if(p.type==='typed')return p.values.byteLength+(p.offsets?.byteLength??0);if(p.type==='json')return Buffer.byteLength(JSON.stringify(p.value)??'null');return Object.entries(p.fields).reduce((s,[k,v])=>s+k.length+size(v),0);}
const mode=process.argv[3];
const primeBytes=codec.arx6PriorBytes('m');
const raw=codec.encodeArx6String(codec.envelopeToRawContainer({v:1,codec:'arx6',activeArtifactId:'x',artifacts:[{id:'x',kind:'markdown',content:'# Priming cache\n\nSmall realistic draft used to compare cold generation and immediate preview.\n\n- Browser worker stays alive\n- Exact wire stays fixed\n'}]}));
let cached=null;const rows=[];
function cachedModel(){
 if(cached&&cached.factory===Model&&cached.prior.length===primeBytes.length&&cached.prior.every((x,i)=>x===primeBytes[i]))return apply(new Model(),mode==='uncompressed'?cached.patch:unpack(cached.packed));
 const model=new Model();prime(model,primeBytes);const patch=capture(model,new Model(),'model',[]);cached={factory:Model,prior:primeBytes.slice(),...(mode==='uncompressed'?{patch}:{packed:pack(patch)})};return model;
}
if(mode==='proof'){
 const proofs=[];
 for(const id of ['m','c','j','s']){
  const bytes=codec.arx6PriorBytes(id), model=new Model();prime(model,bytes);
  const stats=[], patch=capture(model,new Model(),'model',stats), packed=pack(patch);
  const restored=apply(new Model(),unpack(packed));assert.deepStrictEqual(restored,model);
  const wire=codec.encodeArx6V2Wire(raw,bytes,'g2'+id);
  assert.equal(codec.encodeWire(raw,null,restored,'g2'+id),wire);
  assert.deepStrictEqual(codec.decodeWire(wire,null,()=>apply(new Model(),unpack(packed)),'g2'+id),raw);
  assert.deepStrictEqual(codec.decodeArx6V2Wire(wire,bytes,'g2'+id),raw);
  proofs.push({id,primeBytes:bytes.length,retainedCompressedBytes:bytes.length+packed.compressed.byteLength+Buffer.byteLength(JSON.stringify(packed.metadata)),retainedUncompressedBytes:bytes.length+size(patch),exactState:true,exactWire:true,exactRestoredDecode:true,exactRegularDecode:true,stats});
 }
 console.log(JSON.stringify({mode,proofs}));
}else{
for(let i=0;i<6;i++){
 global.gc?.();const rssBefore=process.memoryUsage().rss;
 let t=performance.now();
 const wire=mode==='baseline'?codec.encodeArx6V2Wire(raw,primeBytes,'g2m'):codec.encodeWire(raw,null,cachedModel(),'g2m');
 const encodeMs=performance.now()-t;t=performance.now();
 const decoded=mode==='baseline'?codec.decodeArx6V2Wire(wire,primeBytes,'g2m'):codec.decodeWire(wire,null,cachedModel,'g2m');
 const decodeMs=performance.now()-t;assert.deepStrictEqual(decoded,raw);
 rows.push({i,encodeMs,decodeMs,totalMs:encodeMs+decodeMs,rssBefore,rssAfter:process.memoryUsage().rss,maxRss:process.resourceUsage().maxRSS*1024,wire});
}
const out={mode,rows,retainedBytes:cached?cached.prior.byteLength+(mode==='uncompressed'?size(cached.patch):cached.packed.compressed.byteLength+Buffer.byteLength(JSON.stringify(cached.packed.metadata))):0};

console.log(JSON.stringify(out));

}
