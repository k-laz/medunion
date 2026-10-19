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
| Doctor pages | `src/content/doctors/*.md` |
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

The imported files are raw material. They get sorted into `src/content/` (services, doctors, prices, articles) in a separate step.

## Integrations kept from the old site

- **MedFlex** online booking (connected to the clinic's medical system)
- **Bitrix24** CRM: call tracking and the site button (callbacks, chat)
- **Yandex Metrica** counter 108194831
- **daily-grow** messenger widget

The ids are in `src/data/site.ts`.
