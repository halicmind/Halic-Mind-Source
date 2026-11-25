export function extensionMessage(action, key, timeout=2500) {
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const done=(error,value)=>{clearTimeout(timer);window.removeEventListener('message',receive);error?reject(error):resolve(value);};
    const receive=event=>{
      if(event.source!==window || event.origin!==location.origin || event.data?.source!=='halicmind-extension' || event.data.id!==id)return;
      done(event.data.ok?null:Error('Uzantıya bağlantı kurulamadı. Uzantıyı güncelleyip tekrar dene.'),event.data);
    };
    const timer=setTimeout(()=>done(Error('Uzantı bulunamadı. Önce uzantıyı kur veya güncelle, sonra bu sayfayı yenile.')),timeout);
    window.addEventListener('message',receive);
    window.postMessage({source:'halicmind-connect',id,action,...(key?{key}:{})},location.origin);
  });
}
