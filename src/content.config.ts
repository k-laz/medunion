import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { dropCity } from './data/city';
import { slug } from './lib/slug.mjs';

// Every page is a Markdown file. The fields at the top of the file
// (between the --- lines) are checked here, so a page with a missing
// title or description fails the build instead of going live broken.
//
// Files in an `imported/` folder are written by `npm run convert` from the
// old Bitrix site. To take over a page by hand, move its file out of
// `imported/` (keep the same `url`) and the converter will leave it alone.

// Entry id = file path without ".md", so references are easy to read,
// e.g. "imported/vrachi/vrachi-ginekologi/kolova-lyudmila-mikhaylovna".
// The Kansk build reads its own copy of the city pages (src/content-kansk/).
const KANSK = process.env.CITY === 'kansk';
const ROOT = KANSK ? './src/content-kansk' : './src/content';
// Services done only in Krasnoyarsk (the clinic confirmed 2026-11-12): left out
// of the Kansk build, so its old addresses go to the same page on medunion.group
// (the nginx fallback in deploy/nginx/kansk.medunion.group.conf) and links to
// them point there (scripts/rehost.mjs).
const KRASNOYARSK_ONLY = KANSK ? [
  '**/uslugi/diagnostika/mskt.md', '**/uslugi/diagnostika/mskt/**', // КТ
  '**/uslugi/diagnostika/mrt-1-5-tesla.md', // МРТ 1,5 Т (Канск: открытый МРТ)
  '**/ceny/mskt.md', '**/ceny/mrt-magnitno-rezonansnaya-tomografiya-1,5tesla.md',
  '**/ceny/fgs.md', '**/ceny/massazh.md', // ФГС, массаж
  '**/sales/*-kt-*.md', // акции на КТ
] : [];
const files = (base: string) =>
  glob({ pattern: ['**/*.md', ...KRASNOYARSK_ONLY.map((p) => '!' + p)], base, generateId: ({ entry }) => entry.replace(/\.md$/, '') });

// Doctors, articles, news and offers are also edited at /admin/ (docs/admin.md).
// There a new entry needs no address or SEO texts: they are made here, when the
// site is built. The address comes from the file name, which the editor sets once
// when the entry is created, so it stays put when the heading is edited later.
// An entry marked hidden ("Скрыть с сайта") is left out of the site entirely; its
// address redirects to its section (scripts/hidden-redirects.mjs).
const plain = (md = '') =>
  md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`|]/g, '').replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,.:;\s]+$/, '') + '…');
const newAddress = (id: string, d: Record<string, any>) => {
  const name = slug(id.split('/').pop()!);
  if (d.name !== undefined) return `/vrachi/vrachi-medyunion/${name}/`;
  if (d.kind === 'news') return `/news/${name}/`;
  if (d.kind === 'sale') return `/sales/${name}/`;
  return d.category ? `/articles/${d.category}/${name}/` : `/articles/${name}/`;
};
type Loader = ReturnType<typeof glob>;
const editable = (loader: Loader): Loader => ({
  ...loader,
  load: (ctx) =>
    loader.load({
      ...ctx,
      store: new Proxy(ctx.store, {
        get(store, key) {
          if (key !== 'set') { const v = Reflect.get(store, key); return typeof v === 'function' ? v.bind(store) : v; }
          return (entry: Parameters<typeof store.set>[0]) => {
            const d = entry.data as Record<string, any>;
            if (d.hidden) { store.delete(entry.id); return false; }
            if (!d.url) d.url = newAddress(entry.id, d);
            const heading = d.name !== undefined ? `${d.name}, ${String(d.specialty).toLowerCase()}` : d.h1;
            if (!d.title) d.title = cut(`${heading} | Медюнион`, 80);
            if (!d.description) d.description = cut(d.name !== undefined ? `${heading}. ${plain(entry.body)}`.trim() : plain(entry.body) || heading, 180);
            return store.set(entry);
          };
        },
      }),
    }),
});

// Kansk build: no city in titles and headings (dropCity in src/data/city.ts).
// Clinic pages keep theirs, it is part of the address.
const cityless = <T extends z.ZodType<{ title: string; h1?: string; layout?: string }>>(schema: T) =>
  KANSK ? schema.transform((d) => (d.layout === 'clinic' ? d : { ...d, title: dropCity(d.title), ...(d.h1 !== undefined && { h1: dropCity(d.h1) }) })) : schema;

const clinic = z.enum(['kurchatova', 'instrumentalnaya', 'kansk']);
// A link to a doctor: the doctor's entry id. Not reference('doctors'), so that a
// doctor hidden at /admin/ is not an error: pages skip ids they can't find
// (doctorsByIds in src/lib/content.ts).
const doctorRef = z.string();
// Prices shown always come from the price list (src/lib/prices.ts); the number here is only a note.
const price = z.object({ name: z.string(), price: z.number().positive().optional() });

const seo = {
  // Full page address, exactly as on the old site, e.g. "/uslugi/centr/ginekologiya/".
  url: z.string().startsWith('/').endsWith('/'),
  // <title>: the blue link in Yandex. Up to 80 characters.
  title: z.string().min(10).max(80),
  // Meta description: the grey text under the link. 50 to 200 characters.
  description: z.string().min(50).max(200),
};

// Doctors and articles: the same, but may be left empty (made at build, see `editable`).
const seoEditable = {
  url: z.string().regex(/^(\/.*\/)?$/, 'адрес начинается и кончается на /').default(''),
  title: z.string().max(80).default(''),
  description: z.string().max(200).default(''),
  // "Скрыть с сайта" at /admin/
  hidden: z.boolean().default(false),
};

const services = defineCollection({
  loader: files(`${ROOT}/services`),
  schema: cityless(z.object({
    ...seo,
    h1: z.string(),
    lead: z.string().optional(),
    // One line shown on this page's tile in its parent section
    teaser: z.string().optional(),
    // Addresses of pages in other sections worth linking from this one
    related: z.array(z.string()).default([]),
    prices: z.array(price).default([]),
    pricesCheckedOn: z.coerce.date().optional(),
    // Where the service is offered. Empty = both Krasnoyarsk clinics are shown.
    clinics: z.array(clinic).default([]),
    doctors: z.array(doctorRef).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  })),
});

const doctors = defineCollection({
  loader: editable(files(`${ROOT}/doctors`)),
  schema: cityless(z.object({
    ...seoEditable,
    name: z.string(),
    specialty: z.string(),
    qualification: z.string().optional(),
    specialization: z.string().optional(),
    experienceYears: z.number().int().positive().optional(),
    // Optional: a photo uploaded at /admin/ (src/assets/doctors/...). Without it,
    // public/doctors/<last part of the url>.jpg is used when it exists
    // (scripts/crop-doctor-photos.py makes those).
    photo: z.string().optional(),
    clinics: z.array(clinic).default([]),
    // Doctor sections (/vrachi/vrachi-kardiologi/ ...) the doctor is shown in,
    // besides those whose `members` list them
    groups: z.array(z.string()).default([]),
    education: z.array(z.string()).default([]),
    prices: z.array(price).default([]),
  })),
});

// Articles and news are the same on both sites: the Kansk build reads them from
// src/content/ and only its offers from src/content-kansk/.
const articleFiles = KANSK
  ? (() => {
      const l = glob({
        pattern: ['content/articles/**/*.md', 'content-kansk/articles/**/*.md', ...KRASNOYARSK_ONLY.map((p) => '!' + p)],
        base: './src',
        generateId: ({ entry }) => entry.replace(/^content\/articles\//, '').replace(/\.md$/, ''),
      });
      // main site's offers and the old Kansk copy's articles and news are not used
      return { ...l, load: (ctx: Parameters<typeof l.load>[0]) => l.load({ ...ctx, parseData: async (e: any) => {
        const d = (await ctx.parseData(e)) as Record<string, any>;
        const kansk = String(e.filePath ?? '').includes('content-kansk/');
        return (kansk ? d.kind === 'sale' : d.kind !== 'sale') ? d : { ...d, hidden: true, url: d.url || '/' };
      } }) } as typeof l;
    })()
  : files(`${ROOT}/articles`);

const link = z.object({ label: z.string(), url: z.string() });
const articles = defineCollection({
  loader: editable(articleFiles),
  schema: cityless(z.object({
    ...seoEditable,
    h1: z.string(),
    kind: z.enum(['article', 'news', 'sale']),
    date: z.coerce.date().optional(), // news
    category: z.string().optional(), // articles: the section under /articles/
    // Offers
    discount: z.string().optional(), // "5%"
    period: z.string().optional(), // "с 01.01.2025, бессрочно"
    group: z.enum(['social', 'special']).optional(), // on /sales/: social discounts or special offers
    summary: z.string().optional(), // one line on the offer's card
    badge: z.string().optional(), // instead of the discount, e.g. "5 500 ₽"
    card_title: z.string().optional(), // shorter title for the card
    links: z.array(link).default([]), // what the offer is about; it also shows on those service pages
  })),
});

const prices = defineCollection({
  loader: files(`${ROOT}/prices`),
  schema: cityless(z.object({
    ...seo,
    h1: z.string(),
    items: z.array(price).default([]),
  })),
});

// Section pages whose list is built automatically (all doctors, all articles...).
const listings = defineCollection({
  loader: files(`${ROOT}/listings`),
  schema: cityless(z.object({
    ...seo,
    h1: z.string(),
    of: z.enum(['doctors', 'articles', 'news', 'sales', 'prices']),
    // Doctor lists: addresses of the doctors shown (otherwise: doctors under this address)
    members: z.array(z.string()).optional(),
  })),
});

const pages = defineCollection({
  loader: files(`${ROOT}/pages`),
  schema: cityless(z.object({
    ...seo,
    h1: z.string(),
    layout: z.enum(['contacts', 'clinic']).optional(),
    clinic: clinic.optional(),
  })),
});

// Patient reviews. One list in reviews.json, newest first. A review that
// names a doctor gets `doctor` (the doctor's entry id) and also shows on
// that doctor's page. New reviews arrive through the form, the clinic checks
// them, then they are added here.
const reviews = defineCollection({
  loader: file('./src/content/reviews/reviews.json'),
  schema: z.object({
    date: z.coerce.date(),
    author: z.string(),
    text: z.string(),
    rating: z.number().int().min(1).max(5).optional(),
    doctor: doctorRef.optional(),
    // Where the review was first posted (2ГИС, ПроДокторов)
    source: z.object({ name: z.string(), url: z.string().url() }).optional(),
    // The clinic's answer
    reply: z.string().optional(),
  }),
});

// Banners on the home page (src/content/banners/*.yml), edited at /admin/.
// Either a picture made by marketing (image, optional image_mobile, alt) or a
// text banner (title, text, button). Shown between start and end, Krasnoyarsk
// dates; the site rebuilds every night so they appear and disappear on time.
const banners = defineCollection({
  loader: glob({ pattern: '*.yml', base: 'src/content/banners' }),
  schema: z
    .object({
      enabled: z.boolean().default(true),
      city: z.enum(['both', 'krasnoyarsk', 'kansk']).default('both'),
      title: z.string().optional(),
      highlight: z.string().optional(),
      // Text banners: 'bright' = white on the brand gradient, 'light' = on pale pink
      theme: z.enum(['bright', 'light']).default('bright'),
      // Text banners: an optional photo on the right (src/assets/banners/)
      photo: z.string().optional(),
      text: z.string().optional(),
      button: z.string().optional(),
      link: z.string().optional(),
      image: z.string().optional(),
      image_mobile: z.string().optional(),
      alt: z.string().optional(),
      start: z.coerce.date().optional(),
      end: z.coerce.date().optional(),
      order: z.number().default(10),
    })
    .refine((b) => b.image || b.title, { message: 'Баннер: нужна картинка или заголовок' })
    .refine((b) => !b.image || (b.alt && b.alt.trim().length > 3), { message: 'Баннер с картинкой: заполните «Текст с картинки»' }),
});

export const collections = { services, doctors, articles, prices, listings, pages, reviews, banners };
