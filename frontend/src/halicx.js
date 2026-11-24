import {api,allPages} from './api.js';
export async function mountHalicx(panel,{terms,courses,e,onImported}){
 let status,items=[],secret='',busy=false,error='',loadVersion=0;
 const focusedCourse=Number(new URLSearchParams(location.hash.split('?')[1]).get('course'))||null;
 const dates=v=>v?new Date(v).toLocaleString('tr-TR'):'Henüz yok';
 function draw(){if(!panel.isConnected)return;
 panel.innerHTML=`<section class="panel panel-padding halicx-panel"><div class="page-title"><div><span class="eyebrow">OTOMATİK AKADEMİK AKTARIM</span><h2>HaliçX <span class="pill blue">${status?.unread||0} yeni</span></h2><p>Dersler, materyaller ve ödevler; açık okul oturumundan kişisel alanına.</p></div><a class="btn light" href="https://huzem.halic.edu.tr/UE2/my/" target="_blank" rel="noopener">HaliçX'i aç ↗</a></div>
 ${error?`<p role="alert">${e(error)}</p>`:''}
 ${status?.needs_repair?'<p role="alert">Eşleştirme süresi dolmuş veya oturum güvenliği değişmiş. Yeni bir anahtar oluşturup eklentiye gir.</p>':''}
 <p>Seçili ders: <strong>${status?.selected_courses?.length||0}</strong>${status?.expires_at?` · Anahtarın son geçerlilik tarihi: ${e(dates(status.expires_at))}`:''}</p>
 <p>Son içerik kontrolü: <strong>${e(dates(status?.last_sync_at))}</strong>${status?.last_error?` · <strong>${e(status.last_error)}</strong>`:''}</p>
 <p class="muted">Kontrol her 15 dakikada başlar; dersler ikişerli gruplarla, arada yaklaşık bir dakika bırakılarak taranır. İlk aktarım tüm seçili dersler bitene kadar devam eder. Tarayıcı ve HaliçX sekmesi açık, okul oturumu geçerli olmalıdır. Süre ders ve dosya sayısına göre değişir. Dosya kopyası sınırı 5 MB; hesap kotası 50 MB. Kopyalanamayan dosyalar HaliçX bağlantısıyla açılır.</p>
 <details ${secret?'open':''}><summary>Eşleştirme ve kurulum</summary><ol><li><a href="/halicx-extension.zip" download>Chrome / Edge eklentisini indir (v0.2.0)</a>, ZIP'i bir klasöre çıkar.</li><li>Chrome'da <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) → Geliştirici modu → Paketlenmemiş öğe yükle ile klasörü seç.</li><li>Aşağıdan hedef dönemi seçip anahtar oluştur. Anahtarı eklentiye gir; okul parolanı girme.</li><li>HaliçX'in Kurslarım ekranını açıp sayfayı yenile. Eklentiden görünür dersleri bul, aktarılacak dersleri seç ve onayla.</li></ol><p>Eski sürüm kuruluysa yeni ZIP içeriğiyle eklenti klasörünü güncelle, uzantılar ekranından eklentiyi yeniden yükle ve açık HaliçX sekmesini yenile.</p><p>Eklenti yalnızca HaliçX ve halicmind.com üzerinde çalışır; okul şifresini/çerezini kopyalamaz. Kaynakları okumak HaliçX'te görüntülendi kaydı oluşturabilir. Oturum kapalıysa tekrar giriş gerekir.</p>
 <form data-halicx-pair><label class="field">Hedef dönem<select name="term" required>${terms.map(t=>`<option value="${t.id}" ${t.id===status?.term_id?'selected':''}>${e(t.academic_year)} · ${e(t.term_type)}</option>`).join('')}</select></label><button class="btn primary" ${busy||!terms.length?'disabled':''}>${status?.connected?'Yeni anahtar oluştur (eskisini iptal eder)':'Eşleştirme anahtarı oluştur'}</button></form>${!terms.length?'<p>Önce akademik profilinden bir dönem oluştur.</p>':''}
 ${secret?`<div class="mail-note"><p>Bu anahtar yalnızca şimdi gösterilir. 90 gün geçerlidir. Yalnızca kendi eklentine gir.</p><input type="password" readonly id="halicx-key" value="${e(secret)}" aria-label="HaliçX eşleştirme anahtarı"><button class="btn light" data-halicx-copy>Anahtarı kopyala</button></div>`:''}</details>
 ${(status?.paired||status?.connected)?'<button class="btn light" data-halicx-disconnect>Eşleştirmeyi iptal et</button>':''}<button class="btn light" data-halicx-refresh>Durumu yenile</button>
 <h3>Derslerine gelen içerikler</h3>${focusedCourse?'<p>Seçili dersin içerikleri · <a href="#/connections">Tüm dersleri göster</a></p>':''}${!items.length?'<p class="muted">Henüz aktarılmış içerik yok. Eşleştirmeden sonra seçtiğin dersler ve içerikler burada görünür.</p>': [...new Set(items.filter(i=>!focusedCourse||i.enrollment_id===focusedCourse).map(i=>i.enrollment_id))].map(id=>`<details open><summary><strong>${e(items.find(i=>i.enrollment_id===id)?.course_name||courses.find(c=>c.id===id)?.course_name||'Ders #'+id)}</strong></summary><div>${items.filter(i=>i.enrollment_id===id).map(i=>`<article class="halicx-item"><div><strong>${e(i.title)}</strong> ${i.unread?'<span class="pill blue">Yeni / güncellendi</span>':''}<p>${i.kind==='assignment'?'Ödev':'Ders materyali'} · ${e(dates(i.updated_at))}</p>${i.description?`<details><summary>Açıklamayı göster</summary><p>${e(i.description)}</p></details>`:''}</div><div class="row">${i.file_size?`<a class="btn light small" href="/api/v1/integrations/halicx/files/${i.id}">Dosyayı indir</a>`:''}<a href="${e(i.source_url)}" target="_blank" rel="noopener">HaliçX'te aç ↗</a>${i.unread?`<button class="text-btn" data-halicx-read="${i.id}">Okundu</button>`:''}</div></article>`).join('')}</div></details>`).join('')}
 </section>`;
 }
 async function load(){
 const version=++loadVersion;
 const [nextStatus,nextItems]=await Promise.all([api('/integrations/halicx'),allPages('/integrations/halicx/items')]);
 if(version!==loadVersion||!panel.isConnected)return;
 if(status && nextStatus.last_sync_at && nextStatus.last_sync_at!==status.last_sync_at)await onImported();
 if(version!==loadVersion||!panel.isConnected)return;
 error='';status=nextStatus;items=[...new Map(nextItems.map(i=>[i.id,i])).values()];draw();
 }
 async function run(fn){if(busy)return;busy=true;loadVersion++;error='';draw();try{await fn();await load();}catch(err){error=err.message;draw();}finally{busy=false;draw();}}
 panel.addEventListener('submit',event=>{if(!event.target.matches('[data-halicx-pair]'))return;event.preventDefault();const term=Number(new FormData(event.target).get('term'));void run(async()=>{const r=await api('/integrations/halicx/pair',{method:'POST',body:{term_id:term}});secret=r.pairing_key;});});
 panel.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;
 if(target.hasAttribute('data-halicx-copy')){void navigator.clipboard.writeText(secret).then(()=>{target.textContent='Kopyalandı';}).catch(()=>{target.textContent='Anahtarı seçip kopyala';panel.querySelector('#halicx-key')?.select();});return;}
 if(target.hasAttribute('data-halicx-disconnect')){void run(async()=>{await api('/integrations/halicx',{method:'DELETE'});secret='';});}
 if(target.hasAttribute('data-halicx-refresh'))void run(async()=>{await onImported();});
 if(target.dataset.halicxRead)void run(()=>api('/integrations/halicx/items/'+target.dataset.halicxRead+'/read',{method:'POST'}));
 });
 await load();
 const timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);secret='';return;}if(!busy)void load().catch(err=>{if(panel.isConnected){error=err.message;draw();}});},60000);
}
