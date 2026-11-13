// After the Kansk build (CITY=kansk):
//   - removes the price editor, which lives on medunion.group;
//   - every link to a page this site does not have now points to the same
//     address on the main site (MAIN_ORIGIN), e.g. the Krasnoyarsk clinic
//     pages and doctors, КТ;
//   - drops those addresses and the shared pages from the sitemap.
//
//   - writes dist-kansk.redirects.conf: deploy/redirects-kansk.nginx.conf with
//     every target this site does not have pointed at the main site.
//
//   CITY=kansk astro build && node scripts/rehost.mjs dist-kansk
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dir = process.argv[2] || 'dist-kansk';
const MAIN = (process.env.MAIN_ORIGIN || 'https://medunion.group').replace(/\/$/, '');
const shared = JSON.parse(await readFile(new URL('../src/data/shared-sections.json', import.meta.url), 'utf8'));

await rm(join(dir, 'admin'), { recursive: true, force: true }); // prices are edited on the main site's /admin/

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const files = await walk(dir);
// Every address this site has
const pages = new Set(files.filter((f) => f.endsWith('index.html')).map((f) => '/' + relative(dir, f).split(sep).slice(0, -1).map(encodeURIComponent).join('/') + (f === join(dir, 'index.html') ? '' : '/')));
pages.add('/');
const has = (p) => {
  const path = p.split(/[?#]/)[0];
  if (/\.[a-z0-9]+$/i.test(path)) return existsSync(join(dir, decodeURIComponent(path))); // files: logo, photos, search.json
  return pages.has(path) || pages.has(encodeURI(decodeURI(path)));
};
const elsewhere = (p) => !has(p);

let changed = 0, links = 0;
for (const f of files) {
  if (!/\.(html|json|xml)$/.test(f)) continue;
  const before = await readFile(f, 'utf8');
  let s = before;
  if (f.endsWith('.html')) {
    s = s.replace(/\bhref="(\/(?!\/)[^"]*)"/g, (m, p) => (p === '/' || !elsewhere(p) ? m : (links++, `href="${MAIN}${p}"`)));
    // A service this site does not have is done in Krasnoyarsk: say so on the link.
    s = s.replace(/(<a\b[^>]*\bhref="https?:\/\/[^"/]+\/(?:uslugi|ceny)\/[^"]*"[^>]*>)([\s\S]*?)<\/a>/g, (m, open, text) =>
      open.startsWith(`<a`) && open.includes(MAIN) && !text.includes('city-note') ? `${open}${text}<span class="city-note"> (в Красноярске)</span></a>` : m);
  } else if (f.endsWith('search.json')) {
    s = s.replace(/"u":"(\/[^"]*)"/g, (m, p) => (elsewhere(p) ? `"u":"${MAIN}${p}"` : m));
  } else if (/sitemap-\d+\.xml$/.test(f)) {
    s = s.replace(/<url><loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>.*?<\/url>/g, (m, p) => (elsewhere(p) || shared.includes(p.split('/')[1]) ? '' : m));
  }
  if (s !== before) { await writeFile(f, s); changed++; }
}
console.log(`Kansk site: ${pages.size} pages, ${links} links pointed to ${MAIN}, ${changed} files updated`);

// Redirect list for the server: targets missing here go to the main site.
const red = await readFile(new URL('../deploy/redirects-kansk.nginx.conf', import.meta.url), 'utf8').catch(() => '');
let moved = 0;
// Pages that failed on the old Kansk site (it served errors for services not
// assigned to Kansk) go to the same page on the main site when it has one,
// instead of the nearest Kansk section the converter guessed.
const failed = new Set(
  (await readFile(new URL('../import-kansk/report.csv', import.meta.url), 'utf8').catch(() => ''))
    .split('\n').slice(1).map((l) => l.split('","')).filter((c) => c[2] && c[2] !== '200').map((c) => c[0].replace(/^"/, '')),
);
// 500 = a service the old site did not assign to Kansk (404 = gone everywhere).
const notInKansk = new Set(
  (await readFile(new URL('../import-kansk/report.csv', import.meta.url), 'utf8').catch(() => ''))
    .split('\n').slice(1).map((l) => l.split('","')).filter((c) => c[2] === '500').map((c) => c[0].replace(/^"/, '')),
);
const mainDist = new URL('../dist/', import.meta.url);
const onMain = (p) => existsSync(new URL('.' + decodeURI(p) + 'index.html', mainDist));
// ...or, for a service done only in Krasnoyarsk (КТ, МРТ 1,5 Т, ФГС, массаж;
// see KRASNOYARSK_ONLY in src/content.config.ts), where the main site sends
// that address.
const krasnoyarskOnly = /\/(mskt|kt-rebenku|mrt-1-5-tesla|fgds-fgs[^/]*|massazh)\//;
const mainMoved = new Map(
  [...(await readFile(new URL('../deploy/redirects.nginx.conf', import.meta.url), 'utf8').catch(() => '')).matchAll(/location = "([^"]+)" \{ return 301 (\/[^;]*); \}/g)].map((m) => [m[1], m[2]]),
);
let toSame = 0;
const out = red.replace(/location = "([^"]+)" \{ return 301 (\/[^;]*); \}/g, (m, from, to) => {
  if (failed.has(from) && onMain(from)) { toSame++; return `location = "${from}" { return 301 ${MAIN}${from}; }`; }
  if (notInKansk.has(from) && krasnoyarskOnly.test(mainMoved.get(from) ?? '') && onMain(mainMoved.get(from))) { moved++; return `location = "${from}" { return 301 ${MAIN}${mainMoved.get(from)}; }`; }
  if (elsewhere(to)) { moved++; return `location = "${from}" { return 301 ${MAIN}${to}; }`; }
  return m;
});
await writeFile(`${dir}.redirects.conf`, out);
console.log(`Kansk redirects: ${toSame} to the same page on ${MAIN}, ${moved} to another page there`);
