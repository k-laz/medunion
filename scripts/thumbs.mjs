// Card pictures for offers and news: for each one with a picture (src/lib/covers.mjs),
// a 720x450 WebP in public/thumbs/. The whole picture is kept (offers are often
// square posters with text on them): it sits on a blurred, enlarged copy of itself
// that fills the rest of the card. Runs before every build; public/thumbs/ is not
// in the repository.
//   node scripts/thumbs.mjs
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { coverSource, thumbFor } from '../src/lib/covers.mjs';

const W = 720, H = 450;
async function walk(d) {
  if (!existsSync(d)) return [];
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

await mkdir('public/thumbs', { recursive: true });
let made = 0, kept = 0, missing = [];
for (const f of [...(await walk('src/content/articles')), ...(await walk('src/content-kansk/articles'))]) {
  const text = await readFile(f, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  if (!/^kind:\s*"?(sale|news)"?/m.test(fm)) continue;
  const image = fm.match(/^image:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
  const src = coverSource(image, text.slice(fm.length + 8));
  if (!src) continue;
  const file = src.startsWith('/src/') ? '.' + decodeURI(src) : join('public', decodeURI(src));
  if (!existsSync(file)) { missing.push(`${f}: ${src}`); continue; }
  const out = join('public', thumbFor(src));
  if (existsSync(out)) { kept++; continue; }
  const bg = await sharp(file).rotate().resize(W, H, { fit: 'cover' }).blur(28).modulate({ brightness: 0.92 }).toBuffer();
  const fg = await sharp(file).rotate().resize(W, H, { fit: 'inside' }).toBuffer();
  await sharp(bg).composite([{ input: fg, gravity: 'center' }]).webp({ quality: 78 }).toFile(out);
  made++;
}
console.log(`Card pictures: ${made} made, ${kept} already there${missing.length ? `, missing: ${missing.join('; ')}` : ''}`);
