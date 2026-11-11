// Articles worth pointing to from the top of a service page: how to prepare,
// or a short explainer. Keyed by service address; a key also covers the pages
// inside that section. Offers are found automatically from src/data/sales.ts.
export const serviceArticles: Record<string, { url: string; prep?: boolean }[]> = {
  '/uslugi/diagnostika/fgds-fgs-fibrogastroskopiya-zheludka/': [{ url: '/articles/podgotovki-k-analizam-i-issledovaniyam/podgotovka-k-gastroskopii-fgs/', prep: true }],
  '/uslugi/diagnostika/mrt/': [{ url: '/articles/voprosy-vrachu/raznitsa-mezhdu-mrt-i-rentgenom/' }],
  '/uslugi/diagnostika/mrt-1-5-tesla/': [{ url: '/articles/voprosy-vrachu/raznitsa-mezhdu-mrt-i-rentgenom/' }],
  '/uslugi/diagnostika/rentgen/': [{ url: '/articles/voprosy-vrachu/raznitsa-mezhdu-mrt-i-rentgenom/' }],
  '/uslugi/diagnostika/rentgen/rentgen-organov-grudnoy-kletki/': [{ url: '/articles/luchevaya-diagnostika/flyuorografiya-i-rentgen-lyegkikh-v-chyem-raznitsa-i-chto-vybrat/' }],
  '/uslugi/diagnostika/ultrazvukovaya-diagnostika/neyrosonografiya-dlya-detey-/': [{ url: '/articles/pediatriya/neyrosonografiya-detyam-v-medyunion/' }],
  '/uslugi/centr/massazh/': [{ url: '/articles/poleznye-sovety/massazh-i-ego-poleznye-svoystva/' }],
  '/uslugi/pediatriya1/massazh-detyam/': [{ url: '/articles/poleznye-sovety/massazh-i-ego-poleznye-svoystva/' }],
};
