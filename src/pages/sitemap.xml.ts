import type { APIRoute } from 'astro';

// /sitemap.xml: the address the old site used and that Yandex Webmaster and
// robots.txt know. Same content as /sitemap-index.xml (made by @astrojs/sitemap).
export const GET: APIRoute = ({ site }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${new URL('sitemap-0.xml', site)}</loc></sitemap></sitemapindex>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
