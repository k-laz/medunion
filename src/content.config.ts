import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
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

export const collections = { services, doctors, articles, prices, listings, pages };
