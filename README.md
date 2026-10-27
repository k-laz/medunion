# medunion.group

New website for the Medunion clinics, built with [Astro](https://astro.build). Every page is a Markdown file; the build turns them into plain HTML pages that can be hosted anywhere.

## Run it

```bash
npm install
npm run dev      # local preview at http://localhost:4321
npm run build    # production files in dist/
```

Preview builds block search engines and skip analytics. For the real site, build with:

```bash
PUBLIC_SITE_ENV=production npm run build
```

That turns on Metrica, Bitrix24 call tracking and chat, the messenger widget, and opens the site to search engines.

## Where things live

| What | File |
|---|---|
| Phones, addresses, opening hours, integration ids | `src/data/site.ts` |
| Service pages (text, prices, doctors, FAQ) | `src/content/services/**/*.md` |
| Doctor pages | `src/content/doctors/**/*.md` |
| Articles, news, offers | `src/content/articles/**/*.md` |
| Price pages | `src/content/prices/**/*.md` |
| Section and list pages (Врачи, Статьи, Цены) | `src/content/listings/**/*.md` |
| Other pages (company, contacts, patient info) | `src/content/pages/**/*.md` |
| Redirects from old addresses | `deploy/redirects.csv`, `deploy/redirects.nginx.conf` |
| Which fields every page needs | `src/content.config.ts` |
| Page layout (header, footer, SEO tags) | `src/layouts/Base.astro`, `src/components/` |
| Colors and fonts | `src/styles/global.css` |

## Common edits

**Change a price.** Open the service file, find the `prices:` list at the top, change the number, update `pricesCheckedOn`.

**Add a doctor.** Copy an existing file in `src/content/doctors/`, rename it, change the fields. Then add the file name (without `.md`) to the `doctors:` list of each service page they work on. Photos go in `public/doctors/`.

**Add a service page.** Copy an existing file in `src/content/services/`. The `url` field must be the exact old address from the Bitrix site, so Yandex keeps the page's ranking.

If a required field is missing or too long, `npm run build` stops and tells you which file and field.

## Importing content from the old Bitrix site

```bash
npm run import -- --limit 20   # quick test run first
npm run import                 # the whole site, about 10 to 20 minutes
```

The script reads the live site slowly and changes nothing there. It writes:

- `import/pages/` one Markdown file per working page, at the same path as its old URL
- `import/report.csv` every address found, with status and title
- `import/broken.csv` addresses that are dead or redirect (these need redirects on the new site)

Add `--images` to also download the images used inside page content.

The imported files are raw material. Turn them into site pages with:

```bash
npm run convert
```

This sorts every page into `src/content/<kind>/imported/` (services, doctors, prices, articles, listings, pages), cleans up titles and descriptions so none repeat, merges duplicate pages, and writes the redirect list for every old address that no longer has its own page:

- `deploy/redirects.csv` old address, new address
- `deploy/redirects.nginx.conf` the same as nginx 301 rules, to include in the server config

Running it again overwrites everything under `imported/`. Files outside `imported/` (like the hand written gynecology page) are never touched, and a hand written file wins if it uses the same `url`. So once you start editing an imported page by hand, move it out of `imported/` first.

Known gaps after import:

- Price pages only have the first batch of items, because the old site loads the rest with a button. The full price list has to come from the clinic.
- Images and documents (licenses, OMS documents) still load from `https://medunion.group/upload/`. Before the old site is switched off, run this on a computer that can open medunion.group:

  ```bash
  npm run files
  ```

  It saves every file the pages use into `public/upload/` and points the pages at the local copies. Running `npm run convert` again afterwards keeps the local copies.
- The old site has no doctor photos, so there were none to import. Put photos in `public/doctors/` and add `photo: /doctors/name.jpg` to the doctor's file.
- The Kansk subdomain is not imported.

## Preview link

Every push to `main` also publishes a preview at https://k-laz.github.io/medunion/ (GitHub Pages, `.github/workflows/preview.yml`), for showing the site before launch. Search engines are told not to index it and analytics are off. Old-address redirects only work on the real server.

## Putting it online

See [deploy/SERVER.md](deploy/SERVER.md): one-time server setup (nginx on a Russian VPS), then every push to `main` builds and uploads the site automatically through GitHub Actions. The nginx config with https, caching and the old-address redirects is in `deploy/nginx/`.

## Online booking

Every "Записаться" button leads to `/appointment/` (the same address as on the old site). That page embeds the MedFlex booking, which writes appointments into the clinic's МИС.

## Integrations kept from the old site

- **MedFlex** online booking (connected to the clinic's medical system)
- **Bitrix24** CRM: call tracking and the site button (callbacks, chat)
- **Yandex Metrica** counter 108194831
- **daily-grow** messenger widget
- **Top.Mail.Ru** counter 3628693 (VK ads)

The ids are in `src/data/site.ts`.
