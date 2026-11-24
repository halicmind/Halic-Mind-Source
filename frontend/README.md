# HalicMind frontend

HTML lives in `index.html`; browser JavaScript, CSS and SVG assets live in `src/`. The API remains in `../backend/`. There is no framework dependency or install step for the frontend build.

## Cloudflare Pages

Connect `halicmind/Halic-Mind-Source` and set:

- Production branch: `main`
- Root directory: `frontend`
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
- Runtime variable: `API_ORIGIN=https://halic-mind-source.onrender.com` (also declared in `wrangler.jsonc`)

The build copies browser assets into `dist/assets`, and installs the Pages Function at `dist/_worker.js`. Only `/api/*` calls invoke the Function; static requests use Pages directly. The Function forwards the browser's cookies, request body and Origin to the fixed Render backend and does not cache API responses. No database password, Gmail credentials, JWT key or Supabase secret belongs in Pages.

Render serves the student interface with `SERVE_FRONTEND=true` and `PUBLIC_ORIGIN=https://halicmind.com`.

## Local development

Run the backend from the repository root with `python -m uvicorn app.main:app --reload`. By default it serves these frontend files at `/` and `/assets` for local development. This avoids a separate proxy setup. To build the independent frontend, run `npm run build` from this directory.

## Görsel sistem

Tanıtım: `landing-template.mjs`, `src/landing.css`, `src/landing.js`. Kök ve `/about/` girişsiz, HTML içinde tam içerik sunar. Ajanda ve ders çizimleri açıklanan örnek veridir; canlı öğrenci verisi değildir.

Öğrenci alanı: mevcut bileşenler üzerinde `src/halic-theme.css`; lacivert/mavi/kâğıt tonları, Plus Jakarta Sans ve Instrument Serif. Yazı tipleri ve OFL lisansları `src/fonts/` altında, aynı kaynaktan sunulur. Üniversite logosu kullanılmaz; bağımsız proje açıklaması korunur.

Animasyonlar `prefers-reduced-motion` tercihini izler. JavaScript kapalı olduğunda tanıtım ve politikalar okunabilir kalır. IntersectionObserver yalnızca hareketi iyileştirir; metni gizlemez. Üretim derlemesi `npm run build`.
