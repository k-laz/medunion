// Facts used on every page. Change them here once and every page updates.

export const phones = {
  main: { display: '+7 (391) 220-03-03', tel: '+73912200303' },
  second: { display: '+7 (391) 227-40-31', tel: '+73912274031' },
  kansk: { display: '+7 (39161) 4-10-04', tel: '+73916141004' },
};

export const clinics = {
  kurchatova: {
    name: 'Медюнион на Курчатова',
    city: 'Красноярск',
    address: 'ул. Курчатова, 17, стр. 15',
    district: 'Октябрьский район',
    phone: phones.main,
    // From the clinic's own contact page, October 2026. The old site header said 21:00 / 18:00.
    hours: ['Пн–Пт 07:30–20:00', 'Сб 08:00–17:00', 'Вс выходной'],
  },
  instrumentalnaya: {
    name: 'Медюнион на Инструментальной',
    city: 'Красноярск',
    address: 'ул. Инструментальная, 12/35',
    district: '',
    phone: phones.main,
    hours: ['Пн–Пт 07:30–20:00', 'Сб 08:00–17:00', 'Вс 09:00–14:00'],
  },
  kansk: {
    name: 'Медюнион в Канске',
    city: 'Канск',
    address: 'ул. Урицкого, 8',
    district: '',
    phone: phones.kansk,
    hours: ['Пн–Пт 08:00–20:00', 'Сб 08:30–18:00', 'Вс выходной'],
  },
} as const;

export type ClinicKey = keyof typeof clinics;

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
  medflexUser: 'f003f028f3bd05d936b335f721f949aa',
  bitrix24: {
    callTracker: 'https://cdn-ru.bitrix24.ru/b37371128/crm/tag/call.tracker.js',
    siteButton: 'https://cdn-ru.bitrix24.ru/b37371128/crm/site_button/loader_2_9x00z3.js',
  },
  dailyGrowWidgetId: 'b4486417-63a6-4218-89b2-8db8a6f40779',
  // Top.Mail.Ru (VK) counter, used for VK ads. Same id as on the old site.
  topMailRuId: '3628693',
  // Yandex Webmaster ownership check. If the old site was verified with a
  // <meta name="yandex-verification"> tag, put its content here, e.g. 'a1b2c3d4e5f6'.
  yandexVerification: '',
};

// Every "Записаться" button leads here. The page embeds the MedFlex booking.
export const bookingPage = '/appointment/';
export const medflexUrl = `https://booking.medflex.ru/?user=${integrations.medflexUser}`;

// Analytics, call tracking and chat only load on the real site.
// Preview builds stay silent so test visits don't pollute Metrica.
export const isProduction = import.meta.env.PUBLIC_SITE_ENV === 'production';
