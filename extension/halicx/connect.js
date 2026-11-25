// The school password and extension key are never sent back to the page.
window.addEventListener('message', async event => {
  if(event.source!==window || event.origin!=='https://halicmind.com' || window.top!==window)return;
  const m=event.data;
  if(m?.source!=='halicmind-connect' || typeof m.id!=='string' || m.id.length>80)return;
  if(!['ping','pair'].includes(m.action))return;
  try {
    const reply=await chrome.runtime.sendMessage({action:m.action==='ping'?'bridge-ping':'bridge-pair',key:m.key});
    if(!reply || reply.error)throw Error(reply?.error || 'Uzantı yanıt vermedi.');
    window.postMessage({source:'halicmind-extension',id:m.id,ok:true,version:'0.3.0'},event.origin);
  } catch {
    window.postMessage({source:'halicmind-extension',id:m.id,ok:false},event.origin);
  }
});
