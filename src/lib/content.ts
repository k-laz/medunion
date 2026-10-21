// Small helpers shared by the page templates.
import { getCollection, type CollectionEntry } from 'astro:content';

export const segments = (url: string) => url.split('/').filter(Boolean);

/** Pages one level below `url` (e.g. the services inside a section). */
export function childrenOf<T extends { data: { url: string } }>(url: string, entries: T[]): T[] {
  const depth = segments(url).length + 1;
  return entries
    .filter((e) => e.data.url !== url && e.data.url.startsWith(url) && segments(e.data.url).length === depth)
    .sort((a, b) => a.data.url.localeCompare(b.data.url));
}

/** Breadcrumb trail of existing pages above `url`. */
export async function breadcrumbs(url: string) {
  const all = [
    ...(await getCollection('services')),
    ...(await getCollection('listings')),
    ...(await getCollection('pages')),
  ] as { data: { url: string; h1: string } }[];
  const byUrl = new Map(all.map((e) => [e.data.url, e.data.h1]));
  const s = segments(url);
  const trail: { url: string; label: string }[] = [];
  for (let i = 1; i < s.length; i++) {
    const u = `/${s.slice(0, i).join('/')}/`;
    if (byUrl.has(u)) trail.push({ url: u, label: byUrl.get(u)! });
  }
  return trail;
}

/** Services that list this doctor. */
export async function servicesOfDoctor(doctorId: string) {
  const services = await getCollection('services');
  return services.filter((s) => s.data.doctors.some((d) => d.id === doctorId));
}

export const rub = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

/** Surname and first name initials, skipping anything in brackets, e.g. "(Зубова)". */
export const initials = (name: string) =>
  name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');

/** "1 год", "3 года", "11 лет" */
export const years = (n: number) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет'}`;
};

export type Service = CollectionEntry<'services'>;
export type Doctor = CollectionEntry<'doctors'>;

/** Shorter label for link tiles: the city is already obvious on the page. */
export const tileLabel = (h1: string) => h1.replace(/\s+в Красноярске$/, '');

/** First sentence of a teaser, cut to about 140 characters at a word. */
export const shortTeaser = (t: string) => {
  const first = t.match(/^.{20,}?[.!?](\s|$)/)?.[0].trim() ?? t;
  return first.length <= 140 ? first : first.slice(0, 140).replace(/\s+\S*$/, '') + '…';
};
