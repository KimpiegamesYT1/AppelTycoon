// Alle balans-getallen van het spel staan hier bij elkaar.
// tools/balance-sim.mjs gebruikt dezelfde waarden om de progressie te testen.

// Sterren: op deze levels krijgt een station een ster met een flinke beloning (x2).
// Net als in Eatventure vult een balk zich naar de volgende ster.
export const STARS = [10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000];

// De keten: boomgaard -> appelbak -> productielijnen -> magazijn -> vrachtwagens -> geld.
// Is de appelbak vol, dan stoppen de plukkers. Is het magazijn vol, dan lopen de lijnen vast.

export const ORCHARD = {
  name: 'Boomgaard',
  baseRate: 1.5,      // appels per seconde op level 1
  levelGrowth: 1.25,  // elk level +25% appels
  baseCost: 60,
  growth: 2.6,
  binSeconds: 20,     // de appelbak houdt 20 seconden pluk vast
  binMin: 15,
};

export const SALES = {
  name: 'Vrachtwagens',
  baseRate: 1.5,      // kratten per seconde per vrachtwagen op level 1
  levelGrowth: 1.25,  // elk level +25% lading; op DOCK_LEVELS een extra vrachtwagen
  baseCost: 100,
  growth: 2.6,
  storeSeconds: 30,   // het magazijn houdt 30 seconden transport vast
  storeMin: 20,
};

// Een vrachtwagen laadt aan de deur (loadTime seconden), vertrekt en wordt dan pas verkocht.
// Na cycle seconden staat hij weer aan de deur.
export const TRUCK = { loadTime: 4, cycle: 20 };

// Op deze levels krijgt het magazijn een extra laadplek met een extra vrachtwagen.
export const DOCK_LEVELS = [10, 20, 30, 40, 50];

// Op deze levels komt er een plukker bij in de boomgaard (alleen te zien, geen extra productie).
export const PICKER_LEVELS = [3, 6, 10, 15, 20, 25, 30, 35, 40, 50, 60];

// Productielijnen. Elk level verhoogt de prijs per stuk (value x level). Sterren verdubbelen
// om en om de snelheid en de prijs. value = prijs op level 1, apples = appels per stuk,
// rate = stuks per seconde, cost = prijs eerste upgrade, unlock = prijs om de lijn te bouwen.
export const LINES = [
  { id: 'fresh', name: 'Verse Appels',  machine: 'Sorteer- & inpakstation', value: 1,      apples: 1,  rate: 1.0,  cost: 8,      unlock: 1e1,    color: 0xe8423f },
  { id: 'juice', name: 'Appelsap',      machine: 'Sappers',                 value: 50,     apples: 2,  rate: 0.5,  cost: 375,    unlock: 7.5e2,    color: 0xf2c14e },
  { id: 'sauce', name: 'Appelmoes',     machine: 'Kookketel',               value: 2.5e3,  apples: 3,  rate: 0.4,  cost: 2e4,    unlock: 1.5e7,  color: 0xf6e7b0 },
  { id: 'chips', name: 'Appelchips',    machine: 'Droogoven',               value: 1.2e5,  apples: 4,  rate: 0.32, cost: 9.6e5,  unlock: 2.2e8,  color: 0xd9a35b },
  { id: 'pie',   name: 'Appeltaart',    machine: 'Bakkerij',                value: 6e6,    apples: 6,  rate: 0.25, cost: 4.5e7,  unlock: 2.6e10,    color: 0xc9853e },
  { id: 'cider', name: 'Appelcider',    machine: 'Brouwerij',               value: 3e8,    apples: 8,  rate: 0.2,  cost: 2.1e9,  unlock: 9.1e14,  color: 0xb5d36b },
  { id: 'syrup', name: 'Appelstroop',   machine: 'Stroopkokerij',           value: 1.5e10, apples: 12, rate: 0.15, cost: 9e10,   unlock: 4.5e15,    color: 0x7a3b1d },
  { id: 'candy', name: 'Karamelappels', machine: 'Karamelfabriek',          value: 8e11,   apples: 15, rate: 0.12, cost: 4.3e12, unlock: 3e17,   color: 0xff6fa8 },
];
export const LINE_GROWTH = 1.09;

// Fabrieksuitbreidingen. slots = aantal productielijnen, mult = inkomensbonus,
// orchard = vermenigvuldiger voor de boomgaard, size = grootte van de hal in de 3D-wereld.
export const TIERS = [
  { name: 'Schuurtje',     cost: 0,      slots: 2, mult: 1,    orchard: 1,   plots: 1 },
  { name: 'Werkplaats',    cost: 7.5e5,    slots: 3, mult: 1.2,  orchard: 1, plots: 2 },
  { name: 'Fabriek',       cost: 2.1e8,    slots: 4, mult: 1.2,  orchard: 1, plots: 2 },
  { name: 'Grote Fabriek', cost: 7e9,       slots: 5, mult: 1.3,  orchard: 1, plots: 3 },
  { name: 'Industriehal',  cost: 5.9e14,    slots: 6, mult: 1.3,  orchard: 1, plots: 3 },
  { name: 'Megafabriek',   cost: 4.4e15,  slots: 7, mult: 1.4,  orchard: 1, plots: 4 },
  { name: 'Gigafabriek',   cost: 1e17,   slots: 8, mult: 1.5,  orchard: 1, plots: 4 },
  { name: 'Appelcomplex',  cost: 1e21,   slots: 8, mult: 2,    orchard: 1,   plots: 5 },
  { name: 'Appelstad',     cost: 1e25,   slots: 8, mult: 2,    orchard: 1,   plots: 5 },
  { name: 'Appelimperium', cost: 1e29,   slots: 8, mult: 3,    orchard: 1,   plots: 6 },
  { name: 'Appelplaneet',  cost: 1e33,   slots: 8, mult: 3,    orchard: 1,   plots: 6 },
];

// Upgrades (eenmalig, zoals het upgrade-menu van Eatventure). Gesorteerd op prijs in het menu.
// target: line-id | 'orchard' | 'transport' | 'all' (alle prijzen). type: 'price' | 'speed'.
// De prijs is een veelvoud (f) van de bouwprijs van lijn `req`; de upgrade verschijnt zodra die lijn er is.
const U = (id, name, target, type, mult, req, f) => {
  const li = LINES.findIndex((l) => l.id === req);
  return { id, name, target, type, mult, req, get cost() { return Number((LINES[li].unlock * f).toPrecision(2)); } };
};
// Per lijn vier upgrades, steeds duurder (veelvoud van de bouwprijs van die lijn).
const PER_LINE = [
  ['price', 2, 6], ['speed', 2, 40], ['price', 3, 250], ['price', 2, 1500],
];
const NAMES = {
  fresh: ['Glimmende appels', 'Snelle sorteerband', 'Biologisch keurmerk', 'Cadeauverpakking'],
  juice: ['Glazen flessen', 'Hogedrukpers', 'Vers geperst-label', 'Smoothielijn'],
  sauce: ['Grootmoeders recept', 'Roerrobot', 'Kaneel erbij', 'Glazen potjes'],
  chips: ['Krokante coating', 'Snijlaser', 'Luxe zakjes', 'Kruidenmix'],
  pie: ['Roomboterdeeg', 'Tunneloven', 'Bakkerskeurmerk', 'Slagroom erbij'],
  cider: ['Eikenhouten vaten', 'Gistlab', 'Gouden etiket', 'Proeflokaal'],
  syrup: ['Stroopwafelpartners', 'Vacuümketels', 'Ambachtelijke potten', 'Pannenkoekendeal'],
  candy: ['Glitterlaag', 'Karamelrobots', 'Kermisdeal', 'Chocoladelaag'],
};
export const UPGRADES = [
  ...LINES.flatMap((l) => PER_LINE.map(([type, mult, f], k) => U(`${l.id}_${k + 1}`, NAMES[l.id][k], l.id, type, mult, l.id, f))),
  U('all_1',    'Radioreclame',          'all', 'price', 1.5, 'sauce', 12),
  U('all_2',    'Merkidentiteit',        'all', 'price', 1.5, 'pie', 12),
  U('all_3',    'Tv-reclame',            'all', 'price', 2, 'syrup', 12),
  U('all_4',    'Wereldwijde export',    'all', 'price', 2, 'candy', 150),
  U('all_5',    'Slimme fabriek (AI)',   'all', 'price', 3, 'candy', 5000),
];

// Startgeld: genoeg voor de eerste machine.
export const START_MONEY = 10;

// Investeerders (prestige). Elke investeerder geeft +INVESTOR_BONUS inkomen.
export const INVESTOR_BONUS = 0.05;
export const INVESTOR_BASE = 7.7e12;  // totaalverdiensten voor de eerste investeerder
export const INVESTOR_POWER = 0.33;


// Gouden appel: verschijnt af en toe in de boomgaard.
export const GOLDEN = { minDelay: 45, maxDelay: 110, lifetime: 20, incomeSeconds: 45, minReward: 20 };

// Offline-inkomen.
export const OFFLINE = { maxHours: 4, rate: 0.5 };
