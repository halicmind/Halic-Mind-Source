const $=id=>document.getElementById(id);
async function call(message){const r=await chrome.runtime.sendMessage(message);if(r.error)throw Error(r.error);return r.data;}
async function action(fn){try{$('status').textContent='İşleniyor…';await fn();}catch(e){$('status').textContent=e.message;}}
$('save').onclick=()=>action(async()=>{await call({action:'save',key:$('key').value.trim()});$('key').value='';$('status').textContent='Eşleştirildi. Şimdi HaliçX derslerini seç.';});
$('discover').onclick=()=>action(async()=>{const courses=await call({action:'discover'});$('courses').replaceChildren();for(const c of courses){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='course';input.value=c.id;label.append(input,document.createTextNode(' '+c.name));$('courses').append(label);}$('status').textContent=courses.length+' ders bulundu. Aktarılacak dersleri seç.';});
$('selection').onsubmit=e=>{e.preventDefault();void action(async()=>{const courses=[...document.querySelectorAll('input[name=course]:checked')].map(e=>e.value);if(!courses.length)throw Error('En az bir ders seç.');await call({action:'select',courses});$('status').textContent='Otomatik eşitleme başlatıldı.';});};
for(const name of ['sync','pause','forget'])$(name).onclick=()=>action(async()=>{await call({action:name});$('status').textContent=name==='sync'?'Kontrol başlatıldı; sonucu birazdan görebilirsin.':'Ayar kaydedildi.';});
chrome.storage.local.get(['status','lastSync']).then(s=>{$('status').textContent=(s.status||'Henüz eşleştirilmedi.')+(s.lastSync?' Son kontrol: '+new Date(s.lastSync).toLocaleString('tr-TR'):'');});
chrome.storage.onChanged.addListener(changes=>{if(changes.status)$('status').textContent=changes.status.newValue;});
