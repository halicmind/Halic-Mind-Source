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
  ['CEN 4100', 'Nesnelerin İnterneti', 'DERS NOTLARI', '07', 'Bağlantılı bir dünya.', 'notes'],
  ['TESLİM TAKVİMİ', 'Önündeki adım belli.', 'BU HAFTA', '29', 'Kasım · Pazar / 23.59', 'date'],
  ['MAT 201', 'Bir fikrin geometrisi.', 'ÇALIŞMA ALANI', '∑', 'Matematik · 5 AKTS', 'math'],
  ['KİŞİSEL AJANDAN', 'Biraz daha ferah.', 'HAFTANIN PLANI', '03', 'Küçük adımlar. Büyük fark.', 'plan'],
  ['TAS 201', 'Fikirden projeye.', 'PROJE DOSYASI', '↗', 'Tasarım stüdyosu · 6 AKTS', 'project'],
  ['DÖNEM GÖRÜNÜMÜ', 'Yeni bir sayfa.', 'GÜZ / BAHAR', '26', 'Kendi ritminde ilerle.', 'term'],
 ];
 function buildGallery() {
  const count = narrow.matches ? 8 : 12;
  const radius = narrow.matches ? 360 : 620;
  ring.replaceChildren();
  for (let row=0;row<3;row++) for (let col=0;col<count;col++) {
   const sample=samples[(col+row*2)%samples.length];
   const panel=document.createElement('div');
   panel.className=`gallery-panel panel-${sample[5]}`;
   panel.style.transform=`translate(-50%,-50%) rotateY(${col*360/count+(row%2?15:0)}deg) translateZ(${-radius}px) translateY(${(row-1)*180}px)`;
   panel.innerHTML=`<div class="panel-top"><span>${sample[0]}</span><span>↗</span></div><div class="panel-body"><small>${sample[2]}</small><strong>${sample[1]}</strong><b>${sample[3]}</b><div class="panel-lines"><i></i><i></i><i></i></div></div><div class="panel-foot"><span>${sample[4]}</span><span>HM / ${String(row*count+col+1).padStart(2,'0')}</span></div>`;
   ring.append(panel);
  }
 }
 let paused = reduced.matches, visible=true, frame=0, previous=0, rotation=0, lastProgress=-1;
 const toggle=document.querySelector('.motion-toggle');
 function updateToggle() { toggle.setAttribute('aria-pressed',String(paused)); toggle.innerHTML=paused?'Hareketi başlat <span aria-hidden="true">▷</span>':'Hareketi durdur <span aria-hidden="true">Ⅱ</span>'; }
 function draw(now) {
  frame=0;
  const rect=universe.getBoundingClientRect();
  const progress=Math.max(0,Math.min(1,-rect.top/(universe.offsetHeight-innerHeight)));
  if (!paused && previous && visible) rotation+=Math.min(now-previous,40)*.0018;
  previous=now;
  const p=reduced.matches?0:progress;
  document.querySelector('.universe-copy').inert = !reduced.matches && progress > .32;
  universe.style.setProperty('--journey',p.toFixed(4));
  universe.style.setProperty('--camera-tilt',`${-8-p*52}deg`);
  universe.style.setProperty('--camera-turn',`${rotation+p*36}deg`);
  universe.style.setProperty('--camera-depth',`${160-p*340}px`);
  universe.style.setProperty('--scene-x',`${(1-p)*19}%`);
  if (Math.abs(progress-lastProgress)>.005) {
   universe.style.setProperty('--copy-opacity',String(Math.max(0,1-progress*3.5)));
   universe.style.setProperty('--caption-opacity',String(Math.min(1,Math.max(0,(progress-.2)*3))));
   document.querySelector('.caption-index').textContent=progress<.35?'01 / 03':progress<.75?'02 / 03':'03 / 03';
   lastProgress=progress;
  }
  if (!paused && visible && !document.hidden) frame=requestAnimationFrame(draw);
 }
 function requestDraw() { if (!frame) frame=requestAnimationFrame(draw); }
 toggle.addEventListener('click',()=>{paused=!paused;previous=0;updateToggle();requestDraw();});
 reduced.addEventListener('change',()=>{paused=reduced.matches;updateToggle();requestDraw();});
 narrow.addEventListener('change',()=>{buildGallery();requestDraw();});
 addEventListener('scroll',requestDraw,{passive:true});
 addEventListener('resize',requestDraw,{passive:true});
 document.addEventListener('visibilitychange',()=>{previous=0;requestDraw();});
 if ('IntersectionObserver' in window) new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=0;requestDraw();}).observe(universe);
 buildGallery();updateToggle();requestDraw();
}
