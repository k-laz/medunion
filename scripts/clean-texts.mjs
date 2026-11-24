// Kept for reference: the one-off cleanup of conversion leftovers in service texts (Nov 2026).
// Cleans conversion leftovers in service texts (markdown bodies + description/teaser).
// node clean-services.mjs <dir>...   prints a per-rule count; --dry to not write
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dirs = args.filter((a) => a !== '--dry');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []; });
const count = {}; const hit = (k, n = 1) => (count[k] = (count[k] || 0) + n);
const isList = (l) => /^\s*([-*+]|\d+[.)])\s/.test(l);
const isHeading = (l) => /^#{1,6}\s/.test(l);
const isRaw = (l) => /^\s*(<|\|)/.test(l);

function fixBold(line) {
  if (!line.includes('**') || isRaw(line)) return line;
  const parts = line.split('**');
  if (parts.length % 2 === 0) return line; // unbalanced: leave
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    const inner = parts[i]; let after = parts[i + 1];
    if (!inner.trim()) { hit('empty bold removed'); out += (inner.length ? ' ' : '') + after; continue; }
    const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
    if (lead || trail) hit('bold with spaces inside');
    if (lead && !/\s$/.test(out) && out) out += ' ';
    out += `**${inner.trim()}**`;
    if (trail && after && !/^[\s,.;:!?)]/.test(after)) after = ' ' + after;
    out += after;
  }
  return out;
}

function cleanBody(body) {
  let lines = body.split('\n');
  // escaped dash at line start = a list item
  lines = lines.map((l) => (/^\\-\s*\S/.test(l) ? (hit('\\- lines to list items'), l.replace(/^\\-\s*/, '- ')) : l));
  // trailing backslash (a line break marker) where it can't work and shows as "\"
  lines = lines.map((l, i) => {
    if (!/\\$/.test(l) || isRaw(l)) return l;
    const next = lines[i + 1] ?? '';
    if (!next.trim() || isList(next) || isHeading(next) || isList(l)) { hit('visible \\ removed'); return l.replace(/\s*\\$/, ''); }
    return l;
  });
  // a list straight after a paragraph line: blank line between
  const out = [];
  for (const [i, l] of lines.entries()) {
    const prev = out[out.length - 1];
    if (isList(l) && prev !== undefined && prev.trim() && !isList(prev) && !/^\s/.test(prev) && !isRaw(prev) && !isHeading(prev)) { out.push(''); hit('blank line before list'); }
    out.push(l);
  }
  lines = out;
  lines = lines.map((l) => {
    if (isRaw(l) || /^!\[/.test(l)) return l;
    let s = l;
    // two paragraphs glued: "...крови.**ЦДК** ..." -> new paragraph
    // (only where that ** opens a bold part: an even number of ** before it)
    s = s.replace(/([а-яё)»][.!?])\*\*(?=[А-ЯЁA-Z])/g, (m, a, off, str) => {
      if ((str.slice(0, off).match(/\*\*/g) || []).length % 2) return m;
      hit('glued paragraphs split');
      return `${a}\n\n**`;
    });
    // "крови.Метод" -> "крови. Метод" (not abbreviations: needs 2 lowercase letters before)
    s = s.replace(/([а-яё]{2}[.!?;:,])([А-ЯЁ][а-яё])/g, (m, a, b) => (hit('missing space after punctuation'), `${a} ${b}`));
    // runs of spaces inside text
    s = s.replace(/(\S)[ \t]{2,}(?=\S)/g, (m, a) => (hit('double spaces'), `${a} `));
    // space before punctuation
    s = s.replace(/([а-яёА-ЯЁa-zA-Z0-9)»])\s+([,.;:!?])(?=\s|$)/g, (m, a, b) => (hit('space before punctuation'), `${a}${b}`));
    s = s.split('\n').map(fixBold).join('\n');
    return s.replace(/[ \t]+$/, '');
  });
  let b = lines.join('\n');
  // short bold-only paragraph that introduces what follows -> a subheading
  b = b.replace(/(^|\n\n)\*\*([^*\n]{3,80}?)\*\*:?(?=\n\n|\n[-*] |\s*$)/g, (m, pre, t) => {
    if (/[.!?]$/.test(t.trim()) || /\d/.test(t)) return m; // a sentence or a phone: keep as bold text
    hit('bold line to subheading');
    return `${pre}### ${t.trim().replace(/:$/, '')}`;
  });
  b = b.replace(/\n{3,}/g, '\n\n');
  // known typos
  b = b.replace(/уха\s*,\s*горда/g, () => (hit('typo уха, горла'), 'уха, горла'));
  return b;
}

const cleanLine = (s) => s.replace(/\\\\/g, ' ').replace(/\s*[•·●▪]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
let changed = 0;
for (const f of dirs.flatMap(walk)) {
  const t = readFileSync(f, 'utf8');
  const m = t.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (!m) continue;
  let [, fm, body] = m;
  fm = fm.replace(/^(description|teaser): "(.*)"$/gm, (all, k, v) => {
    const c = cleanLine(v);
    if (c !== v) hit(`${k} cleaned`);
    return `${k}: "${c}"`;
  });
  const nb = cleanBody(body);
  const nt = fm + nb;
  if (nt !== t) { changed++; if (!dry) writeFileSync(f, nt); }
}
console.log(`files changed: ${changed}${dry ? ' (dry run)' : ''}`);
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
