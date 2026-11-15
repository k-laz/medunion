// Card pictures for offers and news (home page). The picture is the entry's
// `image` field (uploaded at /admin/), else the first picture in its text.
// scripts/thumbs.mjs makes a 720x450 card version of each into public/thumbs/
// before the build; pages link to it with thumbFor().
import { createHash } from 'node:crypto';

/** The source picture of an entry: its `image` field, or the first picture in the Markdown text. */
export const coverSource = (image, body = '') => image || body.match(/!\[[^\]]*\]\((\/[^)\s]+)/)?.[1];

/** Where the card version of a picture lives. */
export const thumbFor = (src) => `/thumbs/${createHash('md5').update(src).digest('hex').slice(0, 12)}.webp`;
