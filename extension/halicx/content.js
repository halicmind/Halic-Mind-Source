const BASE='https://huzem.halic.edu.tr/UE2/';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function safe(url){const u=new URL(url,BASE);if(u.origin!==new URL(BASE).origin||!u.pathname.startsWith('/UE2/'))throw Error('Kaynak adresi geçersiz.');return u;}
function authenticated(doc){if(doc.querySelector('input[type=password],#page-login-index')||!doc.querySelector('#user-menu-toggle,.usermenu'))throw Error('HaliçX oturumu kapalı. Tekrar giriş yap.');}
async function load(url,allowFile=false){safe(url);const r=await fetch(url,{credentials:'same-origin',redirect:'follow'});safe(r.url);if(!r.ok)throw Error('HaliçX sayfası okunamadı.');if(allowFile&&!/text\/html/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();return {fileUrl:cleanLink(r.url)};}const doc=new DOMParser().parseFromString(await r.text(),'text/html');authenticated(doc);return doc;}
function courseLinks(doc){const found=new Map();for(const a of doc.querySelectorAll('a[href]')){try{const u=safe(a.href);if(u.pathname==='/UE2/course/view.php'&&/^\d+$/.test(u.searchParams.get('id')||'')&&a.textContent.trim()){const id=u.searchParams.get('id');found.set(id,{id,name:a.textContent.trim().replace(/\s+/g,' ').slice(0,500)});}}catch{}}return [...found.values()];}
function cleanLink(raw){const u=safe(raw);for(const k of [...u.searchParams.keys()])if(/token|sesskey|password|forcedownload/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;}
function dueDate(doc){
 // Moodle's machine-readable timestamps avoid locale/date-guessing errors.
 for(const node of doc.querySelectorAll('[data-region="activity-dates"] [data-timestamp],.activity-dates [data-timestamp],.activity-dates time[datetime]')){
  const parent=node.closest('div')?.textContent||'';
  if(/^\s*(due(?: date)?|son tarih|teslim[^:]*):/i.test(parent)){
   const epoch=Number(node.dataset.timestamp);const date=epoch?new Date(epoch*1000):new Date(node.getAttribute('datetime'));
   if(Number.isFinite(date.getTime()))return date.toISOString();
  }
 }
 const text=doc.querySelector('.activity-dates,[data-region="activity-dates"]')?.textContent||'';
 const line=text.match(/(?:Son tarih|Due(?: date)?):\s*(?:[\p{L}]+,?\s*)?(\d{1,2})\s+([\p{L}]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/iu);
 if(line){const months=['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];const month=line[2].toLocaleLowerCase('tr');const m=months.indexOf(month)>=0?months.indexOf(month):['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(month);let h=Number(line[4]);if(line[6])h=h%12+(line[6].toUpperCase()==='PM'?12:0);if(m>=0&&h<24)return new Date(`${line[3]}-${String(m+1).padStart(2,'0')}-${line[1].padStart(2,'0')}T${String(h).padStart(2,'0')}:${line[5]}:00+03:00`).toISOString();}
 return null; // Never invent a deadline when the source format is unrecognized.
}
async function scan(ids){
 authenticated(document);
 const profile=document.querySelector('a[href*="/user/profile.php?id="]');
 const profileId=profile?new URL(profile.href).searchParams.get('id'):document.querySelector('[data-userid]')?.dataset.userid || [...document.scripts].map(s=>s.textContent.match(/["']userid["']\s*:\s*["']?(\d+)/)?.[1]).find(Boolean);
 if(!profileId||!/^\d+$/.test(profileId))throw Error('Öğrenci kimliği doğrulanamadı. HaliçX kontrol panelini açıp tekrar dene.');
 const account=await hash('huzem.halic.edu.tr/UE2/user/'+profileId),courses=[];const files={};
 for(const id of ids){
  const doc=await load(BASE+'course/view.php?id='+id);const name=(doc.querySelector('#page-header h1,h1')?.textContent||'').trim();if(!name)throw Error('Ders adı okunamadı.');
  const items=[],seen=new Set();
  for(const a of doc.querySelectorAll('#region-main a[href]')){
   let u;try{u=safe(a.href);}catch{continue;}
   const match=u.pathname.match(/\/mod\/(assign|resource|url|page)\/view.php$/);const mid=u.searchParams.get('id');
   if(!match||!/^\d+$/.test(mid||'')||seen.has(mid)||!a.textContent.trim())continue;
   seen.add(mid);if(items.length>=250)throw Error('Derste çok fazla içerik var; kontrol tamamlanmadı.');
   const kind=match[1],source=cleanLink(u.href);
   if(kind==='url'){items.push({id:'url:'+mid,kind:'material',title:a.textContent.trim().slice(0,200),description:null,url:source,due_at:null});continue;}
   const detail=await load(source,kind==='resource');
   if(detail.fileUrl){const fileUrl=detail.fileUrl;const fid='file:'+mid+':'+(await hash(fileUrl)).slice(0,16);items.push({id:fid,kind:'material',title:decodeURIComponent(new URL(fileUrl).pathname.split('/').pop()).slice(0,200)||a.textContent.trim().slice(0,200),description:null,url:fileUrl,due_at:null});files[fid]=fileUrl;continue;}
   const title=(detail.querySelector('#page-header h1,h1')?.textContent||a.textContent).trim().slice(0,200);
   const description=(detail.querySelector('#intro,.activity-description')?.textContent||'').trim().slice(0,10000)||null;
   items.push({id:kind+':'+mid,kind:kind==='assign'?'assignment':'material',title,description,url:source,due_at:kind==='assign'?dueDate(detail):null});
   const links=new Map();
   for(const node of detail.querySelectorAll('#intro a[href],#region-main .resourceworkaround a[href],#region-main .resourcecontent a[href],#region-main .resourcecontent object[data],#region-main .resourcecontent iframe[src]')){
    try{const f=safe(node.getAttribute('href')||node.getAttribute('data')||node.getAttribute('src'));if(f.pathname.includes('/pluginfile.php/'))links.set(cleanLink(f.href),(decodeURIComponent(f.pathname.split('/').pop())||node.textContent?.trim()||title).slice(0,200));}catch{}
   }
   for(const [fileUrl,fileTitle] of links){const fid='file:'+mid+':'+(await hash(fileUrl)).slice(0,16);items.push({id:fid,kind:'material',title:fileTitle,description:null,url:fileUrl,due_at:null});files[fid]=fileUrl;}
   await delay(250);
  }
  courses.push({id,name:name.slice(0,500),items});
 }
 return {account,courses,files};
}
async function file(url){safe(url);const r=await fetch(url,{credentials:'same-origin'});safe(r.url);if(!r.ok||/text\/html/i.test(r.headers.get('content-type')||''))throw Error('Dosya yerine giriş sayfası geldi.');if(Number(r.headers.get('content-length'))>5242880)throw Error('Dosya 5 MB sınırını aşıyor.');const reader=r.body.getReader();let size=0;const parts=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5242880){await reader.cancel();throw Error('Dosya 5 MB sınırını aşıyor.');}parts.push(value);}const data=new Uint8Array(size);let at=0;for(const part of parts){data.set(part,at);at+=part.length;}let binary='';for(let at=0;at<data.length;at+=8192)binary+=String.fromCharCode(...data.subarray(at,at+8192));return btoa(binary);}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 const run=async()=>{
  if(message.action==='discover'){authenticated(document);return courseLinks(document);}
  if(message.action==='scan')return scan(message.ids);
  if(message.action==='file')return file(message.url);
  throw Error('Bilinmeyen işlem.');
 };
 run().then(data=>respond({data})).catch(error=>respond({error:error.message}));return true;
});
