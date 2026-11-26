// Medunion booking API: the site's online booking talks to this small program,
// and it talks to the clinic's МИС «Ариадна» («API Личный кабинет»). It runs on
// the Yandex server next to the site; nginx sends /api/ to it (127.0.0.1:8787).
//
// The МИС address and token live only in /etc/medunion-api.env on the server
// (MIS_BASE_URL, MIS_API_TOKEN), never in this repository or the browser.
// Patient data passes through to the МИС and is not stored or logged here.
//
//   node server.mjs           run (systemd: medunion-api.service)
//   node server.mjs --check   ask the МИС for specialties, doctors, clinics and
//                             slots and print what came back (no patient data)
//
// Same flow as the old site's form (Conversite ApiMIS.php): specialty, doctor,
// clinic, slot; then find the patient by name and birth date, create them in
// the patient portal if not found (that needs the МИС captcha), and book.
// Needs Node 18 or newer, no packages.
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const BASE = (process.env.MIS_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.MIS_API_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
// How the МИС wants a birth date: 'iso' = 1990-12-31 (what it takes), 'ru' = 31.12.1990
const BIRTH_FORMAT = process.env.MIS_BIRTHDATE_FORMAT === 'ru' ? 'ru' : 'iso'; // the МИС takes iso (checked 25.11.2026)
const DAYS_AHEAD = Number(process.env.BOOKING_DAYS || 31);

// ---------------------------------------------------------------- МИС calls

async function mis(method, path, { query, body, headers = {} } = {}) {
  if (!BASE || !TOKEN) throw new Problem(503, 'Онлайн-запись не настроена.');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'api-token': TOKEN, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    log(`${method} ${path} failed: ${e.name}`);
    throw new Problem(502, 'Система записи клиники не отвечает.');
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  log(`${method} ${path} ${res.status} ${Date.now() - started}ms`);
  return { status: res.status, json, text };
}

/** The "data" of a successful answer: an array or object, or null when empty. */
const dataOf = (r) => {
  if (r.status !== 200) throw new Problem(502, 'Система записи клиники ответила ошибкой.', r.status);
  const d = r.json?.data;
  return Array.isArray(d) ? (d.length ? d : null) : d ?? null;
};

const iso = (d) => d.toISOString().slice(0, 10);
const range = () => {
  const now = new Date();
  return [iso(now), iso(new Date(now.getTime() + DAYS_AHEAD * 86400000))];
};

// Field names differ between МИС versions; take the first one that is there.
const pick = (o, ...keys) => {
  const lower = Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
};
const personName = (o) =>
  String(
    pick(o, 'docname', 'doc_name', 'fio', 'name', 'text') ??
      [pick(o, 'l_name', 'lastname', 'surname', 'family'), pick(o, 'f_name', 'firstname', 'name1'), pick(o, 's_name', 'secondname', 'middlename', 'patronymic')].filter(Boolean).join(' '),
  ).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the booking steps

const cache = new Map();
// Answers kept for a while. A stale answer is still served while a fresh one is
// fetched in the background, and only one fetch per key runs at a time.
function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit?.has && hit.until > Date.now()) return Promise.resolve(hit.value);
  if (!hit?.pending) {
    const pending = Promise.resolve().then(fn).then(
      (value) => { cache.set(key, { value, has: true, until: Date.now() + ms }); return value; },
      (e) => { const h = cache.get(key); if (h) delete h.pending; if (!h?.has) cache.delete(key); throw e; },
    );
    pending.catch(() => {});
    cache.set(key, { ...(hit || {}), pending });
  }
  const now = cache.get(key);
  return now.has ? Promise.resolve(now.value) : now.pending;
}

async function specialties() {
  return cached('specs', 10 * 60000, async () => {
    const [, end] = range();
    const list = dataOf(await mis('GET', '/record/spec/list', { query: { beginDate: '2015-01-01', endDate: end } })) || [];
    return list
      .map((s) => ({ id: String(pick(s, 'keyid', 'specid', 'id')), name: String(pick(s, 'text', 'name', 'specname') ?? '').trim() }))
      // staff roles in the МИС list that patients don't book
      .filter((s) => s.id && s.name && !/администратор|регистратур|кассир/i.test(s.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });
}

async function doctors(spec) {
  return cached(`docs:${spec}`, 5 * 60000, async () => {
    const [, end] = range();
    const list = dataOf(await mis('GET', '/record/doc/list', { query: { beginDate: '2015-01-01', endDate: end, specID: spec } })) || [];
    return list
      .map((d) => ({ id: String(pick(d, 'doctorid', 'docid', 'keyid', 'id')), name: personName(d), free: Number(pick(d, 'rcount') ?? NaN) }))
      .filter((d) => d.id && d.name)
      .map((d) => (Number.isFinite(d.free) ? d : { id: d.id, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });
}

async function clinics(spec, doctor) {
  return cached(`deps:${spec}:${doctor}`, 5 * 60000, async () => {
    const list = dataOf(await mis('GET', '/record/dep/list', { query: { doctorID: doctor, specID: spec } })) || [];
    return list
      .map((c) => ({ id: String(pick(c, 'depid', 'dep_id', 'keyid', 'id')), name: String(pick(c, 'depname', 'dep_name', 'text', 'name') ?? '').trim() }))
      .filter((c) => c.id && c.name);
  });
}

async function slots(spec, doctor, clinic) {
  const [start, end] = range();
  const list = dataOf(await mis('GET', '/record/rnumb/list', { query: { doctorID: doctor, specID: spec, beginDate: start, endDate: end } })) || [];
  return list
    .filter((t) => !clinic || String(pick(t, 'depid', 'dep_id')) === String(clinic))
    .map((t) => ({ id: String(pick(t, 'rnumbid', 'keyid', 'id')), start: String(pick(t, 'dat_begin_str', 'dat_begin', 'begin') ?? ''), end: String(pick(t, 'dat_end_str', 'dat_end', 'end') ?? ''), clinic: String(pick(t, 'depid', 'dep_id') ?? '') }))
    .filter((t) => t.id && t.start)
    .sort((a, b) => toTime(a.start) - toTime(b.start));
}
// "31.12.2026 09:30" or "2026-12-31 09:30" -> ms
function toTime(s) {
  const ru = s.match(/(\d{2})\.(\d{2})\.(\d{4})\D+(\d{1,2}):(\d{2})/);
  if (ru) return Date.UTC(+ru[3], +ru[2] - 1, +ru[1], +ru[4], +ru[5]);
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? Infinity : t;
}

/** Doctors whose name matches (for «Записаться» on a doctor's page): every specialty they see in. */
/** Every doctor (or room) of every specialty, as one list. Kept warm in the background. */
async function everyone() {
  return cached('alldocs', 10 * 60000, async () => {
    const out = [];
    const specs = await specialties();
    for (let i = 0; i < specs.length; i += 5) {
      const part = specs.slice(i, i + 5);
      const lists = await Promise.all(part.map((s) => doctors(s.id).catch(() => [])));
      part.forEach((s, n) => lists[n].forEach((d) => out.push({ specId: s.id, specName: s.name, doctorId: d.id, name: d.name })));
    }
    return out;
  });
}

/** The booking page's list: each doctor once, with the specialties they can be booked for. */
async function allDoctors() {
  const byId = new Map();
  for (const d of await everyone()) {
    const e = byId.get(d.doctorId) || { id: d.doctorId, name: d.name, specs: [] };
    if (!e.specs.some((x) => x.id === d.specId)) e.specs.push({ id: d.specId, name: d.specName });
    byId.set(d.doctorId, e);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** «Любой врач»: the free time of every doctor of a specialty, with who and where. */
async function nearest(spec) {
  return cached(`nearest:${spec}`, 2 * 60000, async () => {
    const docs = await doctors(spec);
    const out = [];
    for (let i = 0; i < docs.length; i += 4) {
      const part = docs.slice(i, i + 4);
      const got = await Promise.all(part.map(async (d) => {
        const [deps, free] = await Promise.all([clinics(spec, d.id).catch(() => []), slots(spec, d.id, '').catch(() => [])]);
        const depName = Object.fromEntries(deps.map((c) => [c.id, c.name]));
        return free.filter((t) => depName[t.clinic]).map((t) => ({ ...t, doctor: d.id, doctorName: d.name, clinicName: depName[t.clinic] }));
      }));
      got.forEach((g) => out.push(...g));
    }
    return out.sort((a, b) => toTime(a.start) - toTime(b.start));
  });
}

/** Doctors whose name matches (for «Записаться» on a doctor's page): every specialty they see in. */
async function findDoctor(name) {
  const want = norm(name).split(' ').filter(Boolean);
  if (!want.length) return [];
  return (await everyone()).filter((d) => {
    const have = norm(d.name).split(' ');
    return have[0] === want[0] && (!want[1] || !have[1] || have[1][0] === want[1][0]);
  });
}
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

async function captcha() {
  const d = dataOf(await mis('GET', '/api/captcha/create'));
  if (!d?.svg) throw new Problem(502, 'Не удалось получить проверочный код.');
  return { id: String(d.id), svg: String(d.svg) };
}

/** Why the МИС refused, for the log: its own message, with the patient's details blanked out. */
function misReason(r, p) {
  const j = r.json;
  let msg = j ? (j.error ?? j.message ?? j.errors ?? (typeof j.data === 'string' ? j.data : undefined) ?? j) : r.text;
  msg = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const v of [p.surname, p.firstName, p.secondName, p.email, p.phone].filter((x) => x && x.length > 1)) msg = msg.split(v).join('***');
  return msg.replace(/\d{4,}|\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/g, '***').slice(0, 300);
}

async function book(p) {
  const birth = BIRTH_FORMAT === 'iso' ? p.birthDate : p.birthDate.split('-').reverse().join('.');
  // 1. the patient: found by name and birth date, or created in the patient portal
  const found = await mis('POST', '/record/patient/info', { body: { surname: p.surname, firstName: p.firstName, secondName: p.secondName, birthDate: birth } });
  if (found.status !== 200) {
    log(`booking: patient search refused (${found.status}): ${misReason(found, p)}`);
    throw new Problem(502, 'Система записи клиники ответила ошибкой.', found.status);
  }
  let patient = found.json?.data?.keyid;
  log(`booking: patient ${patient && patient !== 'Пациент не найден' ? 'found' : 'not found, creating'}`);
  if (!patient || patient === 'Пациент не найден') {
    const created = await mis('POST', '/api/patient', {
      body: { lastName: p.surname, firstName: p.firstName, secondName: p.secondName, birthDate: birth, email: p.email, phone: p.phone, captchaId: p.captchaId, captchaValue: p.captchaValue },
      headers: { sessiontoken: randomBytes(16).toString('hex') },
    });
    if (created.status !== 200 || !created.json?.success || !created.json?.data?.id) {
      log(`booking: new patient refused (${created.status}): ${misReason(created, p)}`);
      const msg = String(created.json?.error ?? created.json?.message ?? '');
      if (/captcha|капч|код/i.test(msg)) throw new Problem(400, 'Неверный проверочный код. Введите новый.', 'captcha');
      throw new Problem(502, 'Не получилось зарегистрировать вас в системе записи.', created.status);
    }
    patient = created.json.data.id;
  }
  // 2. the appointment
  const r = await mis('GET', '/record/rnumb/appointment', { query: { rnumbID: p.slot }, headers: { patientid: String(patient) } });
  if (r.status === 200 && r.json?.success) { log('booking: done'); return { booked: true }; }
  log(`booking: appointment refused (${r.status}): ${misReason(r, p)}`);
  const msg = String(r.json?.error ?? r.json?.message ?? '');
  if (/занят|busy|недоступ/i.test(msg)) throw new Problem(409, 'Это время уже заняли. Выберите другое.', 'taken');
  throw new Problem(502, 'Не получилось записать на это время.', r.status);
}

// ---------------------------------------------------------------- checks of what people send

const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '').slice(0, max);
function bookingInput(b) {
  const p = {
    slot: text(b.slot, 40),
    surname: text(b.surname, 60), firstName: text(b.firstName, 60), secondName: text(b.secondName, 60),
    birthDate: text(b.birthDate, 10), phone: text(b.phone, 30).replace(/[^\d+]/g, ''), email: text(b.email, 120),
    captchaId: text(b.captchaId, 100), captchaValue: text(b.captchaValue, 20),
  };
  const nameOk = (s) => /^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z' -]*$/.test(s);
  if (!/^\d+$/.test(p.slot)) throw new Problem(400, 'Выберите время приёма.');
  if (!nameOk(p.surname) || !nameOk(p.firstName)) throw new Problem(400, 'Укажите фамилию и имя.');
  // The МИС refuses an empty отчество; people without one send «-»
  if (!p.secondName) throw new Problem(400, 'Укажите отчество или отметьте «Нет отчества».');
  if (p.secondName !== '-' && !nameOk(p.secondName)) throw new Problem(400, 'Проверьте отчество.');
  const bd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.birthDate);
  const age = bd ? (Date.now() - Date.UTC(+bd[1], +bd[2] - 1, +bd[3])) / 31557600000 : -1;
  if (!(age > 0 && age < 120)) throw new Problem(400, 'Проверьте дату рождения.');
  if (!/^\+?\d{10,12}$/.test(p.phone)) throw new Problem(400, 'Проверьте номер телефона.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Problem(400, 'Проверьте электронную почту.');
  if (!p.captchaId || !p.captchaValue) throw new Problem(400, 'Введите проверочный код.');
  if (b.consent !== true) throw new Problem(400, 'Нужно согласие на обработку персональных данных.');
  return p;
}
const idParam = (u, k) => {
  const v = u.searchParams.get(k) || '';
  if (!/^[\w-]{1,40}$/.test(v)) throw new Problem(400, `Нет параметра ${k}.`);
  return v;
};

// ---------------------------------------------------------------- limits per visitor

const hits = new Map();
function limit(ip, kind, max, perMs) {
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => t > now - perMs);
  if (list.length >= max) throw new Problem(429, 'Слишком много запросов. Попробуйте через несколько минут.');
  list.push(now);
  hits.set(key, list);
}
setInterval(() => { const old = Date.now() - 3600000; for (const [k, v] of hits) if (!v.some((t) => t > old)) hits.delete(k); }, 600000).unref();

// ---------------------------------------------------------------- HTTP

class Problem extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const log = (s) => console.log(`${new Date().toISOString()} ${s}`);

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 16384) throw new Problem(413, 'Слишком большой запрос.');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new Problem(400, 'Некорректный запрос.'); }
}

const routes = {
  'GET /api/booking/health': async () => ({ ok: true, configured: Boolean(BASE && TOKEN) }),
  'GET /api/booking/specialties': async () => specialties(),
  'GET /api/booking/doctors': async (u) => doctors(idParam(u, 'spec')),
  'GET /api/booking/clinics': async (u) => clinics(idParam(u, 'spec'), idParam(u, 'doctor')),
  'GET /api/booking/slots': async (u) => slots(idParam(u, 'spec'), idParam(u, 'doctor'), u.searchParams.get('clinic') ? idParam(u, 'clinic') : ''),
  'GET /api/booking/find': async (u) => findDoctor(text(u.searchParams.get('name') || '', 80)),
  'GET /api/booking/all': async () => allDoctors(),
  'GET /api/booking/nearest': async (u) => nearest(idParam(u, 'spec')),
  'GET /api/booking/captcha': async () => captcha(),
  'POST /api/booking/book': async (u, req, ip) => {
    limit(ip, 'book', 5, 3600000);
    return book(bookingInput(await readJson(req)));
  },
};

const server = http.createServer(async (req, res) => {
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
  const u = new URL(req.url || '/', 'http://localhost');
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  try {
    const route = routes[`${req.method} ${u.pathname.replace(/\/+$/, '')}`];
    if (!route) throw new Problem(404, 'Нет такого адреса.');
    limit(ip, 'all', 120, 60000);
    send(200, { ok: true, data: await route(u, req, ip) });
  } catch (e) {
    const status = e instanceof Problem ? e.status : 500;
    if (!(e instanceof Problem)) log(`error: ${e?.stack || e}`);
    send(status, { ok: false, error: e instanceof Problem ? e.message : 'Внутренняя ошибка.', code: e?.code && typeof e.code === 'string' ? e.code : undefined });
  }
});

// ---------------------------------------------------------------- --check

if (process.argv.includes('--check')) {
  const keys = (r) => (Array.isArray(r.json?.data) ? Object.keys(r.json.data[0] || {}) : Object.keys(r.json?.data || r.json || {}));
  try {
    console.log(`МИС address ${BASE ? 'set' : 'NOT SET'}, token ${TOKEN ? 'set' : 'NOT SET'}, birth dates as ${BIRTH_FORMAT}`);
    const [, end] = range();
    const s = await mis('GET', '/record/spec/list', { query: { beginDate: '2015-01-01', endDate: end } });
    console.log(`specialties: HTTP ${s.status}, fields: ${keys(s).join(', ')}`);
    const specs = await specialties();
    console.log(`  ${specs.length} specialties, e.g. ${specs.slice(0, 5).map((x) => x.name).join('; ')}`);
    const spec = specs.find((x) => /терап|невр|гинек/i.test(x.name)) || specs[0];
    if (!spec) { console.log('Check stopped: no specialties.'); process.exit(1); }
    const d = await mis('GET', '/record/doc/list', { query: { beginDate: '2015-01-01', endDate: end, specID: spec.id } });
    console.log(`doctors of «${spec.name}»: HTTP ${d.status}, fields: ${keys(d).join(', ')}`);
    const docs = await doctors(spec.id);
    console.log(`  ${docs.length} doctors, e.g. ${docs.slice(0, 3).map((x) => x.name).join('; ')}`);
    const doc = docs[0];
    if (!doc) { console.log('Check stopped: no doctors read from that list.'); process.exit(1); }
    const c = await mis('GET', '/record/dep/list', { query: { doctorID: doc.id, specID: spec.id } });
    console.log(`clinics of ${doc.name}: HTTP ${c.status}, fields: ${keys(c).join(', ')}`);
    const deps = await clinics(spec.id, doc.id);
    console.log(`  ${deps.map((x) => x.name).join('; ')}`);
    const t = await mis('GET', '/record/rnumb/list', { query: { doctorID: doc.id, specID: spec.id, beginDate: range()[0], endDate: end } });
    console.log(`slots: HTTP ${t.status}, fields: ${keys(t).join(', ')}`);
    const free = await slots(spec.id, doc.id, deps[0]?.id || '');
    console.log(`  ${free.length} free in ${deps[0]?.name || 'all clinics'}, first: ${free.slice(0, 3).map((x) => x.start).join('; ')}`);
    const cap = await captcha();
    console.log(`captcha: ${cap.svg.startsWith('<svg') ? 'ok' : 'unexpected'}`);
    // Which birth date format the МИС takes: look up a made-up patient both ways
    // (a search only; nobody is created). The right format answers «Пациент не найден».
    // ...and whether it takes an empty отчество (the old form always required one)
    for (const [fmt, bd] of [['ru', '01.01.1901'], ['iso', '1901-01-01']]) {
      for (const second of ['Тестович', '', '-']) {
        const r = await mis('POST', '/record/patient/info', { body: { surname: 'Проверкасайта', firstName: 'Тест', secondName: second, birthDate: bd } });
        const answer = r.json?.data?.keyid ?? r.json?.error ?? r.json?.message ?? r.json ?? r.text;
        console.log(`patient search, birth date as ${fmt}, отчество ${second === '-' ? '"-"' : second ? 'filled' : 'empty'}: HTTP ${r.status}, answer: ${(typeof answer === 'string' ? answer : JSON.stringify(answer)).slice(0, 120)}`);
      }
    }
    console.log('Check done. Nothing was booked.');
    process.exit(0);
  } catch (e) {
    console.log(`Check failed: ${e.message}${e.code ? ` (${e.code})` : ''}`);
    process.exit(1);
  }
} else {
  server.listen(PORT, HOST, () => log(`medunion-api on ${HOST}:${PORT}, МИС ${BASE && TOKEN ? 'configured' : 'NOT configured'}`));
  // The doctors list takes a few dozen МИС requests: build it now and keep it fresh,
  // so visitors never wait for it
  if (BASE && TOKEN) {
    const warm = () => everyone().catch((e) => log(`warm-up failed: ${e.message}`));
    warm();
    setInterval(warm, 5 * 60000).unref();
  }
}
