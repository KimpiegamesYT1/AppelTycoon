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
    text: 'Tik op je machine en upgrade hem. Elk level maakt je kratjes meer waard.',
    target: { kind: 'line', i: 0 },
    done: (s) => s.lines[0] >= 5,
  },
  {
    text: 'Op level 10 krijgt je machine een ster: hij wordt twee keer zo snel!',
    target: { kind: 'line', i: 0 },
    done: (s) => s.lines[0] >= 10,
  },
  {
    text: 'Een snellere machine heeft meer appels nodig. Upgrade de boomgaard tot de appelbak weer volloopt.',
    target: { kind: 'orchard' },
    done: (s) => s.orchard >= 3,
  },
  {
    text: 'En meer kratjes betekent: meer vrachtwagenruimte. Upgrade de vrachtwagens.',
    target: { kind: 'sales' },
    done: (s) => s.sales >= 3,
  },
  {
    text: 'Zo werkt het: upgraden voor geld, sterren voor snelheid, en de keten laten meegroeien. In het menu Upgrades vind je flinke bonussen. Volg nu de doelen bovenaan.',
    target: null,
    button: 'Aan de slag',
  },
];

export const tutorialDone = (s) => s.tutorial >= TUTORIAL.length;
