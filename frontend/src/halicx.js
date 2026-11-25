import {api,allPages} from './api.js';
import {extensionMessage} from './halicx-connect.js';
export async function mountHalicx(panel,{terms,courses,e,onImported,activeTermId,profileReady=false}){
 let status,items=[],secret='',busy=true,error='',notice='',extensionReady=false,loadVersion=0;
 let selectedTerm=terms.find(t=>t.id===activeTermId)?.id || terms[0]?.id;
 const focusedCourse=Number(new URLSearchParams(location.hash.split('?')[1]).get('course'))||null;
 const windows=/Windows/i.test(navigator.userAgent);
 const dates=v=>v?new Date(v).toLocaleString('tr-TR'):'Henüz yok';
 function draw(){if(!panel.isConnected)return;
 panel.innerHTML=`<section class="panel panel-padding halicx-panel"><div class="page-title"><div><span class="eyebrow">OTOMATİK AKADEMİK AKTARIM</span><h2>HaliçX <span class="pill blue">${status?.unread||0} yeni</span></h2><p>Dersler, materyaller ve ödevler; açık okul oturumundan kişisel alanına.</p></div><a class="btn light" href="https://huzem.halic.edu.tr/UE2/my/" target="_blank" rel="noopener">HaliçX'i aç ↗</a></div>
 ${notice?`<p class="notice" role="status">${e(notice)}</p>`:''}${busy?'<p role="status">HaliçX bağlantısı kontrol ediliyor…</p>':''}${error?`<p role="alert">${e(error)}</p>`:''}
 ${status?.needs_repair?'<p role="alert">Eşleştirme süresi dolmuş veya oturum güvenliği değişmiş. Hesabını aşağıdan yeniden bağla.</p>':''}
 <p>Seçili ders: <strong>${status?.selected_courses?.length||0}</strong>${status?.expires_at?` · Anahtarın son geçerlilik tarihi: ${e(dates(status.expires_at))}`:''}</p>
 <p>Son içerik kontrolü: <strong>${e(dates(status?.last_sync_at))}</strong>${status?.last_error?` · <strong>${e(status.last_error)}</strong>`:''}</p>
 <div class="halicx-setup-grid"><article><span class="eyebrow">01 · DÖNEMİN</span><h3>${terms.length?'Dönemin hazır':'Önce dönemini hazırla'}</h3><p>Derslerinin hangi döneme aktarılacağını seç.</p>${!terms.length?(profileReady?'<button type="button" class="btn primary" data-action="new-term">Dönem oluştur</button><p>Dönemini burada oluşturup bağlantıya devam edebilirsin.</p>':'<a class="btn primary" href="#/profile">Akademik profilini tamamla</a><p>Profilini tamamladıktan sonra dönemini oluştur.</p>'):''}</article><article><span class="eyebrow">02 · TARAYICI UZANTISI</span><h3>${extensionReady?'Uzantı hazır':'Uzantıyı bir kez kur'}</h3><p>${extensionReady?'Bu tarayıcıda Haliç Mind uzantısı bulundu.':'Chrome veya Edge uzantısını yükle, ardından bu sayfayı yenile.'}</p>${!extensionReady?(windows?'<a class="btn primary" href="/halicx-setup-windows.exe" download>Windows kurulum yardımcısını indir</a><p class="muted">İndirilen dosyayı aç. Uzantı klasörü hazırlanır ve Chrome kurulum ekranı açılır.</p>':'<a class="btn light" href="/halicx-extension.zip" download>Chrome / Edge uzantısını indir</a>'):''}</article><article><span class="eyebrow">03 · HESABINI BAĞLA</span><h3>Anahtar kopyalamadan eşleştir</h3><p>Okul parolan Haliç Mind’e aktarılmaz. Uzantı bu hesabına bağlanır.</p><form data-halicx-pair><label class="field">Hedef dönem<select name="term" required aria-describedby="halicx-term-help" ${busy||!terms.length?'disabled':''}>${!terms.length?'<option value="">Önce dönem oluştur</option>':''}${terms.map(t=>`<option value="${t.id}" ${t.id===selectedTerm?'selected':''}>${e(t.academic_year)} · ${e({fall:'Güz',spring:'Bahar',summer:'Yaz',annual:'Yıllık'}[t.term_type])}</option>`).join('')}</select></label><button class="btn primary" ${busy||!terms.length||!extensionReady?'disabled':''}>${status?.connected?'Bu tarayıcıya yeniden bağla':'HaliçX’i hesabıma bağla'}</button></form><p id="halicx-term-help" class="muted">${!terms.length?'Henüz dönem kaydın yok. İlk adımdan dönem oluşturduğunda bu liste açılacak.':'Seçtiğin döneme ders ve materyaller aktarılacak.'}</p></article></div>
 <p class="muted">Bağladıktan sonra HaliçX’i aç ve tarayıcının uzantılar menüsünden Haliç Mind’i seç. Derslerini seçip aktarımı onayladığında otomatik kontrol başlar. Tarayıcı ve HaliçX sekmesi açık kalmalıdır.</p>
 <details ${secret?'open':''}><summary>Eşleştirme ve kurulum</summary><h3>Windows’ta kolay kurulum</h3><ol><li>Kurulum yardımcısını indirip aç. Uzantıyı doğru klasöre çıkarır, klasör yolunu kopyalar ve Chrome’u açar.</li><li>Chrome’da <strong>Geliştirici modu</strong> → <strong>Paketlenmemiş öğe yükle</strong> seç. Dosya penceresinin adres çubuğuna <strong>Ctrl+V</strong> ile yolu yapıştır, Enter ve <strong>Klasör Seç</strong> de.</li><li>Yardımcıdaki <strong>Hesabıma dön</strong> düğmesine bas. Burada hedef dönemi seçip hesabını bağla.</li></ol><p class="muted">Yönetici izni gerekmez. Yardımcı dijital imzalı değildir; Windows yayımlayıcı uyarısı gösterebilir. Güvenlik ayarlarını değiştirmez. Kurulum klasörünü silme.</p><h3>ZIP ile kurulum / diğer sistemler</h3><a href="/halicx-extension.zip" download>Uzantının ZIP dosyasını indir</a><p>Uzantı henüz Chrome Web Store’da yayımlanmadı. İlk kurulum için indirdiğin ZIP’i bir klasöre çıkar. Chrome’da <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) → Geliştirici modu → Paketlenmemiş öğe yükle ile klasörü seç. Sonra bu sayfayı yenile.</p><p>Eski sürüm kuruluysa klasörünü v0.3.0 ile güncelle, uzantıyı yeniden yükle ve Haliç Mind ile HaliçX sekmelerini yenile.</p><p>Otomatik eşleştirme kullanılamıyorsa hedef dönemi seçip aşağıdaki yedek yöntemi kullanabilirsin.</p><button type="button" class="btn light" data-halicx-manual ${busy||!terms.length?'disabled':''}>Manuel eşleştirme anahtarı oluştur</button>
 ${secret?`<div class="mail-note"><p>Bu anahtar yalnızca şimdi gösterilir. 90 gün geçerlidir. Yalnızca kendi eklentine gir.</p><input type="password" readonly id="halicx-key" value="${e(secret)}" aria-label="HaliçX eşleştirme anahtarı"><button class="btn light" data-halicx-copy>Anahtarı kopyala</button></div>`:''}</details>
 ${(status?.paired||status?.connected)?'<button class="btn light" data-halicx-disconnect>Eşleştirmeyi iptal et</button>':''}<button class="btn light" data-halicx-refresh>Durumu yenile</button>
 <h3>Derslerine gelen içerikler</h3>${focusedCourse?'<p>Seçili dersin içerikleri · <a href="#/connections">Tüm dersleri göster</a></p>':''}${!items.length?'<p class="muted">Henüz aktarılmış içerik yok. Eşleştirmeden sonra seçtiğin dersler ve içerikler burada görünür.</p>': [...new Set(items.filter(i=>!focusedCourse||i.enrollment_id===focusedCourse).map(i=>i.enrollment_id))].map(id=>`<details open><summary><strong>${e(items.find(i=>i.enrollment_id===id)?.course_name||courses.find(c=>c.id===id)?.course_name||'Ders #'+id)}</strong></summary><div>${items.filter(i=>i.enrollment_id===id).map(i=>`<article class="halicx-item"><div><strong>${e(i.title)}</strong> ${i.unread?'<span class="pill blue">Yeni / güncellendi</span>':''}<p>${i.kind==='assignment'?'Ödev':'Ders materyali'} · ${e(dates(i.updated_at))}</p>${i.description?`<details><summary>Açıklamayı göster</summary><p>${e(i.description)}</p></details>`:''}</div><div class="row">${i.file_size?`<a class="btn light small" href="/api/v1/integrations/halicx/files/${i.id}">Dosyayı indir</a>`:''}<a href="${e(i.source_url)}" target="_blank" rel="noopener">HaliçX'te aç ↗</a>${i.unread?`<button class="text-btn" data-halicx-read="${i.id}">Okundu</button>`:''}</div></article>`).join('')}</div></details>`).join('')}
 </section>`;
 }
 async function load(){
 const version=++loadVersion;
 const results=await Promise.allSettled([api('/integrations/halicx'),allPages('/integrations/halicx/items')]);
 if(version!==loadVersion||!panel.isConnected)return;
 if(results.some(r=>r.status==='rejected'&&r.reason?.name==='AbortError'))return;
 const before=JSON.stringify({status,items,error});
 const nextStatus=results[0],nextItems=results[1];
 const newSync=nextStatus.status==='fulfilled'&&status&&nextStatus.value.last_sync_at&&nextStatus.value.last_sync_at!==status.last_sync_at;
 if(nextStatus.status==='fulfilled')status=nextStatus.value;
 if(nextItems.status==='fulfilled')items=[...new Map(nextItems.value.map(i=>[i.id,i])).values()];
 error=results.filter(r=>r.status==='rejected').map(r=>r.reason.message).join(' ');
 if(newSync){try{await onImported();}catch{error+=' İçerikler alındı; ders listesini yenilemek için tekrar dene.';}}
 if(version!==loadVersion||!panel.isConnected)return;
 if(before!==JSON.stringify({status,items,error}))draw();
 }
 async function detectExtension(){try{await extensionMessage('ping');extensionReady=true;}catch{extensionReady=false;}draw();}
 async function run(fn){if(busy)return;busy=true;loadVersion++;error='';notice='';draw();try{await fn();await load();}catch(err){error=err.message;draw();}finally{busy=false;draw();}}
 async function pair(manual=false){const term=Number(selectedTerm);if(!term)throw Error('Önce bir dönem seç.');if(!manual)await extensionMessage('ping');const r=await api('/integrations/halicx/pair',{method:'POST',body:{term_id:term}});secret=r.pairing_key;if(!manual){await extensionMessage('pair',secret,15000);secret='';notice='Hesabın uzantıya bağlandı. HaliçX’i aç, uzantıdan derslerini seç ve aktarımı onayla.';}}
 panel.addEventListener('change',event=>{if(event.target.name==='term')selectedTerm=Number(event.target.value);});
 panel.addEventListener('submit',event=>{if(!event.target.matches('[data-halicx-pair]'))return;event.preventDefault();event.stopPropagation();void run(()=>pair());});
 panel.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;
 if(target.hasAttribute('data-halicx-manual')){void run(()=>pair(true));return;}
 if(target.hasAttribute('data-halicx-copy')){void navigator.clipboard.writeText(secret).then(()=>{target.textContent='Kopyalandı';}).catch(()=>{target.textContent='Anahtarı seçip kopyala';panel.querySelector('#halicx-key')?.select();});return;}
 if(target.hasAttribute('data-halicx-disconnect')){void run(async()=>{await api('/integrations/halicx',{method:'DELETE'});secret='';});}
 if(target.hasAttribute('data-halicx-refresh'))void run(async()=>{await detectExtension();try{await onImported();}catch{notice='Ders listesi yenilenemedi; bağlantı durumunu tekrar kontrol ediyoruz.';}});
 if(target.dataset.halicxRead)void run(()=>api('/integrations/halicx/items/'+target.dataset.halicxRead+'/read',{method:'POST'}));
 });
 draw();
 void detectExtension();
 try{await load();}catch(err){if(err.name!=='AbortError')error=err.message;}finally{busy=false;draw();}
 const timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);secret='';return;}if(!busy&&!document.hidden)void load().catch(err=>{if(panel.isConnected){error=err.message;draw();}});},60000);
}
