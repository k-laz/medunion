// Which service section each article category belongs to. Used for the
// booking card next to an article and for the "Врачи по теме" block.
// Categories without a matching section get a general booking card.
export const articleService: Record<string, string> = {
  'allergologiya-i-pulmonologiya': '/uslugi/centr/allergologiya-immunologiya/',
  ginekologiya: '/uslugi/centr/ginekologiya/',
  kardiologiya: '/uslugi/centr/kardiologiya/',
  khirurgiya: '/uslugi/centr/khirurgiya/',
  'lechebnoe-delo': '/uslugi/centr/terapiya/',
  'luchevaya-diagnostika': '/uslugi/diagnostika/',
  nevrologiya: '/uslugi/centr/nevrologiya/',
  'onkologiya-i-mammologiya': '/uslugi/centr/onkologiya-i-mammologiya/',
  otorinolaringologiya: '/uslugi/centr/lor-otolaringologiya/',
  pediatriya: '/uslugi/pediatriya1/',
  'podgotovki-k-analizam-i-issledovaniyam': '/uslugi/diagnostika/',
  proktologiya: '/uslugi/centr/proktologiya/',
  travmotologiya: '/uslugi/centr/travmatologiya-i-ortopediya/',
  'urologiya-': '/uslugi/centr/urologiya/',
};
