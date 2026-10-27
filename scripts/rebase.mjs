// Moves a finished build under a sub-folder, for the GitHub Pages preview
// (k-laz.github.io/medunion/ instead of the root of a domain).
// Rewrites every root link ("/uslugi/", "/_astro/x.css", "/search.json")
// in the built HTML, CSS and JS to start with the folder.
//
//   node scripts/rebase.mjs dist /medunion
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dir = 'dist', base = ''] = process.argv.slice(2);
if (!base) { console.log('No base given, nothing to do.'); process.exit(0); }

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

let changed = 0;
for (const f of await walk(dir)) {
  if (!/\.(html|css|js|json|xml|txt)$/.test(f)) continue;
  const before = await readFile(f, 'utf8');
  let s = before;
  if (f.endsWith('.html') || f.endsWith('.js')) {
    // href="/x", src="/x", action="/x" (not "//cdn"), also inside scripts
    s = s.replace(/\b(href|src|action|data-src)="\/(?!\/)/g, `$1="${base}/`);
  }
  if (f.endsWith('.css') || f.endsWith('.html')) s = s.replace(/url\(\s*(["']?)\/(?!\/)/g, `url($1${base}/`);
  if (f.endsWith('.js') || f.endsWith('.html')) s = s.replace(/(["'`])\/(search\.json|_astro\/)/g, `$1${base}/$2`);
  if (f.endsWith('search.json')) s = s.replace(/"u":"\//g, `"u":"${base}/`);
  if (s !== before) { await writeFile(f, s); changed++; }
}
console.log(`Rebased ${changed} files under ${base}/`);
