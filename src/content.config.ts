import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

// Every page is a Markdown file. The fields at the top of the file
// (between the --- lines) are checked here, so a page with a missing
// title or description fails the build instead of going live broken.
//
// Files in an `imported/` folder are written by `npm run convert` from the
// old Bitrix site. To take over a page by hand, move its file out of
// `imported/` (keep the same `url`) and the converter will leave it alone.

// Entry id = file path without ".md", so references are easy to read,
// e.g. "imported/vrachi/vrachi-ginekologi/kolova-lyudmila-mikhaylovna".
const files = (base: string) =>
  glob({ pattern: '**/*.md', base, generateId: ({ entry }) => entry.replace(/\.md$/, '') });

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
  loader: files('./src/content/services'),
  schema: z.object({
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
  }),
});

const doctors = defineCollection({
  loader: files('./src/content/doctors'),
  schema: z.object({
    ...seo,
    name: z.string(),
    specialty: z.string(),
    qualification: z.string().optional(),
    specialization: z.string().optional(),
    experienceYears: z.number().int().positive().optional(),
    // Put photos in /public/doctors/ and write the path here, e.g. "/doctors/kolova.jpg".
    photo: z.string().optional(),
    clinics: z.array(clinic).default([]),
    education: z.array(z.string()).default([]),
    prices: z.array(price).default([]),
  }),
});

const articles = defineCollection({
  loader: files('./src/content/articles'),
  schema: z.object({
    ...seo,
    h1: z.string(),
    kind: z.enum(['article', 'news', 'sale']),
    discount: z.string().optional(), // offers: "5%"
    period: z.string().optional(), // offers: "с 01.01.2025, бессрочно"
    date: z.coerce.date().optional(), // news
    category: z.string().optional(),
  }),
});

const prices = defineCollection({
  loader: files('./src/content/prices'),
  schema: z.object({
    ...seo,
    h1: z.string(),
    items: z.array(price).default([]),
  }),
});

// Section pages whose list is built automatically (all doctors, all articles...).
const listings = defineCollection({
  loader: files('./src/content/listings'),
  schema: z.object({
    ...seo,
    h1: z.string(),
    of: z.enum(['doctors', 'articles', 'news', 'sales', 'prices']),
    // Doctor lists: addresses of the doctors shown (otherwise: doctors under this address)
    members: z.array(z.string()).optional(),
  }),
});

const pages = defineCollection({
  loader: files('./src/content/pages'),
  schema: z.object({
    ...seo,
    h1: z.string(),
    layout: z.enum(['contacts', 'clinic']).optional(),
    clinic: clinic.optional(),
  }),
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

export const collections = { services, doctors, articles, prices, listings, pages, reviews };
