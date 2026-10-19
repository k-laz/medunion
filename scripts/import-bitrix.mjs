#!/usr/bin/env node
// Copies the content of the current Bitrix site into Markdown files.
//
//   npm run import                 # whole site
//   npm run import -- --limit 20   # quick test on the first 20 pages
//   npm run import -- --images     # also download images used in page content
//
// It only READS the live site, slowly (a few pages at a time), and changes
// nothing there. Output goes to ./import/, not into the site itself:
//
//   import/pages/<same path as the old URL>.md   one file per working page
//   import/report.csv                            every URL found, its status, title
//   import/broken.csv                            pages that 404 or redirect (need redirects)
//   import/images/...                            only with --images
//
// Raw pages land in import/ first because each kind of page (service, doctor,
// price list, article) becomes a different kind of file in src/content, and
// that sorting is easier to review than to do blindly.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// ---------- settings ----------
const BASE = process.env.IMPORT_BASE || 'https://medunion.group';
const OUT = process.env.IMPORT_OUT || 'import';
const CONCURRENCY = 3; // pages fetched at the same time; keep it low to be gentle on the server
const DELAY_MS = 300; // pause between requests per worker
const TIMEOUT_MS = 20000;

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const WITH_IMAGES = args.includes('--images');

// Parts of the site that are not content.
const SKIP = [
  /^\/bitrix\//, /^\/upload\//, /^\/local\//, /^\/search/, /^\/auth/, /^\/personal/,
  /\.(jpe?g|png|gif|webp|svg|pdf|docx?|xlsx?|zip|rar|mp4|ico|css|js|xml|txt)$/i,
];
// Containers in the Aspro template that hold the page's own content, best first.
const CONTENT_SELECTORS = ['.detail', '.right_block', '.main'];
// Things inside the content area that are page furniture, not text.
const STRIP_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'iframe', 'form', 'button', 'input', 'select', 'textarea',
  '.breadcrumbs', '.bx-breadcrumb', '.share', '.ya-share2', '.order-block', '.form', '.popup',
  '.btn', '.contacts-detail__map', '.map', '.gallery-block',
];

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s = '') => s.replace(/\s+/g, ' ').trim();
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function normalize(href) {
  try {
    const u = new URL(href, BASE);
    if (u.origin !== new URL(BASE).origin) return null;
    // Keep the path exactly as the server encodes it (e.g. "1%2C5tesla"),
    // so it is requested and saved as the same address.
    let path = u.pathname;
    if (SKIP.some((re) => re.test(path))) return null;
    if (!path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path)) path += '/';
    if (path.endsWith('/index.php')) path = path.slice(0, -9);
    return path; // query strings and #anchors are dropped on purpose
  } catch {
    return null;
  }
}

async function get(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(new URL(path, BASE), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'medunion-site-migration/1.0 (content export by the site owner)' },
    });
    const body = await res.text();
    const finalPath = normalize(res.url) ?? new URL(res.url).pathname;
    return { status: res.status, finalPath, redirected: res.redirected && finalPath !== path, body };
  } catch (err) {
    return { status: 0, finalPath: path, redirected: false, body: '', error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

async function sitemapUrls() {
  const found = new Set();
  const queue = ['/sitemap.xml'];
  const seen = new Set();
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const { status, body } = await get(p);
    if (status !== 200) continue;
    for (const [, loc] of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const u = new URL(loc, BASE);
      if (/\.xml$/i.test(u.pathname)) queue.push(u.pathname);
      else {
        const n = normalize(loc);
        if (n) found.add(n);
      }
    }
  }
  return found;
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*' });
turndown.use(gfm);
turndown.remove(['script', 'style', 'noscript']);

function extract(path, html) {
  const root = parse(html, { comment: false });
  const title = clean(root.querySelector('title')?.text);
  const description = clean(root.querySelector('meta[name="description"]')?.getAttribute('content'));
  const h1 = clean(root.querySelector('h1')?.text);
  // The old site sometimes spells "Сотрудник" with a Latin C, hence [СC].
  const notFound = /(Страница|[СC]отрудник|Элемент|Раздел) не найден/i.test(title + ' ' + root.text.slice(0, 20000));

  // Links to follow, so pages missing from the sitemap are found too.
  const links = root
    .querySelectorAll('a[href]')
    .map((a) => normalize(a.getAttribute('href')))
    .filter(Boolean);

  let content = null;
  for (const sel of CONTENT_SELECTORS) {
    content = root.querySelector(sel);
    if (content && clean(content.text).length > 50) break;
  }
  content ??= root.querySelector('body') ?? root;
  for (const sel of STRIP_SELECTORS) content.querySelectorAll(sel).forEach((n) => n.remove());
  content.querySelectorAll('h1').forEach((n) => n.remove()); // the h1 goes to the frontmatter

  // Images are lazy-loaded: the real address sits in data-src and src is a blank placeholder.
  const images = [];
  for (const img of content.querySelectorAll('img')) {
    const real = img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (!real || real.startsWith('data:')) {
      img.remove();
      continue;
    }
    const path = new URL(real, BASE).pathname;
    img.setAttribute('src', path);
    img.removeAttribute('data-src');
    images.push(path);
  }

  let markdown = turndown.turndown(content.innerHTML);
  markdown = markdown
    .replace(/^(\s*)-\s{2,}/gm, '$1- ')
    .replace(/^(\s*\d+\.)\s{2,}/gm, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*(Записаться( онлайн| на при[её]м)?|Заказать звонок|Подробнее|Назад к списку)\s*$/gim, '')
    .trim();

  return { title, description, h1, notFound, links, images: [...new Set(images)], markdown };
}

function frontmatter(obj) {
  const lines = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) return v.length ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}` : `${k}: []`;
    return `${k}: ${JSON.stringify(v ?? '')}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

function fileFor(path) {
  const trimmed = path.replace(/^\/|\/$/g, '');
  return join(OUT, 'pages', trimmed === '' ? 'index.md' : `${trimmed}.md`);
}

// ---------- main ----------
async function main() {
  console.log(`Reading ${BASE} ...`);
  const fromSitemap = await sitemapUrls();
  console.log(`Sitemap lists ${fromSitemap.size} unique addresses. Following menu links too.`);

  const queued = new Set(['/', ...fromSitemap]);
  const queue = [...queued];
  const results = [];
  const imageSet = new Set();
  let done = 0;

  let active = 0;
  async function worker() {
    while (done < LIMIT) {
      if (!queue.length) {
        if (active === 0) break; // nothing left and nobody is still adding links
        await sleep(200);
        continue;
      }
      const path = queue.shift();
      done++;
      active++;
      try {
      const res = await get(path);
      const row = {
        url: path,
        inSitemap: fromSitemap.has(path),
        status: res.status,
        finalUrl: res.redirected ? res.finalPath : '',
        title: '',
        h1: '',
        words: 0,
        note: res.error || '',
      };

      if (res.status === 200 && !res.redirected) {
        const page = extract(path, res.body);
        row.title = page.title;
        row.h1 = page.h1;
        if (page.notFound) {
          row.status = 404; // Bitrix sometimes answers 200 with a "not found" page
          row.note = 'soft 404';
        } else {
          row.words = page.markdown.split(/\s+/).filter(Boolean).length;
          const section = path.split('/').filter(Boolean)[0] || 'home';
          const file = fileFor(path);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(
            file,
            frontmatter({ url: path, section, title: page.title, description: page.description, h1: page.h1, images: page.images }) +
              '\n' + page.markdown + '\n',
          );
          page.images.forEach((src) => imageSet.add(src));
        }
        for (const link of page.links) {
          if (!queued.has(link)) {
            queued.add(link);
            queue.push(link);
          }
        }
      }

      results.push(row);
      const mark = row.status === 200 && !row.finalUrl ? 'ok ' : row.finalUrl ? '-> ' : String(row.status).padEnd(3);
      console.log(`${String(done).padStart(4)}  ${mark}  ${path}${row.finalUrl ? '  ->  ' + row.finalUrl : ''}`);
      } catch (err) {
        // One odd page should not stop the whole import.
        results.push({ url: path, inSitemap: fromSitemap.has(path), status: 'error', finalUrl: '', title: '', h1: '', words: 0, note: String(err.message || err) });
        console.log(`   !  ${path}  ${err.message || err}`);
      } finally {
        active--;
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (WITH_IMAGES && imageSet.size) {
    console.log(`Downloading ${imageSet.size} images ...`);
    for (const src of imageSet) {
      try {
        const res = await fetch(new URL(src, BASE));
        if (!res.ok) continue;
        const file = join(OUT, 'images', src.replace(/^\//, ''));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        await sleep(100);
      } catch {}
    }
  }

  results.sort((a, b) => a.url.localeCompare(b.url));
  await mkdir(OUT, { recursive: true });
  const header = ['url', 'in_sitemap', 'status', 'redirects_to', 'title', 'h1', 'words', 'note'];
  const toCsv = (rows) =>
    [header.join(','), ...rows.map((r) => [r.url, r.inSitemap, r.status, r.finalUrl, r.title, r.h1, r.words, r.note].map(csv).join(','))].join('\n') + '\n';
  await writeFile(join(OUT, 'report.csv'), toCsv(results));
  const broken = results.filter((r) => r.status !== 200 || r.finalUrl);
  await writeFile(join(OUT, 'broken.csv'), toCsv(broken));

  const ok = results.length - broken.length;
  console.log(`\nDone. ${results.length} addresses checked: ${ok} pages saved, ${broken.length} broken or redirected.`);
  console.log(`Files are in ${OUT}/. Next: git add ${OUT} && git commit -m "Import from Bitrix" && git push`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
