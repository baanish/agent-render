/**
 * ARX6 experimental wire v1. This is not deployed on agent-render.com.
 * Shape: #g1L<prior-id><unpadded-base64url(checksum || length || arithmetic-stream)>.
 * L = native tuple + lexical/syntax context mixer. All five header characters count.
 * Browser-safe: no Node dependencies. Hash-pinned priors must be installed before use.
 */
import {encodeCm,decodeCm} from './cm6.mjs';
import {encodeNative,decodeNative} from './native-frame.mjs';
const PINNED={
 m:'90da74cfa7a7394099aefd7d8f3ba9ed2acc40237b23d58048f4b8b4dd596c9c',
 c:'3596c70d73b7d3f95e5f978a0c3bcb4ae1d4aa8711d563f4a22f39d0123aa6af',
 j:'37e1cfa8f8885afda7e560d63616b4e84e891a1c3a63d2ac3a139ebe6558fb18',
};
const MAX_FRAGMENT=8192,MAX_DECODED_CHARS=200000;
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;});
/** CRC32 detects accidental corruption. It is NOT authentication or encryption. */
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=(c>>>8)^crcTable[(c^b)&255];return(c^0xffffffff)>>>0;}
function toBase64(a){let s='';for(let i=0;i<a.length;i+=4096)s+=String.fromCharCode(...a.subarray(i,i+4096));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64(s){if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length%4===1)throw Error('invalid base64url');const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),a=Uint8Array.from(b,c=>c.charCodeAt(0));if(toBase64(a)!==s)throw Error('noncanonical base64url');return a;}
function budgetTuple(tuple){const s=JSON.stringify(tuple);if(s===undefined||s.length>MAX_DECODED_CHARS)throw Error('decoded tuple exceeds 200000 characters');}
/**
 * Install immutable copies of the existing curated priors. Reject altered, missing or future data.
 * Encoders/decoders cannot pass arbitrary "helpful" corpus text and silently contaminate a stream.
 */
export async function createArx6Codec(corpora){const pinned={};for(const id of Object.keys(PINNED)){
 const p=corpora[id];if(!(p instanceof Uint8Array)||p.length!==16384)throw Error('missing or invalid prior '+id);
 const copy=new Uint8Array(p),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',copy));
 const hex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');if(hex!==PINNED[id])throw Error('prior digest mismatch '+id);pinned[id]=copy;
 }
 return Object.freeze({
  /** Emit an experimental ASCII fragment. Returns null rather than violating the fragment budget. */
  encode(tuple,id){if(!Object.hasOwn(pinned,id))throw Error('unknown prior');budgetTuple(tuple);const raw=encodeNative(tuple),cm=encodeCm(raw,pinned[id]).bytes,crc=crc32(raw),body=new Uint8Array(cm.length+4);new DataView(body.buffer).setUint32(0,crc,false);body.set(cm,4);const fragment='#g1L'+id+toBase64(body);return fragment.length<=MAX_FRAGMENT?fragment:null;},
  /** Decode only this version; validate framing and checksum before exposing the resulting tuple. */
  decode(fragment){if(typeof fragment!=='string'||fragment.length>MAX_FRAGMENT||!/^#g1L[mcj]/.test(fragment))throw Error('unsupported or oversized ARX6 fragment');const id=fragment[4],body=fromBase64(fragment.slice(5));if(body.length<9)throw Error('short ARX6 payload');const expected=new DataView(body.buffer,body.byteOffset,body.byteLength).getUint32(0,false),raw=decodeCm(body.subarray(4),pinned[id]);if(crc32(raw)!==expected)throw Error('ARX6 checksum mismatch');const tuple=decodeNative(raw);budgetTuple(tuple);return tuple;}
 });
}
/** Count the actual wire in a complete markdown link; no rendered/visible-character shortcut. */
export function formattedLink(fragment,{label='View',baseUrl='https://agent-render.com/'}={}){
 if(!/^[A-Za-z0-9 _-]*$/.test(label))throw Error('benchmark labels must not require markdown escaping');
 if(!fragment.startsWith('#')||/[^\x21-\x7e]/.test(fragment))throw Error('expected ASCII fragment');
 // The deployed application should use its own established URL/markdown serialization helper.
 const url=new URL(baseUrl);if(url.hash||url.search)throw Error('base URL must not include payload or search');url.hash=fragment;
 return `[${label}](${url.href})`;
}
/** Keep a byte-for-byte legacy link when the new candidate does not win after actual serialization. */
export function selectShorterFragment(legacy,candidate,options){if(candidate===null)return legacy;return formattedLink(candidate,options).length<formattedLink(legacy,options).length?candidate:legacy;}
