import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { dropCity } from './data/city';

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

// Kansk build: no city in titles and headings (dropCity in src/data/city.ts).
// Clinic pages keep theirs, it is part of the address.
const cityless = <T extends z.ZodType<{ title: string; h1?: string; layout?: string }>>(schema: T) =>
  KANSK ? schema.transform((d) => (d.layout === 'clinic' ? d : { ...d, title: dropCity(d.title), ...(d.h1 !== undefined && { h1: dropCity(d.h1) }) })) : schema;

const clinic = z.enum(['kurchatova', 'instrumentalnaya', 'kansk']);
const price = z.object({ name: z.string(), price: z.number().positive() });

const seo = {
  // Full page address, exactly as on the old site, e.g. "/uslugi/centr/ginekologiya/".
  url: z.string().startsWith('/').endsWith('/'),
  // <title>: the blue link in Yandex. Up to 80 characters.
  title: z.string().min(10).max(80),
  // Meta description: the grey text under the link. 50 to 200 characters.
  description: z.string().min(50).max(200),
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
    doctors: z.array(reference('doctors')).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  })),
});

const doctors = defineCollection({
  loader: files(`${ROOT}/doctors`),
  schema: cityless(z.object({
    ...seo,
    name: z.string(),
    specialty: z.string(),
    qualification: z.string().optional(),
    specialization: z.string().optional(),
    experienceYears: z.number().int().positive().optional(),
    // Optional: a photo path. Without it, public/doctors/<last part of the url>.jpg is used
    // when it exists (scripts/crop-doctor-photos.py makes those).
    photo: z.string().optional(),
    clinics: z.array(clinic).default([]),
    education: z.array(z.string()).default([]),
    prices: z.array(price).default([]),
  })),
});

const articles = defineCollection({
  loader: files(`${ROOT}/articles`),
  schema: cityless(z.object({
    ...seo,
    h1: z.string(),
    kind: z.enum(['article', 'news', 'sale']),
    discount: z.string().optional(), // offers: "5%"
    period: z.string().optional(), // offers: "с 01.01.2025, бессрочно"
    date: z.coerce.date().optional(), // news
    category: z.string().optional(),
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
    doctor: reference('doctors').optional(),
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
