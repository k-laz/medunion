import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

// The live domain. Keep it here so canonical links and the sitemap
// always point at the real domain, even on preview builds.
// CITY=kansk builds the Kansk site (kansk.medunion.group) into dist-kansk/.
const KANSK = process.env.CITY === 'kansk';
const SITE = KANSK ? 'https://kansk.medunion.group' : 'https://medunion.group';
// The Kansk copies of shared pages (articles, news...) stay out of its sitemap.
const SHARED = KANSK ? JSON.parse(readFileSync(new URL('./src/data/shared-sections.json', import.meta.url), 'utf8')) : [];
const sharedCopy = (page) => SHARED.includes(new URL(page).pathname.split('/')[1]);

export default defineConfig({
  site: SITE,
  outDir: KANSK ? './dist-kansk' : './dist',
  // Bitrix URLs all end with "/", so we keep the same shape.
  // Same URLs = Yandex keeps the rankings it already gave these pages.
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The floating Astro toolbar in `npm run dev` covers the mobile booking bar.
  devToolbar: { enabled: false },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') && !page.endsWith('/napisat/') && !sharedCopy(page) })],
});
