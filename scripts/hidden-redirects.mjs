// After a build: the server's redirect list, plus a redirect for every page
// marked "Скрыть с сайта" at /admin/ (hidden: true). A hidden doctor, article,
// news item or offer is left out of the site; its address goes to the nearest
// section above it that the site has (a doctor's specialty list, the article's
// topic, /news/, /sales/), so links and search results keep working.
//
//   node scripts/hidden-redirects.mjs <dist> <redirects in> <redirects out> <content folder>...
//   node scripts/hidden-redirects.mjs dist deploy/redirects.nginx.conf dist.redirects.conf src/content
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [dist, input, output, ...roots] = process.argv.slice(2);
if (!roots.length) throw new Error('usage: hidden-redirects.mjs <dist> <in> <out> <content folder>...');

async function walk(d) {
  if (!existsSync(d)) return [];
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const onSite = (url) => existsSync(join(dist, decodeURI(url), 'index.html'));
const hidden = [];
for (const root of roots) {
  for (const f of await walk(root)) {
    const fm = (await readFile(f, 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (!/^hidden:\s*true\s*$/m.test(fm)) continue;
    const url = fm.match(/^url:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim();
    if (!url || onSite(url)) continue; // no address yet (a new entry), or the page is there after all
    const parts = url.split('/').filter(Boolean);
    let to = '/';
    for (let n = parts.length - 1; n > 0; n--) {
      const up = `/${parts.slice(0, n).join('/')}/`;
      if (onSite(up)) { to = up; break; }
    }
    hidden.push([url, to]);
  }
}

let conf = existsSync(input) ? await readFile(input, 'utf8') : '';
for (const [from, to] of hidden) {
  const line = `location = "${from}" { return 301 ${to}; }`;
  const re = new RegExp(`^location = "${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" .*$`, 'm');
  conf = re.test(conf) ? conf.replace(re, line) : conf.replace(/\n?$/, `\n${line}\n`);
}
await writeFile(output, conf);
console.log(`Hidden pages: ${hidden.length} redirected (${output})`);
