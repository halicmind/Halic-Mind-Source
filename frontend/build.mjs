import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const output = new URL('dist/', root);
if (fileURLToPath(output) !== fileURLToPath(new URL('dist/', root))) throw new Error('Invalid build output');
await rm(output, { recursive: true, force: true });
await mkdir(new URL('assets/', output), { recursive: true });
await cp(new URL('src/', root), new URL('assets/', output), { recursive: true });
await cp(new URL('index.html', root), new URL('index.html', output));
await cp(new URL('cloudflare/worker.mjs', root), new URL('_worker.js', output));
await writeFile(new URL('_routes.json', output), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
await writeFile(new URL('_headers', output), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: no-cache
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
`);
console.log(`Pages output: ${fileURLToPath(output)}`);
