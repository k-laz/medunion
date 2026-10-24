import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The live domain. Keep it here so canonical links and the sitemap
// always point at medunion.group, even on preview builds.
const SITE = 'https://medunion.group';

export default defineConfig({
  site: SITE,
  // Bitrix URLs all end with "/", so we keep the same shape.
  // Same URLs = Yandex keeps the rankings it already gave these pages.
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') })],
});
