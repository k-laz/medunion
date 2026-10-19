// Small index for the site search box: every service, doctor and price page.
// Built once at build time; the browser loads it the first time someone
// clicks into a search field.
import { getCollection } from 'astro:content';

export async function GET() {
  const services = await getCollection('services');
  const doctors = await getCollection('doctors');
  const prices = await getCollection('prices');
  const items = [
    ...services.filter((s) => s.data.url !== '/uslugi/').map((s) => ({ t: s.data.h1, u: s.data.url, k: 'Услуга' })),
    ...doctors.map((d) => ({ t: d.data.name, u: d.data.url, k: d.data.specialty })),
    ...prices.map((p) => ({ t: p.data.h1, u: p.data.url, k: 'Цены' })),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
