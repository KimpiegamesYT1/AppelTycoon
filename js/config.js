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
  baseCost: 20,
  growth: 2.2,
  binSeconds: 20,     // de appelbak houdt 20 seconden pluk vast
  binMin: 15,
};

export const SALES = {
  name: 'Vervoer',
  baseRate: 1.5,      // kratten per seconde per voertuig op level 1
  levelGrowth: 1.08,  // elk level +8% lading (kleine stappen: vervoer moet steeds een beetje mee); op DOCK_LEVELS een extra voertuig
  baseCost: 80,
  growth: 1.32,
  tierBoost: false,   // uitbreidingen geven het vervoer geen gratis extra capaciteit (de boomgaard wel)
  storeSeconds: 30,   // het magazijn houdt 30 seconden transport vast
  storeMin: 20,
};

// Een vrachtwagen laadt aan de deur (loadTime seconden), vertrekt en wordt dan pas verkocht.
// Na cycle seconden staat hij weer aan de deur.
export const TRUCK = { loadTime: 3, cycle: 10 };

// Op deze levels krijgt het magazijn een extra laadplek met een extra vrachtwagen.
export const DOCK_LEVELS = [10, 25, 50, 75, 100];
// Het vervoer groeit mee: op elk DOCK_LEVEL een extra voertuig, en tot level 40 ook een groter type.
export const VEHICLES = [
  { id: 'scooter', name: 'Scooter', plural: 'scooters' },
  { id: 'pickup', name: 'Pickup', plural: 'pickups' },
  { id: 'van', name: 'Bestelbus', plural: 'bestelbussen' },
  { id: 'truck', name: 'Vrachtwagen', plural: 'vrachtwagens' },
  { id: 'semi', name: 'Grote truck', plural: 'grote trucks' },
];

// Op deze levels komt er een plukker bij in de boomgaard (alleen te zien, geen extra productie).
export const PICKER_LEVELS = [3, 6, 10, 15, 20, 25, 30, 35, 40, 50, 60];

// Productielijnen. Elk level verhoogt de prijs per stuk (value x level). Sterren verdubbelen
// om en om de snelheid en de prijs. Een nieuwe lijn begint op level 1: cost is ~3% van de bouwprijs,
// zodat je er meteen een paar levels bij koopt maar niet honderden; value is zo gekozen dat de lijn
// ~10 minuten na het bouwen zo'n kwart van het inkomen levert (tools/calibrate-lines.mjs).
// value = prijs op level 1, apples = appels per stuk, rate = stuks per seconde,
// cost = prijs eerste upgrade, growth = hoeveel duurder elk level wordt
// (standaard LINE_GROWTH; de eerste machine wordt sneller duurder: snel begin, daarna vlakt hij af),
// unlock = prijs om de lijn te bouwen.
export const LINES = [
  { id: 'fresh', name: 'Verse Appels',  machine: 'Sorteer- & inpakstation', value: 1,      apples: 1,  rate: 1.0,  cost: 5, growth: 1.075,unlock: 1e1,    color: 0xe8423f },
  { id: 'juice', name: 'Appelsap',      machine: 'Sappers',                 value: 1.1,    apples: 2,  rate: 0.5,  cost: 54,     unlock: 1.8e3,    color: 0xf2c14e },
  { id: 'sauce', name: 'Appelmoes',     machine: 'Kookketel',               value: 690,    apples: 3,  rate: 0.4,  cost: 1.7e5,  unlock: 5.7e6,  color: 0xf6e7b0 },
  { id: 'chips', name: 'Appelchips',    machine: 'Droogoven',               value: 2200,   apples: 4,  rate: 0.32, cost: 6.3e5,  unlock: 1.5e7,  color: 0xd9a35b },
  { id: 'pie',   name: 'Appeltaart',    machine: 'Bakkerij',                value: 7000,   apples: 6,  rate: 0.25, cost: 2.5e6,  unlock: 7.2e7,     color: 0xc9853e },
  { id: 'cider', name: 'Appelcider',    machine: 'Brouwerij',               value: 3.5e5,  apples: 8,  rate: 0.2,  cost: 2.8e8,  unlock: 8.5e9,   color: 0xb5d36b },
  { id: 'syrup', name: 'Appelstroop',   machine: 'Stroopkokerij',           value: 1.2e7,  apples: 12, rate: 0.15, cost: 1.7e10, unlock: 3.8e11,    color: 0x7a3b1d },
  { id: 'candy', name: 'Karamelappels', machine: 'Karamelfabriek',          value: 7.4e8,  apples: 15, rate: 0.12, cost: 2.6e12, unlock: 1.1e14, color: 0xff6fa8 },
];
export const LINE_GROWTH = 1.055;

// Fabrieksuitbreidingen. slots = aantal productielijnen, mult = inkomensbonus,
// orchard = vermenigvuldiger voor boomgaard én vrachtwagens, chain = hoeveel duurder hun upgrades worden,
// plots = boomgaardpercelen in de 3D-wereld.
export const TIERS = [
  { name: 'Schuurtje',     cost: 0,      slots: 2, mult: 1,    orchard: 1, chain: 1, plots: 1 },
  { name: 'Werkplaats',    cost: 9.4e5,    slots: 3, mult: 1.2,  orchard: 1.5, chain: 3,  plots: 2 },
  { name: 'Fabriek',       cost: 1.5e7,    slots: 4, mult: 1.2,  orchard: 1.5, chain: 3,  plots: 2 },
  { name: 'Grote Fabriek', cost: 4.7e7,     slots: 5, mult: 1.3,  orchard: 1.5, chain: 3,  plots: 3 },
  { name: 'Industriehal',  cost: 4.2e9,     slots: 6, mult: 1.3,  orchard: 1.5, chain: 3,  plots: 3 },
  { name: 'Megafabriek',   cost: 3.7e11,  slots: 7, mult: 1.4,  orchard: 1.5, chain: 3,  plots: 4 },
  { name: 'Gigafabriek',   cost: 3.7e14, slots: 8, mult: 1.5,  orchard: 1.5, chain: 3,  plots: 4 },
  { name: 'Appelcomplex',  cost: 3.7e19, slots: 8, mult: 1.5,    orchard: 1.5, chain: 3,  plots: 5 },
  { name: 'Appelstad',     cost: 3.7e24, slots: 8, mult: 1.5,    orchard: 1.5, chain: 3,  plots: 5 },
  { name: 'Appelimperium', cost: 3.7e29, slots: 8, mult: 2,    orchard: 1.5, chain: 3,  plots: 6 },
  { name: 'Appelplaneet',  cost: 3.7e34, slots: 8, mult: 2,    orchard: 1.5, chain: 3,  plots: 6 },
];

// Upgrades (eenmalig, zoals het upgrade-menu van Eatventure). Gesorteerd op prijs in het menu.
// target: line-id | 'orchard' | 'transport' | 'all' (alle prijzen). type: 'price' | 'speed'.
// De prijs hoort bij de eigen economie van lijn `req`: wat een level `lv` van die lijn kost, keer 4.
// Zo is een upgrade voor elke lijn even aantrekkelijk. De upgrade verschijnt zodra die lijn er is.
const U = (id, name, target, type, mult, req, lv) => {
  const li = LINES.findIndex((l) => l.id === req);
  return { id, name, target, type, mult, req, get cost() { return Number((LINES[li].cost * (LINES[li].growth || LINE_GROWTH) ** (lv - 1) * 4).toPrecision(2)); } };
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
export const INVESTOR_BASE = 1.9e5;   // totaalverdiensten voor de eerste investeerder
export const INVESTOR_POWER = 0.15;


// Gouden appel: verschijnt af en toe in de boomgaard.
export const GOLDEN = { minDelay: 45, maxDelay: 110, lifetime: 20, incomeSeconds: 20, minReward: 20 };
// Af en toe rolt er een gouden appel over de band: het product dat ervan gemaakt wordt is beltMult keer zoveel waard.
export const BELT_GOLD = { minDelay: 45, maxDelay: 90, mult: 5 };

// Offline-inkomen.
export const OFFLINE = { maxHours: 4, rate: 0.5 };

// Kantoor: superwerknemers. Elke productielijn die je opent levert 1 punt op (ook in latere rondes);
// met punten huur je werknemers. Je zet ze zelf bij een machine (of de boomgaard / het vervoer).
// Na het starten werken ze `active` seconden, daarna rusten ze `rest` seconden; dan tik je ze weer aan.
// speed = snelheid x (machine, boomgaard of vervoer), price = prijs x (alleen machines).
// tier = vanaf welke uitbreiding (ooit bereikt) ze in het kantoor verschijnen.
export const STAFF = {
  active: 180,
  rest: 300,
  list: [
    { id: 'kees',   name: 'Kees',      role: 'Monteur',      speed: 2,             cost: 1,  tier: 0,  shirt: '#3d8bef', hair: '#6b4a2b' },
    { id: 'sanne',  name: 'Sanne',     role: 'Verkoopster',  price: 2,             cost: 2,  tier: 1,  shirt: '#ef5350', hair: '#e8b04a' },
    { id: 'mo',     name: 'Mo',        role: 'Techneut',     speed: 3,             cost: 3,  tier: 2,  shirt: '#26a69a', hair: '#2b2f3a' },
    { id: 'lotte',  name: 'Lotte',     role: 'Marketeer',    price: 3,             cost: 4,  tier: 3,  shirt: '#ab47bc', hair: '#a0522d' },
    { id: 'bram',   name: 'Bram',      role: 'Ploegbaas',    speed: 2, price: 2,   cost: 6,  tier: 4,  shirt: '#ff9a3c', hair: '#3b2a1e' },
    { id: 'fatima', name: 'Fatima',    role: 'Ingenieur',    speed: 4,             cost: 8,  tier: 5,  shirt: '#5c6bc0', hair: '#1f1a17' },
    { id: 'daan',   name: 'Daan',      role: 'Topverkoper',  price: 4,             cost: 10, tier: 6,  shirt: '#2e7d32', hair: '#d9a35b' },
    { id: 'noor',   name: 'Noor',      role: 'Directeur',    speed: 3, price: 3,   cost: 14, tier: 7,  shirt: '#37474f', hair: '#7a3b1d' },
    { id: 'ruben',  name: 'Ruben',     role: 'Robotexpert',  speed: 6,             cost: 18, tier: 8,  shirt: '#00acc1', hair: '#c0c0c0' },
    { id: 'eva',    name: 'Eva',       role: 'Appelmagnaat', price: 6,             cost: 22, tier: 9,  shirt: '#d81b60', hair: '#ffd54f' },
    { id: 'opa',    name: 'Opa Appel', role: 'Legende',      speed: 5, price: 5,   cost: 30, tier: 10, shirt: '#ffc928', hair: '#eeeeee' },
  ],
};
