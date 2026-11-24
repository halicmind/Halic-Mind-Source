const API='https://halicmind.com/api/v1/integrations/halicx';
const NEXT='halicx-next',PERIODIC='halicx-sync';
let busy=false,generation=0,controller,activeSource;
function cancelSource(){if(activeSource)void chrome.tabs.sendMessage(activeSource.tabId,{action:'cancel',jobId:activeSource.jobId}).catch(()=>{});}
function failure(message,status=0){return Object.assign(Error(message),{status});}
function stop(){generation++;controller?.abort();void chrome.alarms.clear(NEXT);}
async function api(path,{method='GET',data,raw,key,signal,candidate=false}={}){
 key??=(await chrome.storage.local.get('key')).key;if(!key)throw Error('Önce eşleştirme anahtarını kaydet.');
 for(let attempt=0;attempt<3;attempt++){
  let r;
  try{r=await fetch(API+path,{method,credentials:'omit',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+key,'Content-Type':raw?'application/octet-stream':'application/json'},body:raw??(data?JSON.stringify(data):undefined)});}
  catch(error){if(signal?.aborted)throw error;if(attempt<2){await new Promise(r=>setTimeout(r,1500));continue;}throw Error('Haliç Mind sunucusuna ulaşılamadı. Sonraki kontrolde tekrar denenecek.');}
  if(r.ok)return r.status===204?null:r.json();
  if(r.status===401){if(!candidate&&(await chrome.storage.local.get('key')).key===key)await chrome.storage.local.set({paused:true});throw failure('Eşleştirme süresi doldu; Haliç Mind üzerinden yeniden eşleştir.',401);}
  if([429,502,503,504,520,522,524].includes(r.status)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,Math.min(10000,Math.max(1500,Number(r.headers.get('retry-after')||0)*1000))));continue;}
  const d=await r.json().catch(()=>({}));throw failure(typeof d.detail==='string'?d.detail:'Aktarım tamamlanamadı ('+r.status+').',r.status);
 }
}
async function tab(){const tabs=await chrome.tabs.query({url:'https://huzem.halic.edu.tr/UE2/*'});if(!tabs.length)throw Error('HaliçX sekmesini açık tut ve hesabına giriş yap.');return tabs.find(t=>t.active)||tabs[0];}
async function ask(id,message,signal){
 let timer,onAbort;
 try{return await Promise.race([
  chrome.tabs.sendMessage(id,message).then(r=>{if(r?.error)throw Error(r.error);if(!r)throw Error('Eklenti yanıt vermedi. HaliçX sekmesini yenile.');return r.data;}).catch(error=>{if(/Receiving end|Could not establish/.test(error.message))throw Error('HaliçX sekmesini yenile; eklenti bu sayfada henüz başlamadı.');throw error;}),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Ders kontrolü zaman aşımına uğradı; sonraki turda tekrar denenecek.')),170000);onAbort=()=>reject(Error('İşlem durduruldu.'));if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});}),
 ]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
async function schedule(minutes){await chrome.alarms.create(NEXT,{delayInMinutes:minutes});}
async function sync(){
 if(busy)return;busy=true;const epoch=generation;controller=new AbortController();const signal=controller.signal;
 signal.addEventListener('abort',cancelSource,{once:true});
 const deadline=setTimeout(()=>controller.abort(),210000);
 const keepAlive=setInterval(()=>{void chrome.runtime.getPlatformInfo();},20000);
 const check=()=>{if(epoch!==generation||signal.aborted)throw Error('İşlem durduruldu.');};
 let key;
 try{
  let state=await chrome.storage.local.get(null);key=state.key;if(state.paused||!key)return;
  await chrome.alarms.clear(NEXT);check();
  const target=await tab();check();
  const settings=await api('/settings',{key,signal});check();
  const selected=settings.selected_courses;if(!selected.length)throw Error('Önce ders seç.');
  const account=await ask(target.id,{action:'account'},signal);check();
  if(settings.account&&settings.account!==account)throw Error('HaliçX hesabı değişti. Yeniden eşleştir.');
  let pending=state.pendingUploads||[],cursor=Math.max(0,Number(state.cursor)||0)%selected.length;
  let changes=state.roundChanges||0,errors=state.roundErrors||0,fileErrors=state.roundFileErrors||0,warning=state.roundWarning||'';
  if(!pending.length){
   if(cursor===0){changes=0;errors=0;fileErrors=0;warning='';}
   const ids=selected.slice(cursor,cursor+2);
   await chrome.storage.local.set({status:`${cursor+1}–${cursor+ids.length} / ${selected.length} ders kontrol ediliyor…`});
   const jobId=crypto.randomUUID();activeSource={tabId:target.id,jobId};
   const data=await ask(target.id,{action:'scan',ids,jobId},signal);check();activeSource=null;
   if(data.account!==account)throw Error('HaliçX hesabı değişti. Yeniden eşleştir.');
   if(data.courses.length){
    const result=await api('/sync',{method:'POST',data:{account:data.account,courses:data.courses},key,signal});check();
    changes+=result.changed;warning=result.warning||warning;
    pending=result.uploads.filter(u=>data.files[u.source_id]).map(u=>({...u,url:data.files[u.source_id],attempts:0}));
    await chrome.storage.local.set({lastSync:new Date().toISOString()});
   }
   errors+=(data.errors||[]).length;
   cursor=cursor+ids.length>=selected.length?0:cursor+ids.length;
   await chrome.storage.local.set({cursor,pendingUploads:pending,roundChanges:changes,roundErrors:errors,roundFileErrors:fileErrors,roundWarning:warning});
  }
  const batch=pending.slice(0,20),remaining=pending.slice(20);const began=Date.now();
  for(let i=0;i<batch.length;i++){
   check();if(Date.now()-began>75000){remaining.unshift(...batch.slice(i));break;}
   const upload=batch[i];
   try{
    // Recheck the signed-in school account before copying a batch of private files.
    const currentAccount=await ask(target.id,{action:'account'},signal);check();if(currentAccount!==account)throw Error('HaliçX hesabı değişti. Yeniden eşleştir.');
    const encoded=await ask(target.id,{action:'file',url:upload.url},signal);check();
    const raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==upload.file_hash){const stored=await api('/files/'+upload.item_id,{method:'PUT',raw,key,signal});check();if(stored.changed&&!upload.content_changed)changes++;}
   }catch(error){check();if(error.status===401||/hesabı değişti/.test(error.message))throw error;
    if((upload.attempts||0)<1 && error.status!==413)remaining.push({...upload,attempts:(upload.attempts||0)+1});else fileErrors++;
   }
  }
  check();const complete=cursor===0&&remaining.length===0;
  const partial=errors||fileErrors;
  if(partial)await api('/error',{method:'POST',data:{code:errors?'source_unavailable':'files_incomplete'},key,signal}).catch(()=>{});
  check();
  const status=`${changes} yeni/güncellenen içerik. ${complete?'Seçili derslerin kontrol turu tamamlandı.':`${cursor||selected.length} / ${selected.length} ders tarandı; kontrol devam ediyor.`}`+(warning?' '+warning:'')+(errors?` ${errors} ders okunamadı; sonraki turda tekrar denenecek.`:'')+(fileErrors?` ${fileErrors} dosya kopyalanamadı; kaynak bağlantıları korunuyor.`:'')+(remaining.length?` ${remaining.length} dosya sırada.`:'');
  const update={status,cursor,pendingUploads:remaining,roundChanges:changes,roundErrors:errors,roundFileErrors:fileErrors,roundWarning:warning,selectedCourses:selected};
  if(complete){update.lastRoundAt=new Date().toISOString();if(!partial)update.lastFullSync=update.lastRoundAt;}
  await chrome.storage.local.set(update);
  await chrome.action.setBadgeText({text:partial?'!':changes?String(Math.min(changes,999)):''});await chrome.action.setBadgeBackgroundColor({color:partial?'#ae5914':'#214ee9'});
  if(!complete)await schedule(1);
 }catch(error){
  if(epoch!==generation)return;
  const mismatch=/hesabı değişti/.test(error.message);
  const state=await chrome.storage.local.get(['key','paused']);
  if(state.key!==key)return;
  if(mismatch)await chrome.storage.local.set({paused:true});
  await chrome.storage.local.set({status:signal.aborted?'Kontrol zaman aşımına uğradı; tekrar denenecek.':error.message});
  await chrome.action.setBadgeText({text:'!'});
  if(key)await api('/error',{method:'POST',data:{code:mismatch?'account_changed':'source_unavailable'},key}).catch(()=>{});
  if(!mismatch&&!state.paused&&error.status!==401)await schedule(3);
 }finally{cancelSource();clearTimeout(deadline);clearInterval(keepAlive);busy=false;controller=null;activeSource=null;}
}
async function ensureAlarm(){
 if(chrome.storage.local.setAccessLevel)await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 if(!await chrome.alarms.get(PERIODIC))await chrome.alarms.create(PERIODIC,{periodInMinutes:15});
}
chrome.runtime.onInstalled.addListener(ensureAlarm);chrome.runtime.onStartup.addListener(ensureAlarm);void ensureAlarm();
chrome.alarms.onAlarm.addListener(alarm=>{void(async()=>{if(alarm.name===NEXT||(alarm.name===PERIODIC&&!await chrome.alarms.get(NEXT)))await sync();})();});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||sender.tab)return;
 const run=async()=>{
  if(m.action==='save'){
   if(!/^[A-Za-z0-9_-]{43}$/.test(m.key))throw Error('Geçersiz eşleştirme anahtarı.');
   const settings=await api('/settings',{key:m.key,candidate:true});stop();
   await chrome.storage.local.remove(['lastSync','lastFullSync','lastRoundAt']);
   await chrome.storage.local.set({key:m.key,paused:!settings.selected_courses.length,cursor:0,pendingUploads:[],roundChanges:0,roundErrors:0,roundFileErrors:0,roundWarning:'',selectedCourses:settings.selected_courses,status:'Eşleştirildi. Derslerini seçerek aktarımı başlat.'});return settings;
  }
  if(m.action==='discover')return ask((await tab()).id,{action:'discover'});
  if(m.action==='select'){
   if(m.consent!==true)throw Error('Otomatik aktarım onayını işaretle.');
   stop();const selected=await api('/selection',{method:'POST',data:{courses:m.courses}});
   await chrome.storage.local.set({paused:false,cursor:0,pendingUploads:[],selectedCourses:selected.selected,roundChanges:0,roundErrors:0,roundFileErrors:0,roundWarning:''});await schedule(1);void sync();return {ok:true};
  }
  if(m.action==='sync'){await chrome.storage.local.set({paused:false});await schedule(1);void sync();return {ok:true};}
  if(m.action==='pause'){stop();await chrome.storage.local.set({paused:true,status:'Otomatik eşitleme duraklatıldı.'});return {ok:true};}
  if(m.action==='forget'){stop();await chrome.storage.local.remove(['key','pendingUploads','selectedCourses','lastSync','lastFullSync','lastRoundAt']);await chrome.storage.local.set({paused:true,cursor:0,status:'Yerel eşleştirme kaldırıldı. Sunucudaki anahtarı da Bağlantılar ekranından iptal et.'});return {ok:true};}
  throw Error('Bilinmeyen işlem.');
 };
 run().then(data=>respond({data})).catch(e=>respond({error:e.message}));return true;
});
