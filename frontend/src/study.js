import {api,allPages} from './api.js';
import {rememberForms,cleanForm,setFormBusy,applyFieldErrors} from './forms.js';
import {studyDate,studyMinutes} from './study-data.js';
export async function mountStudy(panel,{courses,termId,e,onChanged}){
 let rows=[],summary,archived=false,loading=false,clientId=crypto.randomUUID();
 const active=courses.filter(c=>!c.archived_at&&(!termId||c.term_id===termId));
 panel.innerHTML=`<section class="panel panel-padding"><h2>Çalışmanı kaydet</h2><p>Buradaki süreler senin girdiğin kayıtlardır; tarayıcı kullanımından veya ödev sayısından üretilmez.</p>${active.length?`<form data-study-form data-form="study"><div class="form-grid"><label class="field">Ders<select name="enrollment_id" required><option value="">Ders seç</option>${active.map(c=>`<option value="${c.id}">${e(c.course_code)} · ${e(c.course_name)}</option>`).join('')}</select></label><label class="field">Tarih<input name="studied_on" type="date" required min="1900-01-01" max="${studyDate()}" value="${studyDate()}"></label><label class="field">Süre (dakika)<input name="duration_minutes" type="number" required min="1" max="720" step="1" placeholder="Örn. 45"></label><label class="field">Not (isteğe bağlı)<input name="notes" maxlength="2000" placeholder="Çalıştığın konu"></label></div><div class="form-error" role="alert"></div><button type="submit" class="btn primary">Çalışmayı kaydet</button></form>`:'<p>Çalışma eklemek için seçili döneme bir ders ekle.</p><a class="btn primary" href="#/courses">Derslerime git</a>'}</section><p data-study-saved role="status"></p><div class="study-summary" aria-live="polite"></div><section class="panel panel-padding"><div class="section-head"><h2>Çalışma geçmişin</h2><label class="check-line"><input type="checkbox" data-study-archives>Arşivlenenleri göster</label></div><div data-study-error role="alert"></div><div data-study-list>Yükleniyor…</div></section>`;
 rememberForms(panel);
 function draw(){if(!panel.isConnected)return;
 const total=studyMinutes(rows,termId),days=summary?.days||[],maximum=Math.max(1,...days.map(d=>d.minutes));
 panel.querySelector('.study-summary').innerHTML=`<article class="panel panel-padding"><span>Bugün kaydettiğin</span><strong>${summary?.today_minutes||0} dk</strong></article><article class="panel panel-padding"><span>Son 7 gün</span><strong>${summary?.total_minutes||0} dk</strong></article><article class="panel panel-padding"><span>Seçili dönemde toplam</span><strong>${total} dk</strong></article><div class="panel panel-padding study-days">${days.map(d=>`<div><span>${e(new Date(d.date+'T12:00:00+03:00').toLocaleDateString('tr-TR',{weekday:'short'}))}</span><progress max="${maximum}" value="${d.minutes}" aria-label="${e(d.date)}: ${d.minutes} dakika"></progress><small>${d.minutes} dk</small></div>`).join('')}</div>`;
 const shown=rows.filter(r=>archived||!r.archived_at);
 panel.querySelector('[data-study-list]').innerHTML=shown.length?shown.map(r=>`<article class="study-record"><div><strong>${e(r.course_name)}</strong><small>${e(r.studied_on)} · ${r.duration_minutes} dakika${r.archived_at?' · Arşivde':''}</small>${r.notes?`<p>${e(r.notes)}</p>`:''}</div><button type="button" class="btn light small" data-study-id="${r.id}" data-study-op="${r.archived_at?'restore':'archive'}">${r.archived_at?'Geri yükle':'Arşivle'}</button></article>`).join(''):'<p class="muted">Henüz çalışma kaydı yok.</p>';
 }
 async function load(){const query=termId?'?term_id='+termId:'';[rows,summary]=await Promise.all([allPages('/study-sessions'+(query?query+'&':'?')+'include_archived=true'),api('/analytics/study'+query)]);message('');draw();}
 const message=text=>{if(panel.isConnected)panel.querySelector('[data-study-error]').textContent=text;};
 panel.addEventListener('change',event=>{if(event.target.matches('[data-study-archives]')){archived=event.target.checked;draw();}});
 panel.addEventListener('submit',async event=>{
  if(!event.target.matches('[data-study-form]'))return;event.preventDefault();event.stopPropagation();const form=event.target;if(form.dataset.saving==='true')return;
  const data=Object.fromEntries(new FormData(form));setFormBusy(form,true);form.querySelector('.form-error').textContent='';
  try{await api('/study-sessions',{method:'POST',body:{...data,notes:data.notes.trim()||null,enrollment_id:Number(data.enrollment_id),duration_minutes:Number(data.duration_minutes),client_id:clientId}});clientId=crypto.randomUUID();form.reset();cleanForm(form);panel.querySelector('[data-study-saved]').textContent='Çalışman kaydedildi.';try{await load();await onChanged();}catch{message('Çalışma kaydedildi; liste yenilenemedi. Verileri yenileyebilirsin.');}}
  catch(error){if(error.name==='AbortError')return;if(!applyFieldErrors(form,error.fields))form.querySelector('.form-error').textContent=error.message;}
  finally{setFormBusy(form,false);}
 });
 panel.addEventListener('click',async event=>{const b=event.target.closest('[data-study-op]');if(!b||loading)return;loading=true;b.disabled=true;
  try{await api('/study-sessions/'+b.dataset.studyId+(b.dataset.studyOp==='restore'?'/restore':''),{method:b.dataset.studyOp==='restore'?'POST':'DELETE'});message('');await load();await onChanged();}catch(error){if(error.name!=='AbortError')message(error.message);}finally{loading=false;if(b.isConnected)b.disabled=false;}
 });
 try{await load();}catch(error){message(error.message);panel.querySelector('[data-study-list]').innerHTML='<button type="button" class="btn light" data-study-retry>Yeniden dene</button>';}
 panel.addEventListener('click',event=>{if(event.target.closest('[data-study-retry]'))void load().then(()=>message('')).catch(error=>message(error.message));});
}
