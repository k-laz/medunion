// How each offer shows on /sales/: its group, a one-line summary for the card,
// an optional badge (otherwise the discount, e.g. "−15%"), a shorter card
// title where the old heading is long, and links to what the offer is about.
// These are fields of the offer's own file (edited at /admin/); saleInfo() in
// src/lib/sales.ts collects them. An offer without a group shows in
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

/** "с 01.01.2025, бессрочно" -> "Бессрочно", "до отмены акции" -> "До отмены акции" */
export const validity = (period?: string) => {
  if (!period) return undefined;
  if (/бессрочно/i.test(period)) return 'Бессрочно';
  return period[0].toUpperCase() + period.slice(1);
};
