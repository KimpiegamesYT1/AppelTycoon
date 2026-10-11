// Begeleide start: stap voor stap de keten leren kennen.
export const TUTORIAL = [
  {
    text: 'Je plukkers verzamelen appels in de appelbak. Bouw je eerste machine om er iets van te maken.',
    target: { kind: 'unlock', i: 0 },
    done: (s) => s.lines[0] > 0,
  },
  {
    text: 'De machine pakt de appels in kratjes. Die gaan naar het magazijn, en de vrachtwagen brengt ze naar de markt. Zo verdien je geld.',
    target: { kind: 'sales' },
    done: (s) => s.runEarned >= 6,
  },
  {
    text: 'Upgrade je machine zodat hij sneller werkt. Tik erop en kies Upgrade.',
    target: { kind: 'line', i: 0 },
    done: (s) => s.lines[0] >= 3,
  },
  {
    text: 'Je machine kan nu meer aan dan de boomgaard plukt. Upgrade de boomgaard.',
    target: { kind: 'orchard' },
    done: (s) => s.orchard >= 3,
  },
  {
    text: 'Kunnen de vrachtwagens het niet bijhouden, dan loopt het magazijn vol en staat alles stil. Upgrade de vrachtwagens.',
    target: { kind: 'sales' },
    done: (s) => s.sales >= 2,
  },
  {
    text: 'Houd de keten in balans: boomgaard, machines en vrachtwagens. Een volle appelbak of een vol magazijn betekent: upgraden! Volg nu de doelen bovenaan.',
    target: null,
    button: 'Aan de slag',
  },
];

export const tutorialDone = (s) => s.tutorial >= TUTORIAL.length;
