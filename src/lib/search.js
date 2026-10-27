// Site search: matching on the visitor's device against /search.json.
// Plain JavaScript so it runs both in the browser and in the test script.
//
// Russian words change their endings ("поясница", "поясницы", "пояснично"),
// so each query word is cut to a stem and matched against the beginning of
// words in the page title, type and description. A few everyday words are
// mapped to the medical words used on the site ("спина" -> "позвоночник").

/** @param {string} s */
export const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

/** @param {string} s */
const words = (s) => norm(s).split(/[^а-яa-z0-9]+/).filter(Boolean);

/** "поясницы" -> "поясн", "почек" -> "поч", "мрт" -> "мрт" @param {string} w */
export function stem(w) {
  if (w.length <= 3) return w;
  if (w.length <= 5) return w.slice(0, 3);
  return w.slice(0, Math.max(4, w.length - 3));
}

// everyday word stem -> extra stems that also count as a match
const SYNONYMS = {
  поясниц: ['пояснич', 'поясн'],
  пояснич: ['поясниц'],
  спин: ['позвоноч', 'спин'],
  позвоноч: ['спин'],
  шея: ['шейн', 'шеи'], шеи: ['шейн', 'шея'], шее: ['шейн'],
  живот: ['брюшн'],
  сердц: ['кардио', 'эхо', 'экг'],
  сердце: ['кардио', 'эхо', 'экг'],
  давле: ['кардио', 'терап'],
  ухо: ['лор', 'оторин'], уха: ['лор', 'оторин'], уши: ['лор', 'оторин'], ушей: ['лор', 'оторин'],
  горл: ['лор', 'оторин'], нос: ['лор', 'оторин', 'пазух'], носа: ['лор', 'оторин', 'пазух'],
  лор: ['оторин'],
  анализ: ['лаборат'], кров: ['лаборат', 'анализ'],
  берем: ['гинек', 'берем'],
  дет: ['педиат', 'детск'], ребе: ['педиат', 'детск'], реб: ['педиат', 'детск'],
  колен: ['колен'], сустав: ['сустав'],
  головн: ['голов'], голов: ['головн'],
  мрт: ['мрт', 'магнитн'], кт: ['кт', 'мскт', 'компьют'],
  узи: ['узи', 'ультразв'],
  фгс: ['фгс', 'фгдс', 'гастроск'], гастроскоп: ['фгс', 'фгдс'],
};

/** All stems that count as a match for one query word. @param {string} w */
function alternatives(w) {
  const s = stem(w);
  const extra = SYNONYMS[w] || SYNONYMS[s] || SYNONYMS[w.slice(0, 5)] || SYNONYMS[w.slice(0, 4)] || [];
  return [s, ...extra];
}

/**
 * @param {{t: string, u: string, k: string, d?: string}[]} items
 * @param {string} query
 * @param {number} limit
 */
export function search(items, query, limit = 8) {
  const q = words(query);
  if (!q.length || norm(query).trim().length < 2) return [];
  const alts = q.map(alternatives);
  const scored = [];
  for (const item of items) {
    const fields = [words(item.t), words(item.k), words(item.d || '')];
    let score = 0;
    let all = true;
    for (const a of alts) {
      const hit = (ws) => ws.some((w) => a.some((s) => w.startsWith(s)));
      const best = hit(fields[0]) ? 3 : hit(fields[1]) ? 2 : hit(fields[2]) ? 1 : 0;
      if (!best) { all = false; break; }
      score += best;
    }
    if (!all) continue;
    if (norm(item.t).startsWith(q[0])) score += 2;
    if (item.k === 'Цены') score -= 0.5; // the service page first, its price page after
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.t.length - b.item.t.length);
  return scored.slice(0, limit).map((x) => x.item);
}
