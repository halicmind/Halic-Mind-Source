export class ApiError extends Error {
  constructor(message, status, retryAfter = 0, fields = {}, code = null) { super(message); this.status = status; this.retryAfter = retryAfter; this.fields = fields; this.code = code; }
}
let sessionEpoch=0;
export function invalidateSessionRequests(){sessionEpoch++;}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) { onUnauthorized = handler; }
const fieldNames = {duration_minutes:'Çalışma süresi',studied_on:'Çalışma tarihi',notes:'Not',client_id:'Kayıt kimliği',title:'Ödev başlığı',enrollment_id:'Ders',due_at:'Teslim tarihi',estimated_minutes:'Tahmini süre',description:'Açıklama',priority:'Önem',full_name:'Ad soyad',email:'E-posta',password:'Parola',token:'Doğrulama kodu',grade:'Not',current_class:'Sınıf',entry_year:'Giriş yılı',custom_ects:'AKTS',program_id:'Bölüm',curriculum_id:'Ders planı',academic_year:'Akademik yıl',curriculum_period_number:'Dönem numarası',custom_course_code:'Ders kodu',custom_course_name:'Ders adı'};
function errorMessage(body) {
  if (typeof body?.detail === 'string') return body.detail;
  if (Array.isArray(body?.detail)) return body.detail.map(error => {
    const field = error.loc?.at(-1);
    const prefix = fieldNames[field] || 'Bilgi';
    if (error.type === 'string_too_short' && field === 'password') return 'Parolan en az 12 karakter olmalı.';
    if (error.type === 'string_too_long' && field === 'password') return 'Parolan en fazla 128 karakter olabilir.';
    if (error.type === 'string_too_short') return error.ctx?.min_length>1?`${prefix} en az ${error.ctx.min_length} karakter olmalı.`:`${prefix} alanını doldur.`;
    if (error.type === 'string_too_long') return `${prefix} çok uzun; daha kısa bir değer gir.`;
    if (error.type === 'missing') return `${prefix} alanını doldur.`;
    if (field === 'token') return 'E-postadaki 43 karakterlik doğrulama kodunun tamamını gir.';
    if (error.msg?.startsWith('Value error, ')) return error.msg.slice(13);
    return `${prefix} bilgisini kontrol et.`;
  }).join(' ');
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}
export async function api(path, {method='GET',body,form=false,quiet401=false,signal,timeoutMs=30000}={}) {
  const epoch=sessionEpoch;
  const headers = {'X-HalicMind-Web':'1','Accept':'application/json'};
  if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  let response,data,invalidJSON=false;
  try {
    for (let attempt = 0; ; attempt++) {
    const controller=new AbortController();let timedOut=false;invalidJSON=false;
    const cancel=()=>controller.abort();
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    const deadline=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    try {
      response = await fetch(`/api/v1${path}`, {method,headers,credentials:'same-origin',signal:controller.signal,
        body:body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body)});
      if(response.status!==204)data=await response.json().catch(error=>{if(controller.signal.aborted)throw error;invalidJSON=true;return null;});
    } catch(error) {
      if(timedOut && !signal?.aborted){if(method==='GET' && attempt<1 && epoch===sessionEpoch)continue;throw new ApiError(method==='GET'?'Sunucu yanıtı gecikti. Biraz bekleyip yeniden dene.':'Yanıt alınamadı. Tekrar kaydetmeden önce güncel listeyi kontrol et.',0,0,{},'request_timeout');}
      throw error;
    } finally {clearTimeout(deadline);signal?.removeEventListener('abort',cancel);}
    if(epoch!==sessionEpoch)throw new DOMException('Session changed','AbortError');
    if (method !== 'GET' || ![502,503,504,520,521,522,523,524].includes(response.status) || attempt >= 4) break;
    await new Promise((resolve,reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Aborted','AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort',cancel); resolve(); }, Math.min(2000 * 2 ** attempt, 10000));
      if (signal?.aborted) cancel(); else signal?.addEventListener('abort',cancel,{once:true});
    });
    }
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof ApiError) throw error;
    throw new ApiError('Bağlantı kurulamadı. İnternet bağlantını ve uygulamanın açık olduğunu kontrol et.',0);
  }
  if (response.status === 204) return null;
  if(epoch!==sessionEpoch)throw new DOMException('Session changed','AbortError');
  if(response.ok && invalidJSON)throw new ApiError('Sunucudan beklenmeyen bir yanıt geldi. Sayfayı yeniden yükleyebilirsin.',502,0,{},'invalid_response');
  if (!response.ok) {
    if (response.status === 401 && !quiet401) onUnauthorized();
    if ([502,503,504,520,521,522,523,524].includes(response.status)) {
      throw new ApiError('Sunucu şu anda hazırlanıyor veya geçici olarak yanıt veremiyor. Biraz bekleyip yeniden dene.', response.status);
    }
    const retry = Number(response.headers.get('Retry-After') || 0);
    const fields={};if(Array.isArray(data?.detail))for(const error of data.detail){const name=error.loc?.at(-1);if(name && name!=='body')fields[name]=errorMessage({detail:[error]});}
    let code = response.headers.get('X-HalicMind-Error');
    // The frontend and API can deploy separately. Recognize the older login response too.
    if (!code && path === '/auth/login' && response.status === 403 && data?.detail === 'Giriş yapmadan önce e-posta adresinizi doğrulayın.') {
      code = 'email_verification_required';
    }
    throw new ApiError(errorMessage(data) + (response.status === 429 && retry ? ` ${retry} saniye sonra tekrar deneyebilirsin.` : ''), response.status, retry, fields, code);
  }
  return data;
}
export async function allPages(path,options={}) {
  let previousPage='';
  const rows = [];
  for (let offset=0; ; offset+=200) {
    const separator = path.includes('?') ? '&' : '?';
    const page = await api(`${path}${separator}limit=200&offset=${offset}`,options);
    if(!Array.isArray(page))throw new ApiError('Liste verisi okunamadı. Yeniden dene.',502);
    const signature=JSON.stringify(page.map(row=>row.id));
    if(page.length===200 && (signature===previousPage || offset>=100000))throw new ApiError('Liste tamamlanamadı. Filtreleyip tekrar dene.',502);
    previousPage=signature;
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
