// After a build: the server's redirect list, plus a redirect for every page
// marked "Скрыть с сайта" at /admin/ (hidden: true). A hidden doctor, article,
// news item or offer is left out of the site; its address goes to the nearest
// section above it that the site has (a doctor's specialty list, the article's
// topic, /news/, /sales/), so links and search results keep working.
//
// With --old <report.csv> (the old site's address list from the importer), also
// every address that worked on the old site and has neither a page nor a redirect
// now (a page deleted at /admin/) goes to the nearest section above it.
//
//   node scripts/hidden-redirects.mjs <dist> <redirects in> <redirects out> [--old <report.csv>] <content folder>...
//   node scripts/hidden-redirects.mjs dist deploy/redirects.nginx.conf dist.redirects.conf --old import/report.csv src/content
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const oldAt = args.indexOf('--old');
const oldReport = oldAt >= 0 ? args.splice(oldAt, 2)[1] : undefined;
const [dist, input, output, ...roots] = args;
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

const onSite = (url) => { try { return existsSync(join(dist, decodeURIComponent(url), 'index.html')); } catch { return existsSync(join(dist, url, 'index.html')); } };
const sectionAbove = (url) => {
  const parts = url.split('/').filter(Boolean);
  for (let n = parts.length - 1; n > 0; n--) {
    const up = `/${parts.slice(0, n).join('/')}/`;
    if (onSite(up)) return up;
  }
  return '/';
};
const hidden = [];
for (const root of roots) {
  for (const f of await walk(root)) {
    const fm = (await readFile(f, 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (!/^hidden:\s*true\s*$/m.test(fm)) continue;
    const url = fm.match(/^url:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim();
    if (!url || onSite(url)) continue; // no address yet (a new entry), or the page is there after all
    hidden.push([url, sectionAbove(url)]);
  }
}

let conf = existsSync(input) ? await readFile(input, 'utf8') : '';
// Old-site addresses that lost their page (deleted at /admin/)
const gone = [];
if (oldReport && existsSync(oldReport)) {
  const listed = new Set([...conf.matchAll(/location = "([^"]+)"/g)].map((m) => m[1]));
  for (const line of (await readFile(oldReport, 'utf8')).split('\n').slice(1)) {
    const [url, , status] = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
    if (status !== '200' || !url?.startsWith('/') || !url.endsWith('/') || url === '/') continue;
    if (onSite(url) || listed.has(url) || listed.has(encodeURI(url)) || hidden.some(([h]) => h === url)) continue;
    gone.push([url, sectionAbove(url)]);
  }
}
hidden.push(...gone);
for (const [from, to] of hidden) {
  const line = `location = "${from}" { return 301 ${to}; }`;
  const re = new RegExp(`^location = "${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" .*$`, 'm');
  conf = re.test(conf) ? conf.replace(re, line) : conf.replace(/\n?$/, `\n${line}\n`);
}
// Keep the query string (utm_*, yclid from Yandex Direct, gclid...): nginx's
// `return` drops it unless it is added, and ads lose their attribution
conf = conf.replace(/return 301 ([^;$]+);/g, 'return 301 $1$is_args$args;');
await writeFile(output, conf);
console.log(`Hidden pages: ${hidden.length - gone.length} redirected, old addresses without a page: ${gone.length} redirected (${output})`);
