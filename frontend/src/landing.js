// Progressive enhancement: every section remains visible without JavaScript.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('reveal-pending');
      observer.unobserve(entry.target);
    }
  }, {threshold: 0.08});
  for (const section of document.querySelectorAll('.feature, .steps li, .connection-flow')) {
    if (section.getBoundingClientRect().top > innerHeight) {
      section.classList.add('reveal-ready', 'reveal-pending'); observer.observe(section);
    }
  }
  // Never leave informational content hidden if an observer is delayed.
  setTimeout(() => document.querySelectorAll('.reveal-pending').forEach(el => el.classList.remove('reveal-pending')), 5000);
}


// The gallery is decorative. All product information and navigation also exist as normal HTML.
const universe = document.querySelector('.universe');
if (universe) {
 const ring = document.querySelector('#gallery-ring');
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const narrow = matchMedia('(max-width: 760px)');
 const samples = [
  ['CEN 4100', 'Nesnelerin İnterneti', 'DERS NOTLARI', '07', 'Hafta 07 · Ders notları', 'notes'],
  ['TESLİM TAKVİMİ', 'Proje teslimi', 'BU HAFTA', '29', 'Kasım · Pazar / 23.59', 'date'],
  ['MAT 201', 'Lineer Cebir', 'ÇALIŞMA ALANI', '∑', 'Matematik · 5 AKTS', 'math'],
  ['KİŞİSEL AJANDAN', 'Haftalık plan', 'HAFTANIN PLANI', '03', '2 görev · 1 tamamlandı', 'plan'],
  ['TAS 201', 'Dönem projesi', 'PROJE DOSYASI', '↗', 'Tasarım stüdyosu · 6 AKTS', 'project'],
  ['DÖNEM GÖRÜNÜMÜ', '2026–2027', 'GÜZ / BAHAR', '26', 'Akademik yıl', 'term'],
 ];
 const structure = document.querySelector('#cylinder-structure');
 const dust = document.querySelector('#scene-dust');
 const camera = document.querySelector('.scene-camera');
 const viewport = document.querySelector('.scene-viewport');
 const copy = document.querySelector('.universe-copy');
 const caption = document.querySelector('.scene-caption p');
 const index = document.querySelector('.caption-index');
 const depth = document.querySelector('.depth-value');
 const toggle = document.querySelector('.motion-toggle');
 const core=document.querySelector('.mind-core'), stars=document.querySelector('.star-field');
 const vignette=document.querySelector('.scene-vignette'), lines=document.querySelector('.travel-lines');
 const hud=document.querySelector('.scene-hud'), progressBar=document.querySelector('.scene-progress i');
 const depthDot=document.querySelector('.depth-track i'), depthTrack=document.querySelector('.depth-track');
 const captionBox=document.querySelector('.scene-caption');
 let trackHeight=0, lastDepth=-1;
 let paused=reduced.matches, visible=true, frame=0, previous=0, elapsed=0;
 let current=0, target=0, sectionTop=0, travel=1, lastPhase=-1;
 let mouseX=0, mouseY=0, aimX=0, aimY=0, speed=0;
 const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
 // An inverse camera transform: position descends through the open mouth of the cylinder.
 const path=[
  {p:0,x:100,y:-1380,z:1430,pitch:-44,yaw:-12},
  {p:.22,x:10,y:-1170,z:290,pitch:-76,yaw:2},
  {p:.48,x:65,y:-570,z:70,pitch:-52,yaw:24},
  {p:.76,x:-45,y:30,z:110,pitch:-22,yaw:48},
  {p:1,x:0,y:350,z:160,pitch:-5,yaw:68},
 ];
 function cameraAt(p) {
  let i=0;while(i<path.length-2 && p>path[i+1].p)i++;
  const a=path[i],b=path[i+1],t=clamp((p-a.p)/(b.p-a.p));
  const result={};
  // Cubic Hermite interpolation keeps speed and direction continuous at each waypoint.
  for(const key of ['x','y','z','pitch','yaw']) {
   const before=path[Math.max(0,i-1)],after=path[Math.min(path.length-1,i+2)];
   const m0=(b[key]-before[key])/(b.p-before.p)*(b.p-a.p);
   const m1=(after[key]-a[key])/(after.p-a.p)*(b.p-a.p);
   result[key]=(2*t*t*t-3*t*t+1)*a[key]+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*b[key]+(t*t*t-t*t)*m1;
  }
  return result;
 }
 function buildGallery() {
  const count=narrow.matches?8:12, radius=narrow.matches?390:650;
  ring.replaceChildren();structure.replaceChildren();dust.replaceChildren();
  for(let row=0;row<5;row++)for(let col=0;col<count;col++) {
   const sample=samples[(col+row*2)%samples.length];
   const panel=document.createElement('div');
   panel.className=`gallery-panel panel-${sample[5]}`;
   panel.style.transform=`translate(-50%,-50%) rotateY(${col*360/count+(row%2?10:0)}deg) translateZ(${-radius}px) translateY(${(row-2)*220}px)`;
   const detail=sample[5]==='date'?'<div class="panel-week"><i>P</i><i>S</i><i>Ç</i><i>P</i><i>C</i><i>C</i><i class="selected">29</i></div>':sample[5]==='math'?'<div class="panel-graph"><i></i><i></i><i></i><i></i><i></i><i></i></div>':sample[5]==='notes'?'<div class="panel-files"><span>↳ Hafta 07 — Ders notları.pdf</span><span>↳ Uygulama ve çalışma soruları</span></div>':sample[5]==='plan'?'<div class="panel-checks"><span>✓ Notlarını düzenle</span><span>○ Projene devam et</span></div>':'<div class="panel-lines"><i></i><i></i><i></i></div>';
   panel.innerHTML=`<div class="panel-top"><span>${sample[0]}</span><span>↗</span></div><div class="panel-body"><small>${sample[2]}</small><strong>${sample[1]}</strong><b>${sample[3]}</b>${detail}</div><div class="panel-foot"><span>${sample[4]}</span><span>HM / ${String(row*count+col+1).padStart(2,'0')}</span></div>`;
   ring.append(panel);
  }
  for(const y of [-585,-110,585]) {
   const rim=document.createElement('div');rim.className='cylinder-rim';
   rim.style.cssText=`width:${radius*2+38}px;height:${radius*2+38}px;left:${-radius-19}px;top:${-radius-19}px;transform:translateY(${y}px) rotateX(90deg)`;
   structure.append(rim);
  }
  for(let i=0;i<count;i++) {
   const rail=document.createElement('div');rail.className='cylinder-rail';
   rail.style.transform=`rotateY(${i*360/count+15}deg) translateZ(${-radius-15}px)`;structure.append(rail);
  }
  for(let i=0;i<(narrow.matches?18:32);i++) {
   const particle=document.createElement('i');
   const a=i*2.39996,r=radius*(.25+((i*7)%11)/18);
   particle.style.transform=`translate3d(${Math.cos(a)*r}px,${-650+(i*197)%1250}px,${Math.sin(a)*r}px)`;
   dust.append(particle);
  }
 }
 function measure() {
  const rect=universe.getBoundingClientRect();sectionTop=rect.top+scrollY;
  travel=Math.max(1,universe.offsetHeight-innerHeight);trackHeight=depthTrack.clientHeight;readScroll();
 }
 function readScroll() {target=clamp((scrollY-sectionTop)/travel);requestDraw();}
 function updateToggle() {toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'Hareketi başlat <span aria-hidden="true">▷</span>':'Hareketi durdur <span aria-hidden="true">Ⅱ</span>';}
 function draw(now) {
  frame=0;
  const dt=previous?Math.min((now-previous)/1000,.05):1/60;previous=now;
  if(!paused && !reduced.matches) {
   const old=current;current=mix(current,target,1-Math.exp(-8*dt));
   if(Math.abs(target-current)<.00001)current=target;
   speed=mix(speed,(current-old)/dt,1-Math.exp(-6*dt));
   aimX=mix(aimX,mouseX,1-Math.exp(-4*dt));aimY=mix(aimY,mouseY,1-Math.exp(-4*dt));elapsed+=dt;
  }
  const p=reduced.matches?0:current;
  const c=cameraAt(p), mobile=narrow.matches;
  const lens=mobile?620:1000;
  const shift=(1-smooth(0,.27,p))*(mobile?0:20);
  const pitch=c.pitch+aimY*1.7+(reduced.matches?0:Math.sin(elapsed*.32)*.3);
  const yaw=c.yaw+aimX*2.6+(reduced.matches?0:Math.sin(elapsed*.22)*.55);
  const bank=reduced.matches?0:clamp(speed,-.7,.7)*-3+aimX*.4;
  const x=c.x*(mobile?.4:1), z=c.z*(mobile?.66:1);
  viewport.style.transform=`translateX(${shift}%)`;
  viewport.style.perspective=`${lens}px`;
  camera.style.transform=`translateZ(${lens}px) rotateZ(${bank}deg) rotateX(${pitch}deg) rotateY(${yaw}deg) translate3d(${-x}px,${-c.y}px,${-z}px)`;
  // Only compositor transforms and opacity change each frame. No per-frame layout reads
  // or inherited CSS-variable changes across the hundreds of decorative card children.
  const moving=reduced.matches?0:Math.min(.65,Math.abs(speed)*1.8);
  lines.style.opacity=String(moving);
  copy.style.opacity=String(1-smooth(.02,.22,p));
  copy.style.transform=`translateY(${-p*50}px)`;
  captionBox.style.opacity=String(smooth(.16,.3,p));
  core.style.transform=`translateZ(-130px) rotateY(${-yaw}deg) rotateX(${-pitch}deg) scale(${mobile?.8:1})`;
  stars.style.transform=`translate(${aimX*8}px,${aimY*6}px) scale(1.03)`;
  vignette.style.opacity=String(1-p*.8);
  hud.style.opacity=String(.25+p*.6);
  progressBar.style.transform=`scaleX(${p})`;
  depthDot.style.transform=`translateY(${p*trackHeight}px)`;
  const inert=!reduced.matches && p>.22;if(copy.inert!==inert)copy.inert=inert;
  const phase=p<.3?0:p<.7?1:2;
  if(phase!==lastPhase) {
   const labels=[['Bir dönem, tek görünüm.','Derslerini bir arada gör.'],['Notların ve ödevlerin.','Derslere göre düzenli.'],['Teslim tarihlerin.','Haftanı buradan planla.']];
   caption.innerHTML=labels[phase][0]+'<br><em>'+labels[phase][1]+'</em>';index.textContent=`0${phase+1} / 03`;lastPhase=phase;
  }
  const depthStep=p<.08?0:Math.round(p*100);
  if(depthStep!==lastDepth){depth.textContent=depthStep===0?'GİRİŞ / 000':`DERİNLİK / ${String(depthStep).padStart(3,'0')}`;lastDepth=depthStep;}
  if(!paused && visible && !document.hidden && !reduced.matches)requestDraw();
 }
 function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
 toggle.addEventListener('click',()=>{paused=!paused;previous=0;updateToggle();requestDraw();});
 reduced.addEventListener('change',()=>{paused=reduced.matches;current=target;aimX=aimY=mouseX=mouseY=0;measure();updateToggle();requestDraw();});
 narrow.addEventListener('change',()=>{buildGallery();measure();});
 addEventListener('scroll',readScroll,{passive:true});
 addEventListener('resize',measure,{passive:true});
 universe.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse' || reduced.matches)return;mouseX=clamp(event.clientX/innerWidth*2-1,-1,1);mouseY=clamp(event.clientY/innerHeight*2-1,-1,1);},{passive:true});
 universe.addEventListener('pointerleave',()=>{mouseX=mouseY=0;});
 document.addEventListener('visibilitychange',()=>{previous=0;if(!document.hidden)requestDraw();});
 if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=0;if(visible)requestDraw();}).observe(universe);
 buildGallery();measure();current=target;updateToggle();requestDraw();
}
