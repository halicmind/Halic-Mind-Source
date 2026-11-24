import { api } from './api.js';

export async function mountConnections(panel, { terms, onImported, e }) {
  const outcome = new URLSearchParams(location.hash.split('?')[1]).get('google');
  let connection, courses = [], preview, busy = true;
  let error = outcome === 'error' ? 'Google bağlantısı tamamlanamadı. Gerekli izinleri vererek tekrar dene; okul yönetici onayı gerekebilir.' : '';
  let notice = outcome === 'connected' ? 'Google Classroom hesabın bağlandı.' : '';
  let termId = terms[0]?.id;
  const selected = new Set();
  const date = value => new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
  function draw() {
    if (!panel.isConnected) return;
    panel.setAttribute('aria-busy', String(busy));
    panel.innerHTML = `<div class="panel panel-padding">
      <h2>Google Classroom</h2><p>Derslerini ve teslim tarihi olan ödevlerini seçtiğin döneme aktar.</p>
      ${error ? `<p role="alert">${e(error)}</p>` : ''}
      ${notice ? `<p role="status">${e(notice)}</p>` : ''}
      ${!connection ? '<p role="status">Bağlantı kontrol ediliyor…</p>' : !connection.enabled ? '<p>Classroom bağlantısı henüz etkinleştirilmedi.</p>' : !connection.connected ? `
        <p>Google hesabının kimliği, e-posta adresi, derslerin ve kendi ödevlerin için okuma izni istenir. Yenileme anahtarı şifreli saklanır; seçtiğin kayıtlar onayından sonra aktarılır. <a href="/privacy/" target="_blank" rel="noopener">Gizlilik Politikası</a></p>
        <button class="btn primary" data-classroom-action="connect" ${busy ? 'disabled' : ''}>Google Classroom’u bağla</button>` : `
        <p><strong>${e(connection.email)}</strong> bağlı.${connection.last_sync_at ? ` Son aktarım: ${e(date(connection.last_sync_at))}.` : ''}</p>
        <button class="btn light" data-classroom-action="disconnect" ${busy ? 'disabled' : ''}>Bağlantıyı kaldır</button>
        <button class="btn light" data-classroom-action="connect" ${busy ? 'disabled' : ''}>Google izinlerini yenile</button>
        <button class="btn light" data-classroom-action="reload" ${busy ? 'disabled' : ''}>Dersleri yenile</button>
        ${!terms.length ? '<p>Aktarmadan önce <a href="#/profile">akademik profilini ve dönemini oluştur</a>.</p>' : `
        <form data-classroom-form>
          <div class="field"><label for="classroom-term">Aktarılacak HalicMind dönemi</label>
          <select id="classroom-term" name="term_id" required ${busy ? 'disabled' : ''}>
          ${terms.map(term => `<option value="${term.id}" ${Number(termId) === term.id ? 'selected' : ''}>${e(term.academic_year)} · ${e(({fall:'Güz',spring:'Bahar',summer:'Yaz',annual:'Yıllık'})[term.term_type])}</option>`).join('')}</select></div>
          <fieldset ${busy ? 'disabled' : ''}><legend>Aktarılacak dersler</legend>
          ${courses.length ? courses.map(course => `<label class="check-line"><input type="checkbox" name="course_id" value="${e(course.id)}" ${selected.has(course.id) ? 'checked' : ''}> ${e(course.name)}${course.section ? ` · ${e(course.section)}` : ''}</label>`).join('') : '<p>Bu Google hesabında öğrencisi olduğun aktif ders bulunamadı.</p>'}
          </fieldset><p>En fazla 20 ders seçebilirsin. İzinler okulun Google politikalarına bağlıdır.</p>
          <button class="btn primary" type="submit" ${busy || !courses.length ? 'disabled' : ''}>Önizlemeyi hazırla</button>
        </form>`}
        ${preview ? `<section class="panel panel-padding"><h3>Aktarım önizlemesi</h3>
          <p>Hedef: ${e(terms.find(term=>term.id === preview.term_id)?.academic_year)} dönemi. Tekrar aktarım aynı kayıtları günceller; tamamlanma ve arşiv durumlarını korur.</p>
          ${preview.courses.map(course => `<details open><summary>${e(course.name)} · ${course.assignments.length} ödev</summary>
            <ul>${course.assignments.map(work => `<li><strong>${e(work.title)}</strong> — ${e(date(work.due_at))}</li>`).join('')}</ul></details>`).join('')}
          <p>${preview.undated_count} ödevin teslim tarihi bulunmadığı için aktarılmayacak. Saatler İstanbul saatidir.</p>
          <button class="btn primary" data-classroom-action="import" ${busy ? 'disabled' : ''}>Onayla ve döneme aktar</button>
        </section>` : ''}`}
      ${!busy && !connection ? '<button class="btn light" data-classroom-action="reload">Bağlantıyı tekrar kontrol et</button>' : ''}
      ${busy ? '<p role="status">İşlem sürüyor…</p>' : ''}
    </div>`;
  }
  async function load() {
    connection = await api('/integrations/google');
    courses = [];
    courses = connection.enabled && connection.connected ? await api('/integrations/google/courses') : [];
    const available=new Set(courses.map(c=>c.id));
    for(const id of selected)if(!available.has(id))selected.delete(id);
  }
  async function run(action) {
    if (busy) return;
    busy = true; error = ''; notice = ''; draw();
    try { await action(); }
    catch (failure) { error = failure.message || 'Classroom işlemi tamamlanamadı.'; }
    finally { busy = false; draw(); }
  }
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-classroom-action]')?.dataset.classroomAction;
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    void run(async () => {
      if (action === 'connect') {
        const result = await api('/integrations/google/connect', {method:'POST'});
        location.assign(result.authorization_url);
      } else if (action === 'disconnect') {
        if (!window.confirm('Google bağlantısı kaldırılsın mı? Aktardığın ders ve ödevler korunacak.')) return;
        await api('/integrations/google', {method:'DELETE'}); preview = null; await load();
      } else if (action === 'reload') {
        preview = null; await load();
      } else if (action === 'import' && preview) {
        const result = await api('/integrations/google/import', {method:'POST', body:{preview_id:preview.preview_id}});
        preview = null;
        notice = `${result.courses_created} ders ve ${result.assignments_created} ödev eklendi; ${result.assignments_updated} ödev güncellendi. ${result.archived_skipped} arşivli, ${result.undated_skipped} tarihsiz kayıt aktarılmadı. ${result.assignments_unchanged||0} ödev zaten güncel.`;
        try { await onImported(); await load(); } catch { error='Aktarım kaydedildi; güncel liste alınamadı. Sayfayı yenileyebilirsin.'; }
      }
    });
  });
  panel.addEventListener('change', event => {
    if (event.target.name === 'term_id') { termId = Number(event.target.value); preview = null; }
    if (event.target.name === 'course_id') {
      if (event.target.checked) selected.add(event.target.value); else selected.delete(event.target.value);
      preview = null;
    }
    draw();
  });
  panel.addEventListener('submit', event => {
    if (!event.target.matches('[data-classroom-form]')) return;
    event.preventDefault(); event.stopPropagation();
    void run(async () => {
      if (!selected.size || selected.size > 20) throw new Error('1–20 arasında ders seç.');
      preview = await api('/integrations/google/preview', {method:'POST', body:{term_id:Number(termId),course_ids:[...selected]}});
    });
  });
  draw();
  try { await load(); }
  catch (failure) { error = failure.message; }
  busy = false; draw();
}
