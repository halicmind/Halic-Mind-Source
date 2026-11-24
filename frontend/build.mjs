import './build-public.mjs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const output = new URL('dist/', root);
if (!fileURLToPath(output).startsWith(fileURLToPath(root)) || fileURLToPath(output) === fileURLToPath(root)) {
  throw new Error('Build output must stay inside the frontend directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(new URL('assets/', output), { recursive: true });
await cp(new URL('src/', root), new URL('assets/', output), { recursive: true });
const digest = createHash('sha256');
async function hashSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    digest.update(path.pathname.slice(root.pathname.length));
    if (entry.isDirectory()) await hashSources(path); else digest.update(await readFile(path));
  }
}
await hashSources(new URL('src/', root));
const index = await readFile(new URL('index.html', root), 'utf8');
digest.update(index);
const version = digest.digest('hex').slice(0, 12);
await cp(new URL('src/', root), new URL(`assets/${version}/`, output), { recursive: true });
await writeFile(new URL('index.html', output), index.replaceAll('"/assets/', `"/assets/${version}/`));
await cp(new URL('public/', root), output, { recursive: true });
await cp(new URL('cloudflare/worker.mjs', root), new URL('_worker.js', output));
await writeFile(new URL('_routes.json', output), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
await writeFile(new URL('_headers', output), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: no-cache
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
`);
console.log(`Pages output: ${fileURLToPath(output)}`);
