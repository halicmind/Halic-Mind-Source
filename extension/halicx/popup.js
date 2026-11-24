const $=id=>document.getElementById(id);
let busy=false;
async function call(message){const r=await chrome.runtime.sendMessage(message);if(!r||r.error)throw Error(r?.error||'Eklenti yanıt vermedi.');return r.data;}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{$('status').textContent='İşleniyor…';await fn();}catch(e){$('status').textContent=e.message;}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function fullSync(value){$('last-full').textContent=value?'Son eksiksiz kontrol turu: '+new Date(value).toLocaleString('tr-TR'):'Henüz tüm seçili derslerin eksiksiz kontrolü tamamlanmadı.';}
$('save').onclick=()=>action(async()=>{await call({action:'save',key:$('key').value.trim()});$('key').value='';$('courses').replaceChildren();$('status').textContent='Eşleştirildi. Şimdi HaliçX derslerini seç.';});
$('discover').onclick=()=>action(async()=>{
 const courses=await call({action:'discover'});const {selectedCourses=[]}=await chrome.storage.local.get('selectedCourses');
 $('courses').replaceChildren();for(const c of courses){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='course';input.value=c.id;input.checked=selectedCourses.includes(c.id);label.append(input,document.createTextNode(' '+c.name));$('courses').append(label);}
 const hidden=selectedCourses.filter(id=>!courses.some(c=>c.id===id));
 // Preserve selected courses that are outside Moodle's current page/filter.
 for(const id of hidden){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='course';input.value=id;input.checked=true;label.append(input,document.createTextNode(' Önceden seçilen ders #'+id+' (bu sayfada görünmüyor)'));$('courses').append(label);}
 $('status').textContent=courses.length?'Bu sayfada '+courses.length+' ders bulundu. Diğer sayfa veya filtrelerdeki dersler görünmeyebilir.':'Ders bulunamadı. HaliçX Kurslarım ekranını açıp derslerin yüklenmesini bekle, sonra tekrar dene.';
});
$('selection').onsubmit=e=>{e.preventDefault();void action(async()=>{const courses=[...document.querySelectorAll('input[name=course]:checked')].map(e=>e.value);if(!courses.length||courses.length>30)throw Error('1–30 arasında ders seç.');if(!$('consent').checked)throw Error('Otomatik aktarım onayını işaretle.');await call({action:'select',courses,consent:true});$('status').textContent='Otomatik eşitleme başlatıldı.';});};
for(const name of ['sync','pause','forget'])$(name).onclick=()=>action(async()=>{await call({action:name});if(name==='forget'){$('courses').replaceChildren();$('key').value='';$('consent').checked=false;fullSync(null);}$('status').textContent=name==='sync'?'Kontrol başlatıldı; sonucu birazdan görebilirsin.':name==='pause'?'Otomatik eşitleme duraklatıldı.':'Yerel anahtar kaldırıldı. Sunucudaki eşleştirmeyi de Bağlantılar ekranından iptal edebilirsin.';});
chrome.storage.local.get(['status','lastFullSync']).then(s=>{$('status').textContent=s.status||'Henüz eşleştirilmedi.';fullSync(s.lastFullSync);});
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.status)$('status').textContent=changes.status.newValue||'';if(changes.lastFullSync)fullSync(changes.lastFullSync.newValue);});
