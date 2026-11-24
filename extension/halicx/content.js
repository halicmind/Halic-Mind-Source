const BASE='https://huzem.halic.edu.tr/UE2/';
const MAX_FILE=5*1024*1024;
let activeScan;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function safe(url,base=BASE){const u=new URL(url,base);if(u.origin!==new URL(BASE).origin||!u.pathname.startsWith('/UE2/')||u.username||u.password)throw Error('Kaynak adresi geçersiz.');return u;}
function authenticated(doc){if(doc.querySelector('input[type=password],#page-login-index')||!doc.querySelector('#user-menu-toggle,.usermenu'))throw Error('HaliçX oturumu kapalı. Tekrar giriş yap.');}
function identity(doc){
 // A course page can contain teachers' profile links. Only the signed-in user's menu/config is trusted.
 const configured=[...doc.scripts].filter(s=>/M\.cfg\s*=/.test(s.textContent)).map(s=>s.textContent.match(/["']userid["']\s*:\s*["']?(\d+)/)?.[1]).find(Boolean);
 const own=doc.querySelector('.usermenu a[href*="/user/profile.php"],#user-action-menu a[href*="/user/profile.php"]');
 const id=configured||(own?new URL(own.getAttribute('href'),BASE).searchParams.get('id'):null)||doc.querySelector('#user-menu-toggle[data-userid],.usermenu [data-userid]')?.dataset.userid;
 if(!id||!/^\d+$/.test(id)||id==='0')throw Error('Öğrenci kimliği doğrulanamadı. HaliçX kontrol panelini açıp tekrar dene.');
 return id;
}
async function fetchSource(url,signal){const u=safe(url);const r=await fetch(u.href,{credentials:'same-origin',redirect:'follow',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});safe(r.url);if(!r.ok)throw Error('HaliçX sayfası okunamadı ('+r.status+').');return r;}
async function load(url,allowFile=false,expected,signal){
 const r=await fetchSource(url,signal);
 if(allowFile&&!/text\/html/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();return {fileUrl:cleanLink(r.url)};}
 const doc=new DOMParser().parseFromString(await r.text(),'text/html');
 // DOMParser has no document URL. Resolve relative Moodle links against the fetched page.
 doc.querySelectorAll('base').forEach(n=>n.remove());const base=doc.createElement('base');base.href=r.url;doc.head.prepend(base);
 authenticated(doc);
 if(expected&&identity(doc)!==expected)throw Error('HaliçX hesabı değişti. Yeniden eşleştir.');
 return doc;
}
function courseLinks(doc){const found=new Map();for(const a of doc.querySelectorAll('a[href]')){try{const u=safe(a.getAttribute('href'),doc.baseURI||BASE);if(u.pathname==='/UE2/course/view.php'&&/^\d+$/.test(u.searchParams.get('id')||'')&&a.textContent.trim()){const id=u.searchParams.get('id');const name=(a.querySelector('.multiline,.coursename,.course-name')?.textContent||a.textContent).trim().replace(/\s+/g,' ').replace(/^(Course name|Ders adı)\s*/i,'').slice(0,500);found.set(id,{id,name});}}catch{}}return [...found.values()];}
function cleanLink(raw){const u=safe(raw);for(const k of [...u.searchParams.keys()])if(/token|sesskey|password|forcedownload/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;}
function validDate(y,m,d,h,min){if(y<2000||y>2100||m<0||m>11||d<1||d>31||h<0||h>23||min<0||min>59)return null;const local=new Date(Date.UTC(y,m,d,h,min));if(local.getUTCFullYear()!==y||local.getUTCMonth()!==m||local.getUTCDate()!==d)return null;return new Date(local.getTime()-3*3600000).toISOString();}
function dueDate(doc){
 for(const node of doc.querySelectorAll('[data-region="activity-dates"] [data-timestamp],.activity-dates [data-timestamp],.activity-dates time[datetime]')){
  const parent=node.closest('div')?.textContent||'';
  if(/^\s*(due(?: date)?|son tarih|teslim[^:]*):/i.test(parent)){
   const epoch=Number(node.dataset.timestamp);const date=epoch?new Date(epoch*1000):new Date(node.getAttribute('datetime'));
   if(Number.isFinite(date.getTime())&&date.getUTCFullYear()>=2000&&date.getUTCFullYear()<=2100)return date.toISOString();
  }
 }
 const text=doc.querySelector('.activity-dates,[data-region="activity-dates"]')?.textContent||'';
 const line=text.match(/(?:Son tarih|Due(?: date)?|Teslim tarihi):\s*(?:[\p{L}]+,?\s*)?(\d{1,2})\s+([\p{L}]+)\s+(\d{4}),?\s*(?:[\p{L}]+,?\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/iu);
 if(!line)return null;
 const months=['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];const month=line[2].toLocaleLowerCase('tr');const m=months.includes(month)?months.indexOf(month):['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(month);
 let h=Number(line[4]);if(line[6]){if(h<1||h>12)return null;h=h%12+(line[6].toUpperCase()==='PM'?12:0);}
 return validDate(Number(line[3]),m,Number(line[1]),h,Number(line[5]));
}
async function scanCourse(id,profileId,signal){
 const doc=await load(BASE+'course/view.php?id='+id,false,profileId,signal);
 const name=(doc.querySelector('#page-header h1,h1')?.textContent||'').trim();if(!name)throw Error('Ders adı okunamadı.');
 const items=[],seen=new Set(),files={};
 async function addFile(url,mid,title){const fid='file:'+mid+':'+(await hash(url)).slice(0,16);if(items.some(i=>i.id===fid))return;items.push({id:fid,kind:'material',title:title.slice(0,200),description:null,url,due_at:null});files[fid]=url;}
 for(const a of doc.querySelectorAll('#region-main a[href]')){
  if(signal?.aborted)throw Error('İşlem durduruldu.');
  let u;try{u=safe(a.getAttribute('href'),doc.baseURI);}catch{continue;}
  const match=u.pathname.match(/\/mod\/(assign|resource|url|page|folder)\/view.php$/);const mid=u.searchParams.get('id');
  if(!match||!/^\d+$/.test(mid||'')||seen.has(mid)||!a.textContent.trim())continue;
  seen.add(mid);if(seen.size>200)throw Error('Derste çok fazla içerik var; kontrol tamamlanmadı.');
  const kind=match[1],source=cleanLink(u.href);
  if(kind==='url'){items.push({id:'url:'+mid,kind:'material',title:a.textContent.trim().slice(0,200),description:null,url:source,due_at:null});continue;}
  const detail=await load(source,kind==='resource',profileId,signal);
  if(detail.fileUrl){let title=a.textContent.trim();try{const filename=decodeURIComponent(new URL(detail.fileUrl).pathname.split('/').pop());if(filename&&!/\.php$/i.test(filename))title=filename;}catch{}await addFile(detail.fileUrl,mid,title);continue;}
  const title=(detail.querySelector('#page-header h1,h1')?.textContent||a.textContent).trim().slice(0,200);
  const description=(detail.querySelector('#intro,.activity-description,#region-main .generalbox')?.textContent||'').trim().slice(0,10000)||null;
  items.push({id:kind+':'+mid,kind:kind==='assign'?'assignment':'material',title,description,url:source,due_at:kind==='assign'?dueDate(detail):null});
  for(const node of detail.querySelectorAll('#intro a[href],#region-main a[href*="pluginfile.php/"],#region-main .resourceworkaround a[href],#region-main .resourcecontent a[href],#region-main .resourcecontent object[data],#region-main .resourcecontent iframe[src],#region-main .foldertree a[href],#region-main .fp-filename a[href]')){
   try{const f=safe(node.getAttribute('href')||node.getAttribute('data')||node.getAttribute('src'),detail.baseURI);if(f.pathname.includes('/pluginfile.php/')){const url=cleanLink(f.href);const filename=decodeURIComponent(f.pathname.split('/').pop())||node.textContent?.trim()||title;await addFile(url,mid,filename);}}catch{}
  }
  if(items.length>300)throw Error('Derste çok fazla içerik var; kontrol tamamlanmadı.');
  await delay(150);
 }
 return {course:{id,name:name.slice(0,500),items},files};
}
async function scan(ids,jobId){
 activeScan?.controller.abort();const controller=new AbortController();activeScan={id:jobId,controller};
 const signal=controller.signal;
 authenticated(document);const profileId=identity(document);
 if(!Array.isArray(ids)||!ids.length||ids.length>2||ids.some(id=>!/^\d{1,12}$/.test(id)))throw Error('Geçersiz ders seçimi.');
 const account=await hash('huzem.halic.edu.tr/UE2/user/'+profileId),courses=[],files={},errors=[];
 for(const id of ids){
  try{const result=await scanCourse(id,profileId,signal);courses.push(result.course);Object.assign(files,result.files);}
  catch(error){if(signal.aborted)throw Error('İşlem durduruldu.');if(/hesabı değişti|oturumu kapalı|kimliği doğrulanamadı/.test(error.message))throw error;errors.push({id,message:'Ders okunamadı; sonraki turda tekrar denenecek.'});}
 }
 return {account,courses,files,errors};
}
async function file(url){
 const r=await fetchSource(url);if(/text\/html/i.test(r.headers.get('content-type')||''))throw Error('Dosya yerine giriş sayfası geldi.');
 if(Number(r.headers.get('content-length'))>MAX_FILE){await r.body?.cancel();throw Error('Dosya 5 MB sınırını aşıyor.');}
 const reader=r.body.getReader();let size=0;const parts=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_FILE){await reader.cancel();throw Error('Dosya 5 MB sınırını aşıyor.');}parts.push(value);}
 const data=new Uint8Array(size);let at=0;for(const part of parts){data.set(part,at);at+=part.length;}
 let binary='';for(let at=0;at<data.length;at+=8192)binary+=String.fromCharCode(...data.subarray(at,at+8192));return btoa(binary);
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 const run=async()=>{
  if(message.action==='discover'){authenticated(document);identity(document);return courseLinks(document);}
  if(message.action==='account'){authenticated(document);return hash('huzem.halic.edu.tr/UE2/user/'+identity(document));}
  if(message.action==='cancel'){if(activeScan?.id===message.jobId)activeScan.controller.abort();return {ok:true};}
  if(message.action==='scan')return scan(message.ids,message.jobId);
  if(message.action==='file')return file(message.url);
  throw Error('Bilinmeyen işlem.');
 };
 run().then(data=>respond({data})).catch(error=>respond({error:error.message}));return true;
});
