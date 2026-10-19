import type { APIRoute } from 'astro';
import { isProduction } from '../data/site';

// Preview builds block all search engines. The production build opens
// the site and points Yandex at the sitemap. Forgetting this switch is
// the most common way a relaunch wipes out search traffic, so it is automatic.
export const GET: APIRoute = ({ site }) => {
  const body = isProduction
    ? `User-agent: *\nDisallow: /search/\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&utm_reg&yandex-source\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
