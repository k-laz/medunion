// Offers' card details (group, summary, badge, card title, links), keyed by the
// offer's address. They are fields of each offer's file; see src/data/sales.ts.
import { getCollection } from 'astro:content';
import type { SaleInfo } from '../data/sales';

let cache: Promise<Record<string, SaleInfo>> | undefined;
export const saleInfo = () =>
  (cache ??= getCollection('articles', (a) => a.data.kind === 'sale').then((list) =>
    Object.fromEntries(
      list.map((a) => [
        a.data.url,
        { group: a.data.group ?? 'special', summary: a.data.summary ?? '', badge: a.data.badge, title: a.data.card_title, links: a.data.links },
      ]),
    ),
  ));
