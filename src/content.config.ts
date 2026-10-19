import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Every page is a Markdown file. The fields at the top of the file
// (between the --- lines) are checked here, so a page with a missing
// title or description fails the build instead of going live broken.

const seo = {
  // Full page address, exactly as on the old site, e.g. "/uslugi/centr/ginekologiya/".
  url: z.string().startsWith('/').endsWith('/'),
  // <title>: what Yandex shows as the blue link. Aim for 40 to 70 characters.
  title: z.string().min(10).max(80),
  // Meta description: the grey text under the link. Aim for 120 to 160 characters.
  description: z.string().min(50).max(200),
};

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({
    ...seo,
    h1: z.string(),
    // Short line under the heading.
    lead: z.string().optional(),
    // Price list shown in the booking panel. Rubles, as whole numbers.
    prices: z
      .array(z.object({ name: z.string(), price: z.number().int().positive() }))
      .default([]),
    // Date the prices were last checked against the clinic's price list.
    pricesCheckedOn: z.coerce.date().optional(),
    // Which clinics offer this service (keys from src/data/site.ts).
    clinics: z.array(z.enum(['kurchatova', 'instrumentalnaya', 'kansk'])).min(1),
    // Doctors who do this service (file names from src/content/doctors).
    doctors: z.array(reference('doctors')).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

const doctors = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/doctors' }),
  schema: z.object({
    ...seo,
    name: z.string(),
    specialty: z.string(),
    experienceYears: z.number().int().positive().optional(),
    // Put photos in /public/doctors/ and write the path here, e.g. "/doctors/kolova.jpg".
    photo: z.string().optional(),
    clinics: z.array(z.enum(['kurchatova', 'instrumentalnaya', 'kansk'])).min(1),
  }),
});

export const collections = { services, doctors };
