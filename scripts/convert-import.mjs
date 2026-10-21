#!/usr/bin/env node
// Turns the raw pages in import/pages/ (from `npm run import`) into the
// site's content files, and builds the redirect map.
//
//   npm run convert
//
// It is safe to run again after a fresh import: it only rewrites the
// "imported" folders and the deploy/ redirect files. Files you wrote or
// edited by hand are never touched (anything outside an `imported/` folder).
//
// What it does:
//   services   /uslugi/**                 -> src/content/services/imported/
//   doctors    /vrachi/<group>/<name>/    -> src/content/doctors/imported/
//   articles   /articles/, /news/, /sales/ items -> src/content/articles/imported/
//   prices     /ceny/<group>/             -> src/content/prices/imported/
//   listings   /vrachi/, /articles/, /ceny/, /news/, /sales/ and their groups
//   pages      everything else that is real content (patients, company, contacts...)
//   redirects  dead or dropped addresses   -> deploy/redirects.csv + deploy/redirects.nginx.conf

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const IMPORT = 'import';
const CONTENT = 'src/content';
const OLD_SITE = 'https://medunion.group';

// ---------------------------------------------------------------- reading

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function parseImported(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  let listKey = null;
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      fm[listKey].push(JSON.parse(item[1]));
      continue;
    }
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === '' || kv[2] === '[]') {
      fm[kv[1]] = [];
      listKey = kv[1];
    } else {
      fm[kv[1]] = JSON.parse(kv[2]);
      listKey = null;
    }
  }
  return { fm, body: m[2] };
}

function readCsv(text) {
  const rows = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q && c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = !q;
      else if (c === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

// ---------------------------------------------------------------- text helpers

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', apos: "'" };
const decode = (s = '') =>
  s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
      if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, ' ')
    .trim();

const plain = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>|]/g, '')
    .replace(/^\s*[-\d.]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

function cutAtWord(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return cut.slice(0, i > max * 0.6 ? i : max).replace(/[\s,;:—–-]+$/, '');
}

function firstSentences(text, max = 160) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length >= 60 ? out : cutAtWord(text, max);
}

// ---------------------------------------------------------------- SEO fields

const GENERIC_TITLES = [/^Лучшие врачи в Медюнион/i, /^Официальный сайт/i, /^Сотрудники$/i];
const GENERIC_DESCRIPTIONS = [
  /^Официальный сайт "?Медюнион"?\. Платные медицинские услуги/i,
  /^Все врачи "?Медюнион"? в Красноярске$/i,
  /^Медицинский центр Медюнион в Красноярске и Канске - Платные/i,
];
const isLor = (s) => /ЛОР|оториноларинг|отоларинг/i.test(s);

function makeTitle({ title, h1, url, city = 'Красноярске' }) {
  let t = decode(title)
    .replace(/\s*\|\s*Сеть медицинских центров\s*"?Медюнион"?.*$/i, '')
    .replace(/\s*\|\s*Адреса и цены клиники.*$/i, '')
    .replace(/\s*в сети медицинских центров\s*"?Медюнион"?/i, '')
    .trim();
  const lorMismatch = isLor(t) && !isLor(url + ' ' + h1);
  if (!t || t.length < 10 || GENERIC_TITLES.some((re) => re.test(t)) || lorMismatch) {
    t = h1 ? (/(Красноярск|Канск)/i.test(h1) ? h1 : `${h1} в ${city}`) : '';
  }
  if (!t) t = `Медюнион, ${city}`;
  const withBrand = `${t} | Медюнион`;
  if (withBrand.length <= 70 && !/Медюнион/i.test(t)) t = withBrand;
  return cutAtWord(t, 80);
}

function makeDescription({ description, url, h1, body }) {
  let d = decode(description);
  const bad = !d || d.length < 50 || GENERIC_DESCRIPTIONS.some((re) => re.test(d)) || (isLor(d) && !isLor(url + ' ' + h1));
  if (bad) {
    const text = plain(body);
    d = text.length >= 60 ? firstSentences(text, 160) : '';
  }
  if (!d || d.length < 50) {
    d = `${h1 || 'Медюнион'}: Медюнион в Красноярске и Канске. Запись онлайн и по телефону +7 (391) 220-03-03.`;
  }
  return cutAtWord(d, 200);
}

// ---------------------------------------------------------------- body cleanup

const BLOCK_LABELS = ['Сотрудники', 'Фотогалерея', 'Отзывы', 'Статьи', 'Акции', 'Услуги', 'Цены', 'Документы', 'Новости'];
const DROP_LINES = [
  /^Оформите заявку на сайте/i,
  /^Записаться( к врачу| онлайн| на при[её]м)?$/i,
  /^Загрузить еще$/i,
  /^На карте$/i,
  /^загрузка карты/i,
  /^\\?-\s*Выберите специализацию/i,
  /^\[\\?-\s*Выберите специализацию/i,
  /^-\s*\[[^\]]*\]\(#[a-z_-]*\)\s*$/i, // in-page tabs: - [Описание](#desc)
  /^\d+\/\d+$/, /^—$/, /^\d+$/,
  /^\.cls-\d|^\}$/,
  /^За все время$/i,
];

function splitBlocks(body) {
  // Returns { main, blocks: { label: text } } cutting at the first trailing block label.
  const lines = body.split('\n');
  let cut = lines.length;
  const blocks = {};
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (BLOCK_LABELS.includes(s) && i > 0) {
      if (cut === lines.length) cut = i;
      let j = i + 1;
      const chunk = [];
      while (j < lines.length && !BLOCK_LABELS.includes(lines[j].trim())) chunk.push(lines[j++]);
      blocks[s] = (blocks[s] || '') + chunk.join('\n');
    }
  }
  return { main: lines.slice(0, cut).join('\n'), blocks };
}

// Widgets the old site renders inside service pages, which Turndown
// flattens into confusing text:
//  * sub-page cards: a section label, a link with the page title, a teaser
//    ("Гинекология / Рекомендуем посещать..." repeated for every card);
//  * doctor cards: specialty, linked name, "Телефон", phone number;
//  * promo cards at the end: "01.01.2025 - бессрочно", "**", "5%".
// They come out of the body. Teasers are kept for the sub-page tiles and
// the doctors are attached to the page like the "Сотрудники" block.
function stripCards(md, url) {
  // Promo cards always close the page: cut from the first validity date.
  const promo = md.search(/^\s*\d{2}\.\d{2}\.\d{4}\s*[-–]\s*(бессрочно|\d{2}\.\d{2}\.\d{4})\s*$/m);
  if (promo >= 0) md = md.slice(0, promo);
  const paras = md.split(/\n\s*\n/);
  const trimmed = paras.map((x) => x.trim());
  const cardLink = /^\[([^\]]+)\]\((\/uslugi\/[^)\s]+)\)$/;
  const doctorLink = /^\[([^\]]+)\]\((\/vrachi\/[^)\s]+)\)\[?$/;
  const fragment = (t) => !t || /^(\[|\]|\]\(|\[\]\()/.test(t) && !/^\[[^\]]+\]\(/.test(t);
  const isLabel = (t) => t.length > 0 && t.length < 120 && !/[.!?]$/.test(t) && !t.includes('](') && !/^[#*\-\[]/.test(t);
  const drop = new Set();
  const teasers = new Map();
  const doctors = [];
  const related = []; // cards pointing to pages in other sections
  const prevReal = (i) => { for (let j = i - 1; j >= 0; j--) if (!fragment(trimmed[j])) return j; return -1; };
  trimmed.forEach((t, i) => {
    let m;
    if ((m = t.match(cardLink)) && m[2] !== url) {
      drop.add(i);
      if (!m[2].startsWith(url) && !related.includes(m[2])) related.push(m[2]);
      const j = prevReal(i);
      if (j >= 0 && isLabel(trimmed[j])) drop.add(j);
      const next = trimmed[i + 1] || '';
      if (next && !next.includes('](') && !/^[\[#*]/.test(next) && /[.!?»)]$|\s\S+\s\S+\s/.test(next)) {
        drop.add(i + 1);
        teasers.set(m[2], { text: decode(next.replace(/\s+/g, ' ')), fromParent: m[2].startsWith(url) });
      }
    } else if ((m = t.match(doctorLink))) {
      drop.add(i);
      doctors.push(m[2]);
      const j = prevReal(i);
      if (j >= 0 && isLabel(trimmed[j])) drop.add(j);
      for (let k = i + 1; k < Math.min(i + 5, trimmed.length); k++) {
        if (fragment(trimmed[k]) || trimmed[k] === 'Телефон' || /^\[[^\]]*\]\(tel:/.test(trimmed[k])) drop.add(k);
        else break;
      }
    } else if (/^\*{2}$/.test(t)) drop.add(i);
  });
  return { text: paras.filter((_, i) => !drop.has(i)).join('\n\n'), teasers, doctors, related };
}

// Words that say what a price is about: abbreviations (КТ, МРТ, ФГС) and
// 5-letter stems of longer words, minus generic ones.
const GENERIC_STEMS = new Set(['консу', 'прием', 'приём', 'врача', 'перви', 'повто', 'красн', 'медюн', 'детск', 'взрос', 'одной', 'сторо', 'обсле', 'компл', 'допол', 'иссле', 'услуг', 'лечен', 'центр', 'отдел', 'медиц']);
function topicKeys(s = '') {
  const out = new Set();
  for (const m of s.matchAll(/[А-ЯЁA-Z]{2,}(?![а-яё])/g)) out.add(m[0].toLowerCase());
  for (const w of s.toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/)) {
    if (w.length >= 4 && !GENERIC_STEMS.has(w.slice(0, 5))) out.add(w.slice(0, 5));
  }
  return out;
}

function cleanBody(md) {
  const internalLinkOnly = /^\s*(?:-\s*)?\[[^\]]*\]\((\/[^)]*)\)\s*(?:—|-)?\s*$/;
  const emptyLinkBits = /^\s*(\[|\]\([^)]*\)|\[\]\([^)]*\)(\[)?|\\?\[)\s*$/;
  const out = [];
  for (const raw of md.split('\n')) {
    const s = raw.trim();
    if (DROP_LINES.some((re) => re.test(s))) continue;
    if (emptyLinkBits.test(s)) continue;
    if (/^\[\]\([^)]*\)/.test(s)) continue;
    if (internalLinkOnly.test(s)) continue;
    out.push(raw.replace(/\s+$/, ''));
  }
  return out
    .join('\n')
    .replace(/\]\(\/upload\//g, `](${OLD_SITE}/upload/`) // files and images still live on the old server for now
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePriceBlock(text = '') {
  const items = [];
  const re = /\[([^\]]+)\]\([^)]*\)\s*\n\s*\n?\s*([\d  ]+)\s*₽/g;
  let m;
  while ((m = re.exec(text))) {
    const price = Number(m[2].replace(/[  ]/g, ''));
    if (price > 0) items.push({ name: decode(m[1]), price });
  }
  return items;
}

const links = (text = '', prefix) =>
  [...new Set([...text.matchAll(/\]\((\/[^)\s]+)\)/g)].map((m) => m[1]).filter((u) => u.startsWith(prefix)))];

// ---------------------------------------------------------------- doctors

const DOCTOR_LABELS = ['Должность', 'Телефон', 'E-mail', 'Квалификационная категория', 'Ведет прием', 'Стаж работы по специальности', 'Специализация', 'Образование'];
const STOP = ['Цены', 'Услуги', 'Отзывы'];

function clinicsFrom(text) {
  const keys = [];
  if (/Курчатова/i.test(text)) keys.push('kurchatova');
  if (/Инструментальн/i.test(text)) keys.push('instrumentalnaya');
  if (/Канск|Урицкого/i.test(text)) keys.push('kansk');
  return keys;
}

function parseDoctor(body) {
  const lines = body.split('\n').map((l) => l.trim());
  const fields = {};
  const education = [];
  const bio = [];
  let label = null;
  let ended = false;
  for (const s of lines) {
    if (!s) continue;
    if (STOP.includes(s)) { ended = true; label = null; continue; }
    if (ended) continue;
    if (DOCTOR_LABELS.includes(s)) { label = s; fields[s] ??= []; continue; }
    if (DROP_LINES.some((re) => re.test(s))) continue;
    if (label === 'Образование') {
      if (/^-\s+/.test(s)) { education.push(decode(s.replace(/^-\s+/, ''))); continue; }
      label = null; // the list ended, what follows is the bio
    }
    if (label) { fields[label].push(decode(s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))); continue; }
    bio.push(s);
  }
  const years = Number((fields['Стаж работы по специальности'] || []).join(' ').match(/\d+/)?.[0] || 0);
  return {
    specialty: (fields['Должность'] || [])[0] || '',
    qualification: (fields['Квалификационная категория'] || [])[0] || '',
    specialization: (fields['Специализация'] || []).join(', '),
    clinics: clinicsFrom((fields['Ведет прием'] || []).join(' ')),
    experienceYears: years > 0 && years < 70 ? years : undefined,
    education,
    bio: cleanBody(bio.join('\n\n')),
  };
}

// ---------------------------------------------------------------- writing

function yamlValue(v, indent = '') {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}
function frontmatter(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`${k}:`);
      for (const item of v) {
        if (item && typeof item === 'object') {
          const entries = Object.entries(item);
          lines.push(`  - ${entries[0][0]}: ${yamlValue(entries[0][1])}`);
          for (const [ik, iv] of entries.slice(1)) lines.push(`    ${ik}: ${yamlValue(iv)}`);
        } else lines.push(`  - ${yamlValue(item)}`);
      }
    } else lines.push(`${k}: ${yamlValue(v)}`);
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

// Pages are collected first and written at the end, after duplicates are removed.
const pending = [];
async function write(collection, url, data, body = '') {
  pending.push({ collection, url, data, body });
}
async function flush() {
  for (const { collection, url, data, body } of pending) {
    const rel = url.replace(/^\/|\/$/g, '') || 'index';
    const file = join(CONTENT, collection, 'imported', `${decodeURIComponent(rel)}.md`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, frontmatter({ url, ...data }) + (body ? `\n${body}\n` : ''));
  }
}

// Which copy to keep when the old site published the same page twice.
const KEEP_ORDER = ['/uslugi/diagnostika/', '/uslugi/vyezd-vracha-na-dom/', '/uslugi/centr/', '/uslugi/klinika-blokady-boli/', '/uslugi/'];
const keepRank = (url) => {
  const i = KEEP_ORDER.findIndex((p) => url.startsWith(p));
  return (i === -1 ? KEEP_ORDER.length : i) * 1000 + url.length;
};
const fingerprint = (p) => (p.data.h1 + '|' + plain(p.body)).toLowerCase().replace(/[^а-яёa-z0-9]/g, '');

function removeDuplicates(redirects, live) {
  // Same heading and same text = same page. Only services are compared; one copy stays.
  const groups = new Map();
  for (const p of pending) {
    if (p.collection !== 'services' || plain(p.body).length < 100) continue;
    const key = fingerprint(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const drop = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => keepRank(a.url) - keepRank(b.url));
    for (const dup of group.slice(1)) {
      drop.add(dup);
      redirects.set(dup.url, group[0].url);
      live.delete(dup.url);
    }
  }
  for (let i = pending.length - 1; i >= 0; i--) if (drop.has(pending[i])) pending.splice(i, 1);
  return drop.size;
}


function makeDescriptionsUnique() {
  const byDesc = new Map();
  for (const p of pending) {
    if (!byDesc.has(p.data.description)) byDesc.set(p.data.description, []);
    byDesc.get(p.data.description).push(p);
  }
  let fixed = 0;
  for (const group of byDesc.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.url.length - b.url.length);
    for (const p of group.slice(1)) {
      const name = p.data.h1 || p.data.name || '';
      const own = plain(p.body);
      let d = own.length > 60 ? `${name}. ${firstSentences(own, 150)}` : `${name} в Медюнион, Красноярск. Цены, врачи, запись онлайн и по телефону +7 (391) 220-03-03.`;
      d = cutAtWord(d, 200);
      if (d.length < 50) d = `${d} Медюнион, Красноярск.`;
      p.data.description = d;
      fixed++;
    }
  }
  return fixed;
}

function makeTitlesUnique() {
  // Section names repeat across page types ("Кардиология" as services, articles, prices).
  for (const p of pending) {
    if (p.collection === 'prices') p.data.title = cutAtWord(`${p.data.h1}: цены в Красноярске`, 80);
    if (p.collection === 'listings' && p.data.of === 'articles' && segs(p.url).length === 2)
      p.data.title = cutAtWord(`${p.data.h1}: статьи врачей Медюнион`, 80);
  }
  const byTitle = new Map();
  for (const p of pending) {
    if (!byTitle.has(p.data.title)) byTitle.set(p.data.title, []);
    byTitle.get(p.data.title).push(p);
  }
  let fixed = 0;
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.url.length - b.url.length);
    for (const p of group.slice(1)) {
      // Rebuild from the page's own heading; fall back to adding the section.
      let t = makeTitle({ title: '', h1: p.data.h1 || p.data.name || '', url: p.url });
      if (byTitle.has(t)) {
        const parent = pending.find((x) => x.url === `/${segs(p.url).slice(0, -1).join('/')}/`);
        t = cutAtWord(`${p.data.h1 || p.data.name}${parent ? ', ' + parent.data.h1.toLowerCase() : ''}`, 80);
      }
      p.data.title = t;
      byTitle.set(t, [p]);
      fixed++;
    }
  }
  return fixed;
}

// ---------------------------------------------------------------- main

async function manualUrls() {
  const urls = new Set();
  if (!existsSync(CONTENT)) return urls;
  for (const f of await walk(CONTENT)) {
    if (f.includes('/imported/')) continue;
    const m = (await readFile(f, 'utf8')).match(/^url:\s*"?([^"\n]+)"?/m);
    if (m) urls.add(m[1].trim());
  }
  return urls;
}

const segs = (u) => u.split('/').filter(Boolean);

function classify(url) {
  const s = segs(url);
  if (url === '/') return 'home';
  const dropped = ['/appointment/', '/articles/rss/', '/news/rss/', '/sitemap/', '/info/', '/patients/', '/ostavit-otzyv-o-nashej-rabote/'];
  if (dropped.includes(url) || s[0] === 'landings' || s[0] === 'gallery') return 'drop';
  if (s[0] === 'o-nas') return 'alias';
  if (s[0] === 'uslugi') return 'service';
  if (s[0] === 'vrachi') return s.length >= 3 ? 'doctor' : 'listing';
  if (s[0] === 'articles') return s.length >= 3 ? 'article' : 'listing';
  if (s[0] === 'news' || s[0] === 'sales') return s.length >= 2 ? 'article' : 'listing';
  if (s[0] === 'ceny') return s.length === 2 ? 'prices' : s.length === 1 ? 'listing' : 'priceItem';
  return 'page';
}

async function main() {
  for (const col of ['services', 'doctors', 'articles', 'prices', 'listings', 'pages']) {
    await rm(join(CONTENT, col, 'imported'), { recursive: true, force: true });
  }
  const manual = await manualUrls();
  const report = readCsv(await readFile(join(IMPORT, 'report.csv'), 'utf8'));
  const pages = new Map();
  for (const f of await walk(join(IMPORT, 'pages'))) {
    const parsed = parseImported(await readFile(f, 'utf8'));
    if (parsed?.fm?.url) pages.set(parsed.fm.url, parsed);
  }

  const live = new Set(); // URLs the new site will serve
  const redirects = new Map(); // old -> new
  const doctorSlugs = new Map(); // slug -> url (first one wins)
  const serviceDoctors = new Map(); // service url -> Set(doctor slug)
  const counts = {};
  const bump = (k) => (counts[k] = (counts[k] || 0) + 1);

  // Doctors first, so services can link to them.
  for (const [url, { fm, body }] of pages) {
    if (classify(url) !== 'doctor' || manual.has(url)) continue;
    const slug = segs(url).at(-1);
    if (doctorSlugs.has(slug)) { redirects.set(url, doctorSlugs.get(slug)); continue; }
    const d = parseDoctor(body);
    if (!fm.h1 || /Сотрудник/i.test(fm.h1)) continue;
    doctorSlugs.set(slug, url);
    const { blocks } = splitBlocks(body);
    for (const s of links(blocks['Услуги'], '/uslugi/')) {
      if (!serviceDoctors.has(s)) serviceDoctors.set(s, new Set());
      serviceDoctors.get(s).add(slug);
    }
    const city = d.clinics.length === 1 && d.clinics[0] === 'kansk' ? 'Канске' : 'Красноярске';
    const name = decode(fm.h1);
    const title = cutAtWord(`${name}, ${(d.specialty || 'врач').toLowerCase()} в ${city}`, 80);
    const description = makeDescription({
      description: fm.description, url, h1: name,
      body: `${name}, ${(d.specialty || 'врач').toLowerCase()}${d.qualification ? ', ' + d.qualification.toLowerCase() : ''}${d.experienceYears ? ', стаж ' + d.experienceYears + ' лет' : ''}. ${d.bio}`,
    });
    await write('doctors', url, {
      title, description, name,
      specialty: d.specialty || 'Врач',
      qualification: d.qualification, specialization: d.specialization,
      experienceYears: d.experienceYears,
      clinics: d.clinics,
      education: d.education,
      prices: parsePriceBlock(blocks['Цены']),
    }, d.bio);
    live.add(url);
    bump('doctors');
  }

  // Teasers from section cards, keyed by the sub-page they describe.
  const teasers = new Map();
  for (const [url, { body }] of pages) {
    if (classify(url) !== 'service') continue;
    for (const [child, t] of stripCards(splitBlocks(body).main, url).teasers) {
      // Prefer the teaser from the page's own parent section
      if (!teasers.has(child) || (t.fromParent && !teasers.get(child).fromParent)) teasers.set(child, t);
    }
  }
  const serviceUrls = [...pages.keys()].filter((u) => classify(u) === 'service');
  const servicePrices = (url, h1, block) => {
    let items = parsePriceBlock(block);
    // The old site shows 1.5 Tesla prices on its open-type MRI pages; keep them off those pages.
    if (url.startsWith('/uslugi/diagnostika/mrt/')) items = items.filter((p) => !/1[,.]\s?5\s?(Т|Тл|Тесла)/i.test(p.name));
    // Section pages on the old site often show a stock price list (gastroscopy,
    // proctology...) that has nothing to do with the section. Keep only prices
    // that mention the section or one of its sub-pages.
    const children = serviceUrls.filter((u) => u !== url && u.startsWith(url));
    if (children.length) {
      const ctx = new Set([...topicKeys(h1), ...children.flatMap((u) => [...topicKeys(decode(pages.get(u).fm.h1 || ''))])]);
      const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
      const before = items.length;
      items = items.filter((p) => [...ctx].some((k) => norm(p.name).includes(k)));
      if (items.length < before) console.log(`  prices on ${url}: kept ${items.length} of ${before}`);
    }
    return items;
  };

  for (const [url, { fm, body }] of pages) {
    const kind = classify(url);
    if (manual.has(url)) { live.add(url); continue; }
    const h1 = decode(fm.h1);
    if (kind === 'service') {
      const { main, blocks } = splitBlocks(body);
      const cards = stripCards(main, url);
      const text = cleanBody(cards.text);
      for (const doc of [...links(blocks['Сотрудники'], '/vrachi/'), ...cards.doctors]) {
        const slug = segs(doc).at(-1);
        if (!serviceDoctors.has(url)) serviceDoctors.set(url, new Set());
        serviceDoctors.get(url).add(slug);
      }
      const doctors = [...(serviceDoctors.get(url) || [])].filter((s) => doctorSlugs.has(s)).map((s) => `imported/${decodeURIComponent(segs(doctorSlugs.get(s)).join('/'))}`);
      await write('services', url, {
        title: makeTitle({ title: fm.title, h1, url }),
        description: makeDescription({ description: fm.description, url, h1, body: text }),
        h1: h1 || decode(fm.title),
        doctors,
        teaser: teasers.get(url)?.text,
        related: cards.related,
        prices: servicePrices(url, h1, blocks['Цены']),
      }, text);
      live.add(url);
      bump('services');
    } else if (kind === 'article') {
      const s = segs(url);
      const type = s[0] === 'news' ? 'news' : s[0] === 'sales' ? 'sale' : 'article';
      const { main } = splitBlocks(body);
      let text = cleanBody(main);
      // Articles start with their category name and a teaser line, drop the category line.
      text = text.replace(/^[А-ЯЁ][а-яё ]+\n\n/, '');
      text = text.split(/\n\n/).filter((p) => p.trim() !== h1).join('\n\n');
      await write('articles', url, {
        title: makeTitle({ title: fm.title, h1, url }),
        description: makeDescription({ description: fm.description, url, h1, body: text }),
        h1: h1 || decode(fm.title),
        kind: type,
        category: type === 'article' ? s[1] : undefined,
      }, text);
      live.add(url);
      bump('articles');
    } else if (kind === 'prices') {
      const items = parsePriceBlock(body);
      await write('prices', url, {
        title: makeTitle({ title: fm.title, h1: h1 ? `Цены: ${h1}` : '', url }),
        description: makeDescription({
          description: fm.description, url, h1,
          body: `Цены на ${h1.toLowerCase()} в Медюнион, Красноярск. ${items.slice(0, 3).map((i) => `${i.name}: ${i.price} ₽`).join('. ')}.`,
        }),
        h1,
        items,
      });
      live.add(url);
      bump('prices');
    } else if (kind === 'listing') {
      const s = segs(url);
      const of = s[0] === 'vrachi' ? 'doctors' : s[0] === 'ceny' ? 'prices' : s[0] === 'news' ? 'news' : s[0] === 'sales' ? 'sales' : 'articles';
      const intro = cleanBody(splitBlocks(body).main)
        .split('\n\n')
        .filter((p) => !/^\[|^-|\]\(/.test(p.trim()) && plain(p).length > 40)
        .slice(0, 2)
        .join('\n\n');
      await write('listings', url, {
        title: makeTitle({ title: fm.title, h1, url }),
        description: makeDescription({ description: fm.description, url, h1, body: intro || h1 }),
        h1: h1 || decode(fm.title),
        of,
      }, intro);
      live.add(url);
      bump('listings');
    } else if (kind === 'page') {
      const text = cleanBody(splitBlocks(body).main);
      const s = segs(url);
      const clinic = s[0] === 'contacts' && s[1] ? clinicsFrom(text + ' ' + url.replace('instrumentalnoy', 'Инструментальн').replace('kanske', 'Канск').replace('kurchatova', 'Курчатова'))[0] : undefined;
      await write('pages', url, {
        title: makeTitle({ title: fm.title, h1, url }),
        description: makeDescription({ description: fm.description, url, h1, body: text }),
        h1: h1 || decode(fm.title),
        layout: s[0] === 'contacts' ? (clinic ? 'clinic' : 'contacts') : undefined,
        clinic,
      }, s[0] === 'contacts' ? '' : text);
      live.add(url);
      bump('pages');
    }
  }
  live.add('/');
  const dupes = removeDuplicates(redirects, live);

  // ---------- redirects
  const nearestLive = (url) => {
    const s = segs(url);
    for (let i = s.length - 1; i > 0; i--) {
      const cand = `/${s.slice(0, i).join('/')}/`;
      if (live.has(cand)) return cand;
    }
    return '/';
  };
  const special = [
    [/^\/kontakty\/klinika-na-kurchatova\/$/, '/contacts/klinika-na-kurchatova/'],
    [/^\/kontakty\/klinika-na-instrumentalnoy\/$/, '/contacts/klinika-na-instrumentalnoy/'],
    [/^\/kontakty\/klinika-v-kanske\/$/, '/contacts/klinika-v-kanske/'],
    [/^\/kontakty\//, '/contacts/'],
    [/^\/company\/licenses\//, '/company/licenzii-i-egryul/'],
    [/^\/novosti\//, '/news/'],
    [/^\/company\/vacancy\//, '/'],
    [/^\/akcii\//, '/sales/'],
    [/^\/stati\//, '/articles/'],
    [/^\/mrt-arterij-golovnogo-mozga\/$/, '/uslugi/diagnostika/mrt/mrt-golovnogo-mozga/'],
    [/^\/ostavit-otzyv-o-nashej-rabote\/$/, '/contacts/'],
  ];
  const target = (url) => {
    for (const [re, to] of special) if (re.test(url) && live.has(to)) return to;
    if (segs(url)[0] === 'o-nas') {
      const alt = url.replace(/^\/o-nas\//, '/company/');
      if (live.has(alt)) return alt;
      return live.has('/company/') ? '/company/' : '/';
    }
    return nearestLive(url);
  };

  // Every imported page that did not become a page on the new site gets a redirect,
  // e.g. dropped sections, price item stubs, and doctors who are no longer listed.
  for (const url of pages.keys()) {
    if (!live.has(url) && !redirects.has(url)) redirects.set(url, target(url));
  }
  for (const [url, , status, redirectsTo] of report) {
    if (live.has(url) || redirects.has(url)) continue;
    if (status !== '200' || redirectsTo) redirects.set(url, target(url));
  }
  for (const [from, to] of redirects) {
    let t = to, hops = 0;
    while (redirects.has(t) && hops++ < 5) t = redirects.get(t);
    if (from === t) redirects.delete(from);
    else redirects.set(from, t);
  }

  const retitled = makeTitlesUnique();
  const redescribed = makeDescriptionsUnique();
  await flush();

  await mkdir('deploy', { recursive: true });
  const sorted = [...redirects].sort((a, b) => a[0].localeCompare(b[0]));
  await writeFile('deploy/redirects.csv', 'from,to\n' + sorted.map(([f, t]) => `${f},${t}`).join('\n') + '\n');
  await writeFile(
    'deploy/redirects.nginx.conf',
    '# Permanent (301) redirects from old Bitrix addresses. Include inside the server { } block.\n# nginx matches the decoded path, so non-Latin characters are written as-is.\n' +
      sorted.map(([f, t]) => `location = "${decodeURI(f)}" { return 301 ${encodeURI(decodeURI(t))}; }`).join('\n') + '\n',
  );

  console.log('Written:', counts);
  console.log(`Duplicate pages merged: ${dupes}. Titles made unique: ${retitled}. Descriptions made unique: ${redescribed}.`);
  console.log(`Redirects: ${redirects.size} (deploy/redirects.csv, deploy/redirects.nginx.conf)`);
  console.log(`Kept as hand-written (not overwritten): ${[...manual].join(', ') || 'none'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
