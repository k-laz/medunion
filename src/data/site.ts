// Facts used on every page. Change them here once and every page updates.

export const phones = {
  main: { display: '+7 (391) 220-03-03', tel: '+73912200303' },
  second: { display: '+7 (391) 227-40-31', tel: '+73912274031' },
  kansk: { display: '+7 (39161) 4-10-04', tel: '+73916141004' },
};

// Ratings on review sites, per clinic. The numbers are copied by hand from
// each site (they have no free way to read them automatically), so update
// them and ratingsChecked together. A rating left out shows as a plain link.
export type Platform = '2gis' | 'prodoctorov' | 'yandex';
export const platformName: Record<Platform, string> = { '2gis': '2ГИС', prodoctorov: 'ПроДокторов', yandex: 'Яндекс Карты' };
export interface Rating { platform: Platform; url: string; rating?: number; count?: number; countWord?: 'оценка' | 'отзыв' }
export const ratingsChecked = '2026-11-10';

export const clinics = {
  kurchatova: {
    name: 'Медюнион на Курчатова',
    short: 'Курчатова',
    city: 'Красноярск',
    address: 'ул. Курчатова, 17, стр. 15',
    district: 'Октябрьский район',
    note: 'Въезд с ул. Лесопарковой',
    phone: phones.main,
    phones: [phones.main, phones.second],
    // From the clinic's own contact page, October 2026. The old site header said 21:00 / 18:00.
    hours: ['Пн–Пт 07:30–20:00', 'Сб 08:00–17:00', 'Вс выходной'],
    opened: '2011-11-22',
    coords: [56.017388, 92.775829],
    ratings: [
      { platform: '2gis', url: 'https://2gis.ru/krasnoyarsk/geo/70000001034186673', rating: 4.8, count: 690, countWord: 'оценка' },
      { platform: 'prodoctorov', url: 'https://prodoctorov.ru/krasnoyarsk/lpu/42671-medyunion-na-kurchatova/', rating: 4.4, count: 142, countWord: 'отзыв' },
      { platform: 'yandex', url: 'https://yandex.ru/maps/org/medyunion/1097246908/' },
    ] as Rating[],
  },
  instrumentalnaya: {
    name: 'Медюнион на Инструментальной',
    short: 'Инструментальная',
    city: 'Красноярск',
    address: 'ул. Инструментальная, 12/35',
    district: 'Ленинский район',
    note: '',
    phone: phones.main,
    phones: [phones.main, phones.second],
    hours: ['Пн–Пт 07:30–20:00', 'Сб 08:00–17:00', 'Вс 09:00–14:00'],
    opened: '2011-11-22',
    coords: [56.017498, 92.97126],
    ratings: [
      { platform: '2gis', url: 'https://2gis.ru/krasnoyarsk/geo/70000001034186662', rating: 4.9, count: 689, countWord: 'оценка' },
      { platform: 'prodoctorov', url: 'https://prodoctorov.ru/krasnoyarsk/lpu/42672-medyunion-na-instrumentalnoy/', rating: 4.6, count: 134, countWord: 'отзыв' },
      { platform: 'yandex', url: 'https://yandex.ru/maps/org/medyunion/1072862398/' },
    ] as Rating[],
  },
  kansk: {
    name: 'Медюнион в Канске',
    short: 'Канск',
    city: 'Канск',
    address: 'ул. Урицкого, 8',
    district: '',
    note: '',
    phone: phones.kansk,
    phones: [phones.kansk, phones.main],
    // The old main site says 20:00 on weekdays, kansk.medunion.group says 18:30. Ask the clinic.
    hours: ['Пн–Пт 08:00–20:00', 'Сб 08:30–18:00', 'Вс выходной'],
    opened: '2015-11-19',
    coords: [56.205636, 95.702387],
    ratings: [
      { platform: '2gis', url: 'https://2gis.ru/krasnoyarsk/geo/70000001050369616', rating: 4.5, count: 44, countWord: 'оценка' },
      { platform: 'prodoctorov', url: 'https://prodoctorov.ru/kansk/lpu/55245-medyunion-na-urickogo/', rating: 3.7, count: 24, countWord: 'отзыв' },
      { platform: 'yandex', url: 'https://yandex.ru/maps/org/medyunion/143183734001/' },
    ] as Rating[],
  },
} as const;

export type ClinicKey = keyof typeof clinics;

// Each clinic's own page.
export const clinicPage: Record<ClinicKey, string> = {
  kurchatova: '/contacts/klinika-na-kurchatova/',
  instrumentalnaya: '/contacts/klinika-na-instrumentalnoy/',
  kansk: '/contacts/klinika-v-kanske/',
};

// The company opened its first clinics on this day (both Krasnoyarsk clinics).
export const founded = '2011-11-22';

// Awards shown on the home page and on the clinic's page. Real ones only.
export const awards: { title: string; by: string; years: string; clinic?: ClinicKey; url?: string }[] = [
  { title: '«Лучший медицинский центр Ленинского района»', by: '2ГИС', years: '2026', clinic: 'instrumentalnaya', url: '/news/my-stali-pobeditelem-premii-2gis-luchshiy-tsentr-leninskogo-rayona-/' },
  { title: 'Пачема Л. С., нейрохирург Красноярского края', by: 'Премия ПроДокторов', years: '2025', url: '/news/neyrokhirurg-krasnoyarskogo-kraya-2025-g-pachema-liliya-sergeevna/' },
];

// The clinic's social pages, linked in the header, menu and footer.
export const social = [
  { key: 'vk', label: 'ВКонтакте', url: 'https://vk.com/medunion' },
  { key: 'telegram', label: 'Telegram', url: 'https://t.me/medunion24' },
] as const;

// Reviews: the list of reviews, and the separate page with the form.
export const reviewsPage = '/ostavit-otzyv-o-nashej-rabote/';
export const reviewFormPage = '/ostavit-otzyv-o-nashej-rabote/napisat/';

// Legal details shown in the footer. Copied from the "Сведения о медицинской
// организации" page of the old site; check against the current license.
export const legal = {
  name: 'ООО «МЕДЮНИОН»',
  inn: '2464239120',
  license: 'Лицензия № ЛО-41-01019-24/00359549 от 02.09.2019, выдана Министерством здравоохранения Красноярского края',
  address: '660062, г. Красноярск, ул. Курчатова, 17, стр. 15',
};

// Third-party services embedded in the site. These ids are copied from the
// current Bitrix site, so bookings, CRM leads and statistics keep flowing to
// the same accounts after the switch.
export const integrations = {
  metrikaId: 108194831,
  bitrix24: {
    callTracker: 'https://cdn-ru.bitrix24.ru/b37371128/crm/tag/call.tracker.js',
    siteButton: 'https://cdn-ru.bitrix24.ru/b37371128/crm/site_button/loader_2_9x00z3.js',
  },
  dailyGrowWidgetId: 'b4486417-63a6-4218-89b2-8db8a6f40779',
  // Top.Mail.Ru (VK) counter, used for VK ads. Same id as on the old site.
  topMailRuId: '3628693',
  // Yandex Webmaster ownership checks, copied from the old site's <head>.
  // Without them Webmaster loses access to the site after the switch.
  yandexVerification: ['2de5787671f114c1', '53385810d7a8cf62'],
};

// Our own small server on the VPS, next to the site (nginx sends /api/ to it).
// It talks to the МИС «Ариадна» and receives reviews; the МИС login lives
// only in its settings on the server. Contract: docs/server-api.md
export const apiBase = '/api';
// Doctor pages: the "Расписание и запись" block with free times from the МИС.
// Off until the МИС is connected (docs/mis-api.md); then set to true.
export const showSchedule = false;

// Every "Записаться" button leads here.
export const bookingPage = '/appointment/';

// Analytics, call tracking and chat only load on the real site.
// Preview builds stay silent so test visits don't pollute Metrica.
export const isProduction = import.meta.env.PUBLIC_SITE_ENV === 'production';
