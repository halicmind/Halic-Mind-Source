import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../frontend/src/api.js',import.meta.url),'utf8');
const {api,ApiError}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('login distinguishes pending verification from other forbidden responses',async t=>{
  const forbidden = (detail,headers={}) => new Response(JSON.stringify({detail}),{status:403,headers});
  const replies = [
    forbidden('Farklı bir kaynaktan gönderilen istek reddedildi.'),
    forbidden('Giriş yapmadan önce e-posta adresinizi doğrulayın.'),
    forbidden('Okul adresini doğrula.',{'X-HalicMind-Error':'email_verification_required'}),
  ];
  t.mock.method(globalThis,'fetch',async()=>replies.shift());
  for (const code of [null,'email_verification_required','email_verification_required']) {
    await assert.rejects(api('/auth/login',{method:'POST'}),error=>error.status===403 && error.code===code);
  }
});
test('422 errors retain field associations for inline feedback',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({detail:[{loc:['body','custom_course_code'],type:'string_too_short',msg:'Invalid',ctx:{min_length:1}}]}),{status:422}));
 await assert.rejects(api('/enrollments',{method:'POST',body:{custom_course_code:''}}),error=>error instanceof ApiError && error.fields.custom_course_code==='Ders kodu alanını doldur.' && error.status===422);
});
test('conflict and network failures remain readable general errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({detail:'Bu ders zaten kayıtlı.'}),{status:409}));
 await assert.rejects(api('/enrollments'),error=>error.status===409 && error.message==='Bu ders zaten kayıtlı.' && Object.keys(error.fields).length===0);
 globalThis.fetch=async()=>{throw new TypeError('Network failure');};
 await assert.rejects(api('/enrollments'),error=>error.status===0 && error.message.includes('Bağlantı kurulamadı'));
});


test('temporary gateway failures retry reads without repeating writes',async t=>{
 const realTimeout=globalThis.setTimeout;
 t.mock.method(globalThis,'setTimeout',(fn,ms)=>{if(ms>10000)return realTimeout(fn,ms);queueMicrotask(fn);return 0;});
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response('origin failure',{status:520}):new Response(JSON.stringify({id:1}),{status:200}));
 assert.deepEqual(await api('/users/me'),{id:1});
 assert.equal(calls,2);
 calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('origin failure',{status:520});};
 await assert.rejects(api('/enrollments',{method:'POST',body:{}}),error=>error.status===520 && error.message.includes('Sunucu'));
 assert.equal(calls,1);
 await assert.rejects(api('/users/me'),error=>error.status===520 && error.message.includes('Sunucu'));
 assert.equal(calls,6);
});

test('malformed success responses and stuck pagination fail clearly',async t=>{
 const {allPages}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>gateway</html>',{status:200}));
 await assert.rejects(api('/users/me'),error=>error.code==='invalid_response');
 globalThis.fetch=async()=>Response.json({unexpected:true});
 await assert.rejects(allPages('/terms'),error=>error.status===502);
 globalThis.fetch=async()=>Response.json(Array.from({length:200},(_,id)=>({id})));
 await assert.rejects(allPages('/terms'),error=>error.status===502);
});
test('obsolete responses cannot expire a newer session',async t=>{
 const {invalidateSessionRequests,setUnauthorizedHandler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 let release,unauthorized=0;setUnauthorizedHandler(()=>unauthorized++);
 t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>release=resolve));
 const pending=api('/users/me');invalidateSessionRequests();release(Response.json({detail:'expired'},{status:401}));
 await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(unauthorized,0);
 setUnauthorizedHandler(()=>{});
});
test('mutations time out without automatic resubmission',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',(_,options)=>{calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));});
 await assert.rejects(api('/assignments',{method:'POST',body:{},timeoutMs:5}),error=>error.code==='request_timeout');assert.equal(calls,1);
});
