// Alle balans-getallen van het spel staan hier bij elkaar.
// tools/balance-sim.mjs gebruikt dezelfde waarden om de progressie te testen.

// Sterren: op deze levels krijgt een station een ster met een flinke beloning (x2).
// Net als in Eatventure vult een balk zich naar de volgende ster.
export const STARS = [10, ...Array.from({ length: 200 }, (_, k) => 25 * (k + 1))];   // 10, 25, 50, 75, … (elke 25 levels)

// De keten: boomgaard -> appelbak -> productielijnen -> magazijn -> vrachtwagens -> geld.
// Is de appelbak vol, dan stoppen de plukkers. Is het magazijn vol, dan lopen de lijnen vast.

export const ORCHARD = {
  name: 'Boomgaard',
  baseRate: 1.5,      // appels per seconde op level 1
  levelGrowth: 1.25,  // elk level +25% appels
  baseCost: 60,
  growth: 2.0,
  binSeconds: 20,     // de appelbak houdt 20 seconden pluk vast
  binMin: 15,
};

export const SALES = {
  name: 'Vrachtwagens',
  baseRate: 1.5,      // kratten per seconde per vrachtwagen op level 1
  levelGrowth: 1.25,  // elk level +25% lading; op DOCK_LEVELS een extra vrachtwagen
  baseCost: 100,
  growth: 2.0,
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
// om en om de snelheid en de prijs. Elk nieuw product levert op hetzelfde level ongeveer 2x zoveel op
// als het vorige, zodat ook oude machines blijven meetellen. value = prijs op level 1, apples = appels per stuk,
// rate = stuks per seconde, cost = prijs eerste upgrade, unlock = prijs om de lijn te bouwen.
export const LINES = [
  { id: 'fresh', name: 'Verse Appels',  machine: 'Sorteer- & inpakstation', value: 1,      apples: 1,  rate: 1.0,  cost: 30,     unlock: 1e1,    color: 0xe8423f },
  { id: 'juice', name: 'Appelsap',      machine: 'Sappers',                 value: 4,      apples: 2,  rate: 0.5,  cost: 180,    unlock: 1.3e2,    color: 0xf2c14e },
  { id: 'sauce', name: 'Appelmoes',     machine: 'Kookketel',               value: 10,     apples: 3,  rate: 0.4,  cost: 400,    unlock: 2e5,    color: 0xf6e7b0 },
  { id: 'chips', name: 'Appelchips',    machine: 'Droogoven',               value: 25,     apples: 4,  rate: 0.32, cost: 880,    unlock: 4.5e8,  color: 0xd9a35b },
  { id: 'pie',   name: 'Appeltaart',    machine: 'Bakkerij',                value: 64,     apples: 6,  rate: 0.25, cost: 1.9e3,  unlock: 1.2e10,    color: 0xc9853e },
  { id: 'cider', name: 'Appelcider',    machine: 'Brouwerij',               value: 160,    apples: 8,  rate: 0.2,  cost: 4.2e3,  unlock: 7.7e11,  color: 0xb5d36b },
  { id: 'syrup', name: 'Appelstroop',   machine: 'Stroopkokerij',           value: 430,    apples: 12, rate: 0.15, cost: 9e3,    unlock: 5.7e12,    color: 0x7a3b1d },
  { id: 'candy', name: 'Karamelappels', machine: 'Karamelfabriek',          value: 1100,   apples: 15, rate: 0.12, cost: 2e4,    unlock: 9.9e14, color: 0xff6fa8 },
];
export const LINE_GROWTH = 1.055;

// Fabrieksuitbreidingen. slots = aantal productielijnen, mult = inkomensbonus,
// orchard = vermenigvuldiger voor boomgaard én vrachtwagens, chain = hoeveel duurder hun upgrades worden,
// plots = boomgaardpercelen in de 3D-wereld.
export const TIERS = [
  { name: 'Schuurtje',     cost: 0,      slots: 2, mult: 1,    orchard: 1, chain: 1, plots: 1 },
  { name: 'Werkplaats',    cost: 4.1e3,    slots: 3, mult: 1.2,  orchard: 1.5, chain: 3,  plots: 2 },
  { name: 'Fabriek',       cost: 4.2e7,    slots: 4, mult: 1.2,  orchard: 1.5, chain: 3,  plots: 2 },
  { name: 'Grote Fabriek', cost: 6e9,       slots: 5, mult: 1.3,  orchard: 1.5, chain: 3,  plots: 3 },
  { name: 'Industriehal',  cost: 7.3e11,    slots: 6, mult: 1.3,  orchard: 1.5, chain: 3,  plots: 3 },
  { name: 'Megafabriek',   cost: 3.3e12,  slots: 7, mult: 1.4,  orchard: 1.5, chain: 3,  plots: 4 },
  { name: 'Gigafabriek',   cost: 3.3e14, slots: 8, mult: 1.5,  orchard: 1.5, chain: 3,  plots: 4 },
  { name: 'Appelcomplex',  cost: 3.3e17, slots: 8, mult: 1.5,    orchard: 1.5, chain: 3,  plots: 5 },
  { name: 'Appelstad',     cost: 3.3e20, slots: 8, mult: 1.5,    orchard: 1.5, chain: 3,  plots: 5 },
  { name: 'Appelimperium', cost: 3.3e23, slots: 8, mult: 2,    orchard: 1.5, chain: 3,  plots: 6 },
  { name: 'Appelplaneet',  cost: 3.3e26, slots: 8, mult: 2,    orchard: 1.5, chain: 3,  plots: 6 },
];

// Upgrades (eenmalig, zoals het upgrade-menu van Eatventure). Gesorteerd op prijs in het menu.
// target: line-id | 'orchard' | 'transport' | 'all' (alle prijzen). type: 'price' | 'speed'.
// De prijs hoort bij de eigen economie van lijn `req`: wat een level `lv` van die lijn kost, keer 4.
// Zo is een upgrade voor elke lijn even aantrekkelijk. De upgrade verschijnt zodra die lijn er is.
const U = (id, name, target, type, mult, req, lv) => {
  const li = LINES.findIndex((l) => l.id === req);
  return { id, name, target, type, mult, req, get cost() { return Number((LINES[li].cost * LINE_GROWTH ** (lv - 1) * 4).toPrecision(2)); } };
};
// Per lijn vier upgrades, rond level 60, 150, 250 en 350 van die lijn.
const PER_LINE = [
  ['price', 2, 60], ['speed', 2, 150], ['price', 3, 250], ['price', 2, 350],
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
  U('all_1',    'Radioreclame',          'all', 'price', 1.5, 'sauce', 80),
  U('all_2',    'Merkidentiteit',        'all', 'price', 1.5, 'pie', 80),
  U('all_3',    'Tv-reclame',            'all', 'price', 2, 'syrup', 80),
  U('all_4',    'Wereldwijde export',    'all', 'price', 2, 'candy', 120),
  U('all_5',    'Slimme fabriek (AI)',   'all', 'price', 3, 'candy', 180),
];

// Startgeld: genoeg voor de eerste machine.
export const START_MONEY = 10;

// Investeerders (prestige). Elke investeerder geeft +INVESTOR_BONUS inkomen.
export const INVESTOR_BONUS = 0.05;
export const INVESTOR_BASE = 9.3e8;   // totaalverdiensten voor de eerste investeerder
export const INVESTOR_POWER = 0.25;


// Gouden appel: verschijnt af en toe in de boomgaard.
export const GOLDEN = { minDelay: 45, maxDelay: 110, lifetime: 20, incomeSeconds: 20, minReward: 20 };

// Offline-inkomen.
export const OFFLINE = { maxHours: 4, rate: 0.5 };
