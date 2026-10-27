// Small index for the site search box: every service, doctor and price page.
// Built once at build time; the browser loads it the first time someone
// clicks into a search field.
import { getCollection } from 'astro:content';

export async function GET() {
  const services = await getCollection('services');
  const doctors = await getCollection('doctors');
  const prices = await getCollection('prices');
  // d: a short description, so "МРТ поясницы" also finds pages whose title
  // says "пояснично-крестцового" (the description often uses everyday words)
  const desc = (s?: string) => (s || '').replace(/Запись онлайн.*$|Медюнион.*$/, '').slice(0, 160);
  const items = [
    ...services.filter((s) => s.data.url !== '/uslugi/').map((s) => ({ t: s.data.h1, u: s.data.url, k: 'Услуга', d: desc(s.data.description) })),
    ...doctors.map((d) => ({ t: d.data.name, u: d.data.url, k: d.data.specialty, d: d.data.specialization || '' })),
    ...prices.map((p) => ({ t: p.data.h1, u: p.data.url, k: 'Цены', d: p.data.items.map((i) => i.name).join(' ').slice(0, 800) })),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
