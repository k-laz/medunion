# Price editor (/admin/)

Clinic staff change prices at **https://medunion.group/admin/** (until the
domain switch: https://k-laz.github.io/medunion/admin/). Each save is a commit
to `main`; the deploy workflow rebuilds the site and the new price is live in
1 to 2 minutes, on every page that shows that service.

## How it works

- All prices live in `src/data/prices/*.yml`, one file per `/ceny/` section.
  Service and doctor pages only name their prices; the number shown always
  comes from these files (`src/lib/prices.ts`).
- An item listed in two sections (e.g. ЭКГ in Функциональная диагностика and
  Кардиология) is stored once; the other section lists its id under `also`.
- Deleting a row in the editor removes that price from every page.
- A row with no name, or a price that is not a positive number, stops the
  build with a message in Russian; the live site keeps the previous version
  and GitHub e-mails the repository owner about the failed run.
- The editor is Sveltia CMS, kept in `public/admin/` with its translations and
  fonts (no outside CDN). Update it with `bash scripts/update-admin.sh <version>`.
  Settings: `public/admin/config.yml`. Editable: the price list and the home page banners.

## Access (owner)

Sign-in is with a GitHub access token; there is no password of our own.

1. GitHub, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token.
2. Name: `Медюнион цены`. Expiration: 1 year (put a reminder in the calendar).
3. Repository access: **Only select repositories**, `k-laz/medunion`.
4. Permissions, Repository permissions: **Contents: Read and write**. Nothing else.
5. Give the token to the person at the clinic in person or through a password
   manager, not by plain e-mail or chat. Treat it like a password.

To cut access: delete the token on the same GitHub page and make a new one.
Every change is in the repository history (commit message «Цены: изменён раздел …»),
and any change can be undone by reverting that commit.

## Инструкция для клиники

1. Откройте **medunion.group/admin/** в Chrome, Яндекс Браузере или Edge.
2. В первый раз нажмите **«Войти с помощью токена доступа»** и вставьте токен,
   который вам передали. Браузер запомнит вход.
3. Слева выберите **«Цены»**, затем раздел (например, «Рентген»).
4. Найдите услугу в списке и нажмите на неё. Измените цену (только число, без «₽» и пробелов).
5. Нажмите **«Сохранить»** вверху справа.
6. Через 1–2 минуты новая цена появится на сайте: в прайсе, на странице услуги и на странице врача.

Чтобы добавить услугу, нажмите «Добавить услугу» внизу раздела. Чтобы убрать
услугу с сайта, удалите строку. Если новая цена не появилась через 5 минут,
сообщите Кириллу.

## Баннеры на главной

Раздел «Баннеры на главной» в /admin/. Баннеры стоят под первым экраном главной
страницы; если их несколько, посетитель листает их стрелками, сами они не крутятся.

**Баннер с картинкой** (как делает маркетинг):

1. «Новый баннер».
2. «Картинка для компьютера»: около 1920 × 640 пикселей, JPG или PNG.
3. «Картинка для телефона»: около 1080 × 1080. Без неё на телефоне покажется
   широкая картинка, и мелкий текст на ней будет не прочитать.
4. «Текст с картинки»: что на ней написано. Обязательно.
5. «Ссылка»: куда ведёт баннер.
6. Даты «Показывать с» и «Показывать до», порядок, «Сохранить».

**Текстовый баннер** (без картинки): заголовок, текст, надпись на кнопке и
ссылка; «Крупная надпись слева» по желанию («15 лет», «−20%»).

Сайт пересобирается каждую ночь в 03:00 по Красноярску, поэтому баннер
появится утром в день «Показывать с» и пропадёт после дня «Показывать до».
Чтобы убрать баннер сразу, снимите «Показывать» и сохраните.
