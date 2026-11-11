// The one price list. Every price on the site comes from src/data/prices/*.yml,
// one file per /ceny/ section; the admin page (/admin/) edits those files.
// Service and doctor pages name their prices in their own files; those names
// are only links into this list (by id, see slug.mjs): the price shown, and
// the current name, always come from here.
import { parse } from 'yaml';
import { slug } from './slug.mjs';

export interface PriceItem { id: string; name: string; price: number }
export interface PriceSection { file: string; title: string; page?: string; order: number; items: PriceItem[]; also: string[] }

const files = import.meta.glob('../data/prices/*.yml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const priceSections: PriceSection[] = Object.entries(files)
  .map(([path, raw]) => {
    const d = parse(raw) ?? {};
    const file = path.split('/').pop()!;
    const items: PriceItem[] = (d.items ?? []).map((it: { id?: string; name?: string; price?: unknown }, i: number) => {
      const name = String(it.name ?? '').trim();
      const price = Number(it.price);
      if (!name) throw new Error(`Цены: в файле ${file}, строка ${i + 1}: нет названия услуги`);
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Цены: «${name}» (${file}): цена должна быть числом больше нуля, сейчас «${it.price}»`);
      return { id: it.id || slug(name), name, price: Math.round(price) };
    });
    return { file, title: d.title, page: d.page, order: Number(d.order) || 99, items, also: d.also ?? [] };
  })
  .sort((a, b) => a.order - b.order);

const byId = new Map<string, PriceItem>();
for (const s of priceSections) {
  for (const it of s.items) {
    if (byId.has(it.id)) throw new Error(`Цены: «${it.name}» встречается дважды (${s.file}). Оставьте одну строку.`);
    byId.set(it.id, it);
  }
}

/** Everything in one /ceny/ section, including items that live in another section. */
export const sectionItems = (s: PriceSection): PriceItem[] => [...s.items, ...s.also.map((id) => byId.get(id)).filter((x) => x !== undefined)];

/** The section shown on a /ceny/ page. */
export const sectionFor = (page: string) => priceSections.find((s) => s.page === page);

/** Rows from a service or doctor page, with the current names and prices. Rows
 *  whose price was removed from the list are dropped. */
export const currentPrices = (rows: readonly { name: string; price?: number }[]): PriceItem[] =>
  [...new Map(rows.map((r) => byId.get(slug(r.name))).filter((x) => x !== undefined).map((x) => [x.id, x])).values()];
