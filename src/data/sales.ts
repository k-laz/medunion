// How each offer shows on /sales/: its group, a one-line summary for the card,
// an optional badge (otherwise the discount, e.g. "−15%"), a shorter card
// title where the old heading is long, and links to what the offer is about.
// Keyed by the offer's address. An offer missing here still shows, in
// "Спецпредложения", with its discount.

export type SaleGroup = 'social' | 'special';

export interface SaleInfo {
  group: SaleGroup;
  summary: string;
  badge?: string;
  title?: string;
  links?: { label: string; url: string }[];
}

export const saleGroups: { key: SaleGroup; title: string; text: string }[] = [
  { key: 'social', title: 'Социальные скидки', text: 'Постоянные скидки по документу, во всех клиниках.' },
  { key: 'special', title: 'Спецпредложения', text: 'Скидки и специальные цены на отдельные приёмы и исследования.' },
];

export const sales: Record<string, SaleInfo> = {
  '/sales/skidka-5/': {
    group: 'social',
    summary: 'По пенсионному удостоверению: приём специалистов, КТ, МРТ, ФГС, рентген, анализы.',
  },
  '/sales/skidka-4-mnogodetnym-semyam/': {
    group: 'social',
    summary: 'Детям и родителям из многодетных семей, по удостоверению многодетной семьи.',
  },
  '/sales/skidka-4-lyudyam-s-invalidnostyu/': {
    group: 'social',
    summary: 'По документу, подтверждающему инвалидность: приём специалистов, КТ, МРТ, процедурный кабинет.',
  },
  '/sales/skidka-10-na-vse-uslugi-zashchitnikam-otechestva/': {
    group: 'social',
    summary: '10% участникам боевых действий, 5% их супругам, детям и родителям.',
  },
  '/sales/priem-ginekologa-so-skidkoy-15/': {
    group: 'special',
    summary: 'Консультация гинеколога, гинеколога-эндокринолога Коловой Л.М.',
    links: [
      { label: 'Колова Людмила Михайловна', url: '/vrachi/vrachi-ginekologi/kolova-lyudmila-mikhaylovna/' },
      { label: 'Гинекология', url: '/uslugi/centr/ginekologiya/' },
    ],
  },
  '/sales/priyem-kardiologa-ekho-serdtsa-uzi-ekg-elektrokardiogramma/': {
    group: 'special',
    badge: '5 500 ₽',
    title: 'Приём кардиолога + ЭХО сердца + ЭКГ',
    summary: 'Кардиологический комплекс за один день по фиксированной цене.',
    links: [
      { label: 'Приём кардиолога', url: '/uslugi/centr/kardiologiya/priyem-vracha-kardiologa/' },
      { label: 'ЭХО сердца', url: '/uslugi/diagnostika/ultrazvukovaya-diagnostika/ekho-serdtsa/' },
      { label: 'ЭКГ', url: '/uslugi/proczedurnyj-kabinet/ekg-ekg-s-nagruzkoy/' },
    ],
  },
  '/sales/skidka-15-na-priyem-vracha-pulmonologa-posle-kt-kompyuternoy-tomografii-lyegkikh-v-medyunion-v-krasn/': {
    group: 'special',
    title: 'Скидка 5% на приём пульмонолога после КТ лёгких',
    summary: 'Если вы сделали КТ лёгких в Медюнион.',
    links: [{ label: 'КТ лёгких', url: '/uslugi/diagnostika/mskt/kt-legkih/' }],
  },
  '/sales/skidka-5-na-priem-nevrologa-posle-mrt-medyunion/': {
    group: 'special',
    summary: 'Если вы сделали МРТ в Медюнион.',
    links: [
      { label: 'МРТ открытого типа', url: '/uslugi/diagnostika/mrt/' },
      { label: 'МРТ 1,5 Тесла', url: '/uslugi/diagnostika/mrt-1-5-tesla/' },
      { label: 'Неврология', url: '/uslugi/centr/nevrologiya/' },
    ],
  },
  '/sales/skidka-na-kt-diagnostiku-po-napravleniyam-iz-drugikh-klinik/': {
    group: 'special',
    title: 'Скидка 5% на КТ по направлению из другой клиники',
    summary: 'КТ любой части тела с направлением из другой клиники.',
    links: [{ label: 'КТ (компьютерная томография)', url: '/uslugi/diagnostika/mskt/' }],
  },
  '/sales/skidka-na-kt-legkikh-5/': {
    group: 'special',
    summary: 'КТ лёгких за 4 180 ₽, на Инструментальной.',
    links: [{ label: 'КТ лёгких', url: '/uslugi/diagnostika/mskt/kt-legkih/' }],
  },
};

/** "с 01.01.2025, бессрочно" -> "Бессрочно", "до отмены акции" -> "До отмены акции" */
export const validity = (period?: string) => {
  if (!period) return undefined;
  if (/бессрочно/i.test(period)) return 'Бессрочно';
  return period[0].toUpperCase() + period.slice(1);
};
