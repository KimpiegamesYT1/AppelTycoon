// Begeleide start: stap voor stap de keten leren kennen.
export const TUTORIAL = [
  {
    text: 'Je plukkers vullen de appelbak al. Tik op het bord in de hal en bouw je eerste machine.',
    target: { kind: 'unlock', i: 0 },
    done: (s) => s.lines[0] > 0,
  },
  {
    text: 'Je machine stopt appels in kratjes. De vrachtwagen brengt ze naar de markt: zodra hij vertrekt, verdien je geld.',
    target: { kind: 'sales' },
    done: (s) => s.runEarned >= 6,
  },
  {
    text: 'Tik op je machine en kies Upgrade. Elk level maakt je kratjes meer waard.',
    target: { kind: 'line', i: 0 },
    done: (s) => s.lines[0] >= 5,
  },
  {
    text: 'Zie je de blauwe balk? Op level 10 krijgt je machine een ster en werkt hij twee keer zo snel.',
    target: { kind: 'line', i: 0 },
    done: (s) => s.lines[0] >= 10,
  },
  {
    text: 'Een snellere machine wil meer appels. Upgrade de boomgaard, anders staat hij stil.',
    target: { kind: 'orchard' },
    done: (s) => s.orchard >= 3,
  },
  {
    text: 'Meer kratjes betekent ook meer vervoer. Upgrade de vrachtwagens.',
    target: { kind: 'sales' },
    done: (s) => s.sales >= 3,
  },
  {
    text: 'Dat is het geheim: upgraden voor geld, sterren voor snelheid, en boomgaard en vrachtwagens laten meegroeien. Bij Upgrades vind je flinke bonussen. Volg nu de doelen bovenaan!',
    target: null,
    button: 'Aan de slag',
  },
];

export const tutorialDone = (s) => s.tutorial >= TUTORIAL.length;
