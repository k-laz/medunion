// Which city this build is for. The same code builds two sites:
//   npm run build          medunion.group           Krasnoyarsk (both clinics)
//   npm run build:kansk    kansk.medunion.group     Kansk (only city pages)
// The Kansk site has only what is particular to Kansk: services, doctors,
// prices, offers, contacts, booking. Shared pages (articles, news, patient
// information, about the company, reviews) live once on medunion.group, and
// links to them point there (scripts/rehost.mjs).
import { clinics, phones, type ClinicKey } from './site';
import shared from './shared-sections.json';

export type City = 'krasnoyarsk' | 'kansk';
export const CITY: City = process.env.CITY === 'kansk' ? 'kansk' : 'krasnoyarsk';
export const isKansk = CITY === 'kansk';

// Where each site lives. On the GitHub Pages preview these are the preview folders.
export const MAIN_ORIGIN = process.env.MAIN_ORIGIN || 'https://medunion.group';
export const KANSK_ORIGIN = process.env.KANSK_ORIGIN || 'https://kansk.medunion.group';

export const cities: Record<City, { name: string; in: string; origin: string; clinics: ClinicKey[]; phone: (typeof phones)[keyof typeof phones]; since: string }> = {
  krasnoyarsk: { name: 'Красноярск', in: 'в Красноярске', origin: MAIN_ORIGIN, clinics: ['kurchatova', 'instrumentalnaya'], phone: phones.main, since: clinics.kurchatova.opened },
  kansk: { name: 'Канск', in: 'в Канске', origin: KANSK_ORIGIN, clinics: ['kansk'], phone: phones.kansk, since: clinics.kansk.opened },
};
export const city = cities[CITY];

// First parts of addresses that only the main site has.
// (also used by scripts/rehost.mjs)
export const SHARED_SECTIONS: string[] = shared;
/** Is this page part of this build? (The Kansk build leaves out shared pages and Krasnoyarsk clinic pages.) */
export const inThisSite = (url: string, clinic?: string) => {
  if (!isKansk) return true;
  if (SHARED_SECTIONS.includes(url.split('/')[1])) return false;
  if (clinic && !city.clinics.includes(clinic as ClinicKey)) return false;
  return true;
};

// The Kansk site's titles and headings name no city: the old Kansk copy mixes
// «в Красноярске» and «в Канске», and the subdomain already tells Yandex the
// region. Applied when the content is read (src/content.config.ts), so a new
// copy of the old site keeps it. Clinic pages keep their address.
const CITY_WORDS = /(\s+сделать)?\s+(?:в|во)\s+(?:Красноярске|Канске)(?:\s+и\s+(?:Красноярске|Канске))?|\s+(?:Красноярске|Канске|Красноярск|Канск)(?=$|[\s|:.,;"«»—–-])/g;
export const dropCity = (s: string) =>
  s.replace(CITY_WORDS, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([:.,;])/g, '$1')
    .replace(/(\s*[|—–-])+\s*$/, '')
    .trim();
