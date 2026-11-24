import {landing} from './landing-template.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
import {privacyPolicy, termsPolicy} from './src/policies.js';
const stylesheet = `@import url('/assets/fonts/jakarta.css');
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f8f7f2;color:#101e49;font:15px/1.9 'Plus Jakarta Sans',sans-serif}header,main,footer{max-width:860px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;border-bottom:1px solid #dcdedc;font:16px/1.5 system-ui}a{color:#214ee9;text-underline-offset:4px}header strong{font-size:24px}main{padding-top:60px;padding-bottom:60px}h1{font-size:clamp(36px,6vw,54px);line-height:1.15;margin:16px 0 30px;letter-spacing:-1.5px}h2{font:600 23px/1.4 system-ui;margin-top:38px}.eyebrow,footer{font:14px/1.7 system-ui;color:#646c7f}.legal-lead{font-size:21px}code{font-size:13px;overflow-wrap:anywhere}footer{border-top:1px solid #dcdedc}nav{display:flex;gap:20px;flex-wrap:wrap}@media(max-width:520px){header,main,footer{padding:24px}header{gap:16px;flex-wrap:wrap}}`;
const base = new URL('public/', import.meta.url);
await mkdir(base,{recursive:true});
await writeFile(new URL('legal.css',base),stylesheet);
for (const [slug,title,body] of [['privacy','Gizlilik Politikası',privacyPolicy],['terms','Kullanım Koşulları',termsPolicy]]) {
 await mkdir(new URL(slug+'/',base),{recursive:true});
 await writeFile(new URL(slug+'/index.html',base),`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Haliç Mind</title><meta name="description" content="Haliç Mind — ${title}"><link rel="stylesheet" href="/legal.css"></head><body><header><strong><a href="/about/">Haliç Mind</a></strong><a href="/app/">Öğrenci alanı →</a></header><main><div class="eyebrow">${slug==='about'?'KİŞİSEL AKADEMİK PLANLAMA':'Son güncelleme: 24 Kasım 2026'}</div><h1>${title}</h1>${body}</main><footer><nav aria-label="Bilgilendirme"><a href="/about/">Uygulama hakkında</a><a href="/privacy/">Gizlilik Politikası</a><a href="/terms/">Kullanım Koşulları</a><a href="mailto:halicmind@gmail.com">İletişim</a></nav><p>Bağımsız öğrenci projesi.</p></footer></body></html>`);
}

const landingDocument = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101e49"><meta name="description" content="Haliç Mind: derslerini, ödevlerini ve dönemlerini kendi ritminde düzenle. Haliç öğrencileri için bağımsız akademik planlama uygulaması."><title>Haliç Mind · Kendi ritminde.</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/landing.css"><script type="module" src="/assets/landing.js"></script></head><body>'+landing+'</body></html>';
await mkdir(new URL('about/', base), {recursive:true});
await writeFile(new URL('index.html', base), landingDocument);
await writeFile(new URL('about/index.html', base), landingDocument);
