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

Render serves the student interface with `SERVE_FRONTEND=true` and `PUBLIC_ORIGIN=https://halic-mind-source.onrender.com`.

## Local development

Run the backend from the repository root with `python -m uvicorn app.main:app --reload`. By default it serves these frontend files at `/` and `/assets` for local development. This avoids a separate proxy setup. To build the independent frontend, run `npm run build` from this directory.
