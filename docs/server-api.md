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
