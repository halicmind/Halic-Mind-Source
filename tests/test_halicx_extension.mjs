import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
const source=await readFile(new URL('../extension/halicx/background.js',import.meta.url),'utf8');
const KEY='a'.repeat(43),ACCOUNT='a'.repeat(64);
function harness({state={},courses=['1','2','3','4','5'],scan,fetchOverride,account=ACCOUNT}={}){
 const storage={key:KEY,paused:false,...state},alarms=new Map(),requests=[],messages=[];let listener,alarmListener;
 const chrome={
  storage:{local:{get:async keys=>keys==null?structuredClone(storage):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(storage[k])])),set:async v=>Object.assign(storage,structuredClone(v)),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete storage[k];},setAccessLevel:async()=>{}}},
  alarms:{get:async k=>alarms.get(k),create:async(k,v)=>alarms.set(k,v),clear:async k=>alarms.delete(k),onAlarm:{addListener:fn=>alarmListener=fn}},
  tabs:{query:async()=>[{id:1,active:true}],sendMessage:async(_,m)=>{messages.push(m);if(m.action==='account')return {data:account};if(m.action==='scan')return {data:scan?await scan(m.ids):{account:ACCOUNT,courses:m.ids.map(id=>({id,name:'Ders',items:[]})),files:{},errors:[]}};if(m.action==='file')return {data:Buffer.from('pdf').toString('base64')};}},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  runtime:{id:'test',getPlatformInfo:async()=>({}),onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}},onMessage:{addListener:fn=>listener=fn}},
 };
 const context=vm.createContext({chrome,fetch:async(url,options)=>{const path=url.split('/halicx')[1];requests.push({path,...options});if(fetchOverride){const r=await fetchOverride(path,options);if(r)return r;}return Response.json(path==='/settings'?{selected_courses:courses,account:ACCOUNT}:path==='/selection'?{selected:JSON.parse(options.body).courses}:path==='/sync'?{changed:1,uploads:[],warning:null}:{changed:true,ok:true});},Response,URL,AbortSignal,AbortController,Uint8Array,crypto:webcrypto,atob,Error,Number,Math,Date,Promise,setTimeout,clearTimeout,setInterval,clearInterval});
 vm.runInContext(source,context);
 const message=(m,sender={id:'test'})=>new Promise(resolve=>{if(listener(m,sender,resolve)!==true)resolve(null);});
 const idle=async()=>{for(let i=0;i<300;i++){if(!vm.runInContext('busy',context))return;await new Promise(r=>setTimeout(r,5));}throw Error('worker did not finish');};
 return {storage,alarms,requests,messages,message,idle,alarm:async()=>{alarmListener({name:'halicx-next'});await new Promise(r=>setTimeout(r,0));await idle();}};
}
test('all course chunks continue on persisted alarms, including after worker restart',async()=>{
 const h=harness();await h.message({action:'sync'});await h.idle();assert.equal(h.storage.cursor,2);assert.equal(h.alarms.get('halicx-next').delayInMinutes,1);
 await h.alarm();assert.equal(h.storage.cursor,4);
 const restarted=harness({state:h.storage});await restarted.message({action:'sync'});await restarted.idle();
 assert.deepEqual(restarted.messages.find(m=>m.action==='scan').ids,['5']);assert.equal(restarted.storage.cursor,0);assert.ok(restarted.storage.lastFullSync);assert.equal(restarted.alarms.has('halicx-next'),false);
});
test('one failed course does not prevent another course or stall the cursor',async()=>{
 const h=harness({scan:ids=>({account:ACCOUNT,courses:[{id:ids[1],name:'Ders',items:[]}],files:{},errors:[{id:ids[0]}]})});
 await h.message({action:'sync'});await h.idle();assert.equal(h.storage.cursor,2);assert.equal(h.storage.roundErrors,1);assert.ok(h.requests.some(r=>r.path==='/sync'));assert.equal(h.storage.lastFullSync,undefined);
});
test('school account mismatch really pauses automatic transfers',async()=>{
 const h=harness({account:'b'.repeat(64)});await h.message({action:'sync'});await h.idle();assert.equal(h.storage.paused,true);assert.equal(h.requests.some(r=>r.path==='/sync'),false);assert.equal(h.alarms.has('halicx-next'),false);
});
test('invalid replacement key keeps the existing key and pause state',async()=>{
 const h=harness({fetchOverride:(_,o)=>o.headers.Authorization.endsWith('b'.repeat(43))?Response.json({detail:'bad key'},{status:401}):null});
 const r=await h.message({action:'save',key:'b'.repeat(43)});assert.ok(r.error);assert.equal(h.storage.key,KEY);assert.equal(h.storage.paused,false);
});
test('pausing during a school scan prevents later upload and status overwrite',async()=>{
 let release,started;const began=new Promise(r=>started=r);const scan=new Promise(r=>release=r);
 const h=harness({scan:async()=>{started();return scan;}});await h.message({action:'sync'});await began;
 await h.message({action:'pause'});release({account:ACCOUNT,courses:[{id:'1'}],files:{},errors:[]});await h.idle();
 assert.equal(h.storage.paused,true);assert.equal(h.requests.some(r=>r.path==='/sync'),false);assert.equal(h.storage.status,'Otomatik eşitleme duraklatıldı.');
});
test('unchanged files are hashed locally and do not upload again',async()=>{
 const fileHash=Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from('pdf'))).toString('hex');
 const h=harness({state:{pendingUploads:[{item_id:7,url:'https://huzem.halic.edu.tr/UE2/pluginfile.php/1/a.pdf',file_hash:fileHash}],cursor:0}});
 await h.message({action:'sync'});await h.idle();assert.equal(h.requests.some(r=>r.path==='/files/7'),false);assert.equal(h.storage.pendingUploads.length,0);
});
test('selection requires explicit consent',async()=>{
 const h=harness();assert.ok((await h.message({action:'select',courses:['1']})).error);assert.equal(h.requests.some(r=>r.path==='/selection'),false);
});

test('large pending file queues resume in another worker round',async()=>{
 const h=harness({state:{cursor:0,pendingUploads:Array.from({length:25},(_,i)=>({item_id:i+1,url:'https://huzem.halic.edu.tr/UE2/pluginfile.php/1/'+i+'.pdf'}))}});
 await h.message({action:'sync'});await h.idle();assert.equal(h.storage.pendingUploads.length,5);assert.equal(h.storage.lastFullSync,undefined);
 await h.alarm();assert.equal(h.storage.pendingUploads.length,0);assert.ok(h.storage.lastFullSync);assert.equal(h.requests.filter(r=>r.path.startsWith('/files/')).length,25);
});

test('website pairing accepts only its top-level application tab and never grants sync controls',async()=>{
 const h=harness();const sender={id:'test',tab:{id:3},frameId:0,url:'https://halicmind.com/app/#/connections'};
 assert.equal((await h.message({action:'bridge-ping'},sender)).data.version,'0.3.0');
 assert.equal(await h.message({action:'pause'},sender),null);
 assert.equal(await h.message({action:'bridge-pair',key:'b'.repeat(43)},{...sender,url:'https://evil.example/app/'}),null);
 assert.equal(await h.message({action:'bridge-pair',key:'b'.repeat(43)},{...sender,frameId:1}),null);
 assert.equal(h.storage.key,KEY);
 assert.ok((await h.message({action:'bridge-pair',key:'b'.repeat(43)},sender)).data);
 assert.equal(h.storage.key,'b'.repeat(43));
});
