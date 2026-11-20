# Site server API

The site itself is static files. A few things need a server: live schedule
and booking from the clinic's МИС («Ариадна», ООО «Решение») and the review
form. A small program on the same VPS answers on `/api/` (nginx proxies it).
The МИС address, login and password are set in that program's settings on the
server (environment variables). They never go into this repository.

The browser only ever talks to `/api/`, never to the МИС directly.

## GET /api/schedule?doctor=/vrachi/.../

Free appointment slots of one doctor for the next 14 days. `doctor` is the
doctor's page address on the site; the server maps it to the МИС doctor id
(by full name, checked once and stored in its settings).

```json
{
  "days": [
    {
      "date": "2026-11-02",
      "clinic": "kurchatova",
      "slots": [{ "id": "<МИС talon id>", "time": "09:00" }]
    }
  ]
}
```

`clinic` is one of `kurchatova`, `instrumentalnaya`, `kansk`.
No free time: `{ "days": [] }`. Doctor not in the МИС: HTTP 404.

## POST /api/appointments

Books a slot. Body:

```json
{ "doctor": "/vrachi/.../", "slot": "<talon id>", "surname": "", "firstName": "",
  "secondName": "", "birthDate": "1990-01-31", "phone": "+79...", "email": "", "consent": true }
```

Answers `201 { "appointmentId": "...", "dateTime": "..." }`, or `409` when the
slot was taken meanwhile.

## POST /api/reviews

A patient review, for the clinic to check before it is published. Body:

```json
{ "doctor": "/vrachi/.../ or empty", "author": "Имя", "phone": "+79... (not published)",
  "rating": 5, "text": "...", "consent": true, "website": "" }
```

`website` is a hidden field: real people leave it empty, spam bots fill it,
so a filled one is dropped silently. Answers `201`. The server sends the
review to the clinic (Bitrix24 or email). Approved reviews are added to
`src/content/reviews/reviews.json` and appear on the site with the next build.

## Online booking: /api/booking/... (built, deploy/api/server.mjs)

Every answer is `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "текст для посетителя", "code"?: "captcha" | "taken" }`.

| Request | Data |
|---|---|
| GET /api/booking/health | `{ ok, configured }` |
| GET /api/booking/specialties | `[{ id, name }]` |
| GET /api/booking/doctors?spec= | `[{ id, name, free? }]` |
| GET /api/booking/clinics?spec=&doctor= | `[{ id, name }]` |
| GET /api/booking/slots?spec=&doctor=&clinic= | `[{ id, start, end }]`, start like `21.11.2026 09:00` |
| GET /api/booking/find?name= | `[{ specId, specName, doctorId, name }]`, a site doctor's name to МИС ids |
| GET /api/booking/captcha | `{ id, svg }` |
| POST /api/booking/book | body `{ slot, surname, firstName, secondName, birthDate (YYYY-MM-DD), phone, email, captchaId, captchaValue, consent: true }`, data `{ booked: true }` |

Booking: the patient is looked up in the МИС by name and birth date
(/record/patient/info); if not found, created in the patient portal
(/api/patient, needs the captcha); then /record/rnumb/appointment. Five
bookings per visitor per hour, 120 requests per minute.
