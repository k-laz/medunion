// Downloads every image and document the pages still load from the old
// server (https://medunion.group/upload/...) into public/upload/, and points
// the pages at the local copies. Run it on a computer that can open
// medunion.group, after `npm run convert`:
//
//   npm run files
//
// Safe to run again: files already downloaded are skipped. After this,
// `npm run convert` keeps using the local copies.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const OLD_SITE = process.env.OLD_SITE || 'https://medunion.group';
const CONTENT = 'src/content';
const PUBLIC = 'public';
const CONCURRENCY = 3;
const DELAY_MS = 200;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fileRe = new RegExp(`${esc(OLD_SITE)}(/upload/[^)\\s"'<>]+)`, 'g');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
const exists = (p) => stat(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = await walk(CONTENT);
const wanted = new Set();
for (const f of files) for (const m of (await readFile(f, 'utf8')).matchAll(fileRe)) wanted.add(m[1]);
console.log(`Files referenced from pages: ${wanted.size}`);

const ok = new Set();
const failed = [];
const queue = [...wanted];
async function worker() {
  while (queue.length) {
    const path = queue.shift();
    const local = join(PUBLIC, decodeURIComponent(path));
    if (await exists(local)) { ok.add(path); continue; }
    try {
      const res = await fetch(OLD_SITE + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await mkdir(dirname(local), { recursive: true });
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
      ok.add(path);
      process.stdout.write('.');
    } catch (e) {
      failed.push(`${path}  ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\nDownloaded or already there: ${ok.size}. Failed: ${failed.length}`);
for (const f of failed) console.log('  FAILED', f);

// Point pages at the local copies (only for files that downloaded).
let changed = 0;
for (const f of files) {
  const before = await readFile(f, 'utf8');
  const after = before.replace(fileRe, (all, path) => (ok.has(path) ? path : all));
  if (after !== before) { await writeFile(f, after); changed++; }
}
console.log(`Pages updated: ${changed}. Files are in public/upload/.`);
