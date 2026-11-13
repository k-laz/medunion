// Small helpers shared by the page templates.
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const segments = (url: string) => url.split('/').filter(Boolean);

/** Doctors by entry id, leaving out any that are hidden or gone. */
export const doctorsByIds = async (ids: string[]) =>
  (await Promise.all([...new Set(ids)].map((id) => getEntry('doctors', id)))).filter((x) => x !== undefined);

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
  byUrl.set('/ostavit-otzyv-o-nashej-rabote/', 'Отзывы'); // hand-made page, not in a collection
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
  return services.filter((s) => s.data.doctors.includes(doctorId));
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
/** Text under a page's heading: the whole first sentence, or nothing. Never cut mid-sentence. */
export const leadText = (t: string) => {
  const first = t.match(/^.{20,}?[.!?](\s|$)/)?.[0].trim() ?? t.trim();
  if (first.length > 260 || /^Показания/i.test(first) || !/[.!?]$/.test(first)) return undefined;
  return first;
};

export const shortTeaser = (t: string) => {
  const first = t.match(/^.{20,}?[.!?](\s|$)/)?.[0].trim() ?? t;
  return first.length <= 140 ? first : first.slice(0, 140).replace(/\s+\S*$/, '') + '…';
};

// Short names for menus, the catalog and the home page, where a page's full
// heading (written for search engines) is too long.
const SHORT_NAMES: Record<string, string> = {
  '/uslugi/centr/nevrologiya/': 'Неврология',
  '/uslugi/centr/terapiya/': 'Терапия',
  '/uslugi/pediatriya1/priyem-detskogo-nevrologa/': 'Приём детского невролога',
  '/uslugi/ortopediya-/': 'Ортопедия (подбор стелек)',
};
/** "МРТ открытого типа (магнитно-резонансная томография) в Красноярске" -> "МРТ открытого типа" */
export const shortName = (url: string, h1: string) =>
  SHORT_NAMES[url] ?? h1.replace(/\s*\((магнитно|компьютерная|Фиброгастроскопия)[^)]*\)/gi, '').replace(/\s+в Красноярске$/, '').trim();

/** plural(5, 'врач', 'врача', 'врачей') -> "врачей" */
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Years in business as people count them: calendar years since the opening
 *  year ("2011-11-22" -> 15 in 2026), not full years to the day. */
export const yearsSince = (iso: string, now = new Date()) => now.getFullYear() - Number(iso.slice(0, 4));

/** "2026-11-10" -> "10.11.2026" */
export const dmy = (iso: string) => iso.split('-').reverse().join('.');

/** A doctor's photo: one uploaded at /admin/ (src/assets/doctors/, cut to 640x800
 *  from the top, where the face is), else public/doctors/<last part of the page
 *  address>.jpg (640x800, cropped to the face by scripts/crop-doctor-photos.py). */
const uploaded = import.meta.glob<{ default: ImageMetadata }>('/src/assets/doctors/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', { eager: true });
export const photoFor = async (url: string, photo?: string) => {
  if (photo?.startsWith('/src/assets/')) {
    const img = uploaded[photo]?.default;
    if (!img) throw new Error(`Врач ${url}: фото ${photo} не найдено в src/assets/doctors/`);
    return (await getImage({ src: img, width: 640, height: 800, fit: 'cover', position: 'top', format: 'jpg', quality: 84 })).src;
  }
  if (photo) return photo;
  const file = `/doctors/${url.split('/').filter(Boolean).pop()}.jpg`;
  return existsSync(join(process.cwd(), 'public', file)) ? file : undefined;
};
