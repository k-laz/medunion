#!/usr/bin/env node
// One-off: gathers every price on the site (the /ceny/ lists, service pages,
// doctor pages) into src/data/prices/, one file per /ceny/ list. After this the
// files in src/data/prices/ are the only place a price is set; the admin page
// (/admin/) edits them. Run again only to rebuild them from imported content.
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { slug } from '../src/lib/slug.mjs';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const fm = (f) => { const m = fs.readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/); return m ? parse(m[1]) : {}; };

// Same order as the /ceny/ page: an item found in two lists belongs to the first.
const ORDER = [
  '/ceny/mrt-magnitno-rezonansnaya-tomografiya/', '/ceny/mrt-magnitno-rezonansnaya-tomografiya-1,5tesla/', '/ceny/mskt/', '/ceny/rentgen/',
  '/ceny/ultrazvukovye-metody-diagnostiki/', '/ceny/fgs/', '/ceny/funktsionalnye-metody-diagnostiki-i-issledovaniya/',
  '/ceny/konsultatsii-spetsialistov/', '/ceny/ginekologiya/', '/ceny/%D1%81ardiologiya/', '/ceny/nevrologiya/', '/ceny/otolaringologiya/',
  '/ceny/proktologiya/', '/ceny/travmatologiya-ortopediya/', '/ceny/urologiya/', '/ceny/khirurgiya/',
  '/ceny/klinika-blokady-boli/', '/ceny/massazh/', '/ceny/uslugi-protsedurnogo-kabineta/', '/ceny/dopolnitelnye-uslugi/',
];
const pages = walk('src/content/prices').filter((f) => f.endsWith('.md')).map(fm).filter((d) => d.url !== '/ceny/' && d.items?.length);
pages.sort((a, b) => (ORDER.indexOf(a.url) + 1 || 99) - (ORDER.indexOf(b.url) + 1 || 99));

const lists = pages.map((d, i) => ({ order: i + 1, title: d.h1, page: d.url, items: [], also: [] }));
const owner = new Map(); // id -> list
for (const [i, d] of pages.entries()) {
  for (const it of d.items) {
    const id = slug(it.name);
    if (owner.has(id)) { if (owner.get(id) !== lists[i] && !lists[i].also.includes(id)) lists[i].also.push(id); continue; }
    owner.set(id, lists[i]);
    lists[i].items.push({ id, name: it.name, price: it.price });
  }
}

// Prices that were only on service or doctor pages go into the list they belong to.
const byPage = (u) => lists.find((l) => l.page === u);
const home = (name) =>
  /^КТ/.test(name) ? '/ceny/mskt/'
  : /^МРТ \(1,5/.test(name) ? '/ceny/mrt-magnitno-rezonansnaya-tomografiya-1,5tesla/'
  : /^Рентгенограф/.test(name) ? '/ceny/rentgen/'
  : /УЗОЛ|серной пробки|инородного тела|тампонад/i.test(name) ? '/ceny/otolaringologiya/'
  : /^Детский гинеколог/.test(name) ? '/ceny/ginekologiya/'
  : '/ceny/konsultatsii-spetsialistov/';
for (const c of ['services', 'doctors']) {
  for (const f of walk(`src/content/${c}`).filter((f) => f.endsWith('.md'))) {
    for (const it of fm(f).prices ?? []) {
      const id = slug(it.name);
      if (owner.has(id)) continue;
      const l = byPage(home(it.name));
      owner.set(id, l);
      l.items.push({ id, name: it.name, price: it.price });
    }
  }
}

fs.rmSync('src/data/prices', { recursive: true, force: true });
fs.mkdirSync('src/data/prices', { recursive: true });
for (const l of lists) {
  const file = l.page.split('/').filter(Boolean).pop().replace(/%D1%81/i, 'c').replace(/,/g, '-') + '.yml';
  const data = { title: l.title, page: l.page, order: l.order, items: l.items, ...(l.also.length ? { also: l.also } : {}) };
  fs.writeFileSync(path.join('src/data/prices', file), stringify(data, { lineWidth: 0 }));
}
console.log(lists.length, 'lists,', owner.size, 'prices');
