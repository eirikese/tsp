// ---------- utilities ----------
function log(s){const el=$('log');el.textContent+=s+"\\n";el.scrollTop=el.scrollHeight}
function setStatus(t,ok=false){$('status').textContent=t;$('status').className=ok?'ok':'bad'}
function meanStd(a){if(!a.length)return{mean:NaN,std:NaN};const m=a.reduce((x,y)=>x+y,0)/a.length;const v=a.reduce((x,y)=>x+(y-m)*(y-m),0)/a.length;return{mean:m,std:Math.sqrt(v)}}
function fmt2(n){return n.toString().padStart(2,'0')}
const b64d=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
async function deriveKey(pw,salt){const enc=new TextEncoder();const mat=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function decryptCreds(pass,blob){const j=JSON.parse(atob(blob));const key=await deriveKey(pass,b64d(j.salt));const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(j.iv)},key,b64d(j.ct));return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)))}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));


// make available to other modules
window.log = log;
window.setStatus = setStatus;
window.meanStd = meanStd;
window.fmt2 = fmt2;
window.b64d = b64d;
window.deriveKey = deriveKey;
window.decryptCreds = decryptCreds;
window.clamp = clamp;
// Velocity utilities removed; device provides SOG/HDG
