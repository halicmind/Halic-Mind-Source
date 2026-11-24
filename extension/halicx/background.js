const API='https://halicmind.com/api/v1/integrations/halicx';
async function api(path,{method='GET',data,raw}={}){
 const {key}=await chrome.storage.local.get('key');if(!key)throw Error('Önce eşleştirme anahtarını kaydet.');
 const r=await fetch(API+path,{method,credentials:'omit',headers:{Authorization:'Bearer '+key,'Content-Type':raw?'application/octet-stream':'application/json'},body:raw|| (data?JSON.stringify(data):undefined)});
 if(!r.ok){if(r.status===401){await chrome.storage.local.set({paused:true});throw Error('Eşleştirme süresi doldu; HalicMind üzerinden yeniden eşleştir.');}const d=await r.json().catch(()=>({}));throw Error(typeof d.detail==='string'?d.detail:'Aktarım tamamlanamadı ('+r.status+').');}return r.status===204?null:r.json();
}
async function tab(){const tabs=await chrome.tabs.query({url:'https://huzem.halic.edu.tr/UE2/*'});if(!tabs.length)throw Error('HaliçX sekmesini açık tut ve hesabına giriş yap.');return tabs.find(t=>t.active)||tabs[0];}
async function ask(id,message){const r=await chrome.tabs.sendMessage(id,message);if(r?.error)throw Error(r.error);return r.data;}
let busy=false;
async function sync(){
 if(busy)return;busy=true;
 const keepAlive=setInterval(()=>{void chrome.runtime.getPlatformInfo();},20000);
 try{
  const {paused}=await chrome.storage.local.get('paused');if(paused)throw Error('Otomatik eşitleme duraklatıldı.');
  const settings=await api('/settings');if(!settings.selected_courses.length)throw Error('Önce ders seç.');
  const target=await tab();
  // Each round is bounded; a persistent cursor covers all selected courses.
  const {cursor=0}=await chrome.storage.local.get('cursor');const ids=settings.selected_courses.slice(cursor,cursor+2);
  const data=await ask(target.id,{action:'scan',ids});
  if(settings.account&&settings.account!==data.account)throw Error('HaliçX hesabı değişti; otomatik eşitleme durduruldu.');
  const result=await api('/sync',{method:'POST',data:{account:data.account,courses:data.courses}});
  let fileErrors=0;
  for(const upload of result.uploads){
   try{const encoded=await ask(target.id,{action:'file',url:data.files[upload.source_id]});const raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const stored=await api('/files/'+upload.item_id,{method:'PUT',raw});if(stored.changed)result.changed++;}catch{fileErrors++;}
  }
  if(fileErrors)await api('/error',{method:'POST'}).catch(()=>{});
  await chrome.storage.local.set({lastSync:new Date().toISOString(),status:result.changed+' yeni/güncellenen içerik.'+(result.warning?' '+result.warning:'')+(fileErrors?' '+fileErrors+' dosya kopyalanamadı; HaliçX bağlantıları korunuyor.':''),cursor:cursor+2>=settings.selected_courses.length?0:cursor+2});
  await chrome.action.setBadgeText({text:result.changed?String(result.changed):''});await chrome.action.setBadgeBackgroundColor({color:'#214ee9'});
 }catch(error){await chrome.storage.local.set({status:error.message});await chrome.action.setBadgeText({text:'!'});await api('/error',{method:'POST'}).catch(()=>{});}
 finally{clearInterval(keepAlive);busy=false;}
}
async function ensureAlarm(){if(!await chrome.alarms.get('halicx-sync'))await chrome.alarms.create('halicx-sync',{periodInMinutes:15});}
chrome.runtime.onInstalled.addListener(ensureAlarm);chrome.runtime.onStartup.addListener(ensureAlarm);ensureAlarm();
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='halicx-sync')void sync();});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||sender.tab)return;
 const run=async()=>{
  if(m.action==='save'){if(!/^[A-Za-z0-9_-]{43}$/.test(m.key))throw Error('Geçersiz eşleştirme anahtarı.');await chrome.storage.local.set({key:m.key,paused:false,cursor:0});return api('/settings');}
  if(m.action==='discover')return ask((await tab()).id,{action:'discover'});
  if(m.action==='select'){await api('/selection',{method:'POST',data:{courses:m.courses}});await chrome.storage.local.set({paused:false,cursor:0});void sync();return {ok:true};}
  if(m.action==='sync'){await chrome.storage.local.set({paused:false});void sync();return {ok:true};}
  if(m.action==='pause'){await chrome.storage.local.set({paused:true,status:'Otomatik eşitleme duraklatıldı.'});return {ok:true};}
  if(m.action==='forget'){await chrome.storage.local.remove('key');await chrome.storage.local.set({paused:true,status:'Yerel eşleştirme kaldırıldı. Sunucudaki anahtarı da Bağlantılar ekranından iptal et.'});return {ok:true};}
 };
 run().then(data=>respond({data})).catch(e=>respond({error:e.message}));return true;
});
