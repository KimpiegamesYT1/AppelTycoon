// Alle balans-getallen van het spel staan hier bij elkaar.
// tools/balance-sim.mjs gebruikt dezelfde waarden om de progressie te testen.

// Levels waarop een station een mijlpaal haalt (x2 productie).
export const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

// De keten: boomgaard -> appelbak -> productielijnen -> magazijn -> vrachtwagens -> geld.
// Is de appelbak vol, dan stoppen de plukkers. Is het magazijn vol, dan lopen de lijnen vast.

export const ORCHARD = {
  name: 'Boomgaard',
  baseRate: 1,        // appels per seconde per level
  baseCost: 15,
  growth: 1.14,
  binSeconds: 20,     // de appelbak houdt 20 seconden pluk vast
  binMin: 15,
};

export const SALES = {
  name: 'Vrachtwagens',
  baseRate: 1.6,      // goederen (basiswaarde in euro) per seconde per level, per vrachtwagen
  rateGrowth: 1.07,   // extra groei per level, zodat vrachtwagens dure producten bijhouden
  baseCost: 25,
  growth: 1.17,
  storeSeconds: 30,   // het magazijn houdt 30 seconden transport vast
  storeMin: 20,
};

// Een vrachtwagen laadt aan de deur (loadTime seconden), vertrekt en wordt dan pas verkocht.
// Na cycle seconden staat hij weer aan de deur.
export const TRUCK = { loadTime: 4, cycle: 20 };

// Op deze levels krijgt het magazijn een extra laadplek met een extra vrachtwagen.

export const DOCK_LEVELS = [10, 20, 50, 100, 200];

// Op deze levels komt er een plukker bij in de boomgaard (alleen te zien, geen extra productie).
export const PICKER_LEVELS = [3, 8, 15, 25, 40, 60, 80, 100, 150, 200, 300];

// Productielijnen. value = prijs per product, apples = appels per product,
// rate = producten per seconde per level, cost = prijs eerste upgrade.
export const LINES = [
  { id: 'fresh', name: 'Verse Appels',  machine: 'Sorteer- & inpakstation', value: 1,      apples: 1,  rate: 1.0,  cost: 8,     unlock: 10,     color: 0xe8423f },
  { id: 'juice', name: 'Appelsap',      machine: 'Sappers',                 value: 8,      apples: 2,  rate: 0.5,  cost: 100,   unlock: 250,    color: 0xf2c14e },
  { id: 'sauce', name: 'Appelmoes',     machine: 'Kookketel',               value: 45,     apples: 3,  rate: 0.4,  cost: 1.5e3, unlock: 5e3,    color: 0xf6e7b0 },
  { id: 'chips', name: 'Appelchips',    machine: 'Droogoven',               value: 260,    apples: 4,  rate: 0.32, cost: 2.5e4, unlock: 5e5,    color: 0xd9a35b },
  { id: 'pie',   name: 'Appeltaart',    machine: 'Bakkerij',                value: 1600,   apples: 6,  rate: 0.25, cost: 4e5,   unlock: 5e7,  color: 0xc9853e },
  { id: 'cider', name: 'Appelcider',    machine: 'Brouwerij',               value: 11000,  apples: 8,  rate: 0.2,  cost: 5e6,   unlock: 2e9,    color: 0xb5d36b },
  { id: 'syrup', name: 'Appelstroop',   machine: 'Stroopkokerij',           value: 80000,  apples: 12, rate: 0.15, cost: 1e8,   unlock: 1.5e11,  color: 0x7a3b1d },
  { id: 'candy', name: 'Karamelappels', machine: 'Karamelfabriek',          value: 650000, apples: 15, rate: 0.12, cost: 2e9,   unlock: 1e13,   color: 0xff6fa8 },
];
export const LINE_GROWTH = 1.11;
// Elke upgrade van een lijn maakt het product ook duurder: de prijs groeit met LINE_PRICE_GROWTH per level.
// Zo stijgen opbrengst en kosten van upgrades ongeveer even hard en blijft elke upgrade de moeite waard.
export const LINE_PRICE_GROWTH = 1.04;

// Fabrieksuitbreidingen. slots = aantal productielijnen, mult = inkomensbonus,
// orchard = vermenigvuldiger voor de boomgaard, size = grootte van de hal in de 3D-wereld.
export const TIERS = [
  { name: 'Schuurtje',     cost: 0,      slots: 2, mult: 1,    orchard: 1,   plots: 1 },
  { name: 'Werkplaats',    cost: 3e3,    slots: 3, mult: 1.2,  orchard: 1.5, plots: 2 },
  { name: 'Fabriek',       cost: 2e5,    slots: 4, mult: 1.2,  orchard: 1.5, plots: 2 },
  { name: 'Grote Fabriek', cost: 4e7,    slots: 5, mult: 1.3,  orchard: 1.5, plots: 3 },
  { name: 'Industriehal',  cost: 1e9,    slots: 6, mult: 1.3,  orchard: 1.5, plots: 3 },
  { name: 'Megafabriek',   cost: 5e10,    slots: 7, mult: 1.4,  orchard: 1.5, plots: 4 },
  { name: 'Gigafabriek',   cost: 5e12, slots: 8, mult: 1.5,  orchard: 1.5, plots: 4 },
  { name: 'Appelcomplex',  cost: 3e15,   slots: 8, mult: 2,    orchard: 2,   plots: 5 },
  { name: 'Appelstad',     cost: 2e18,   slots: 8, mult: 2,    orchard: 2,   plots: 5 },
  { name: 'Appelimperium', cost: 1e21,   slots: 8, mult: 3,    orchard: 2,   plots: 6 },
  { name: 'Appelplaneet',  cost: 1e24,   slots: 8, mult: 3,    orchard: 2,   plots: 6 },
];

// Eenmalige onderzoeken. target: 'orchard' | 'transport' | 'all' (prijzen) | line-id.
// req: welke lijn ontgrendeld moet zijn voordat het onderzoek verschijnt.
export const RESEARCH = [
  { id: 'r_fert1',   name: 'Kunstmest',           desc: 'Boomgaard x2',        target: 'orchard',   mult: 2,   cost: 1000,    req: 'juice' },
  { id: 'r_truck1',  name: 'Grotere laadbakken',  desc: 'Vrachtwagens x2',     target: 'transport', mult: 2,   cost: 2500,  req: 'juice' },
  { id: 'r_fresh1',  name: 'Snelle sorteerband',  desc: 'Verse Appels x2',     target: 'fresh',     mult: 2,   cost: 6000,    req: 'juice' },
  { id: 'r_juice1',  name: 'Hogedrukpers',        desc: 'Appelsap x2',         target: 'juice',     mult: 2,   cost: 90000,    req: 'sauce' },
  { id: 'r_ads1',    name: 'Radioreclame',        desc: 'Alle prijzen x1,5',   target: 'all',       mult: 1.5, cost: 300000,    req: 'sauce' },
  { id: 'r_sauce1',  name: 'Roerrobot',           desc: 'Appelmoes x2',        target: 'sauce',     mult: 2,   cost: 5e+06,    req: 'chips' },
  { id: 'r_bees',    name: 'Bijenkasten',         desc: 'Boomgaard x2',        target: 'orchard',   mult: 2,   cost: 1.5e+07,  req: 'chips' },
  { id: 'r_truck2',  name: 'Opleggers',           desc: 'Vrachtwagens x2',     target: 'transport', mult: 2,   cost: 4e+07,    req: 'chips' },
  { id: 'r_chips1',  name: 'Snijlaser',           desc: 'Appelchips x2',       target: 'chips',     mult: 2,   cost: 4.5e+08,  req: 'pie' },
  { id: 'r_brand',   name: 'Merkidentiteit',      desc: 'Alle prijzen x1,5',   target: 'all',       mult: 1.5, cost: 1.8e+09,    req: 'pie' },
  { id: 'r_pie1',    name: 'Tunneloven',          desc: 'Appeltaart x2',       target: 'pie',       mult: 2,   cost: 5e+10,    req: 'cider' },
  { id: 'r_irrig',   name: 'Druppelirrigatie',    desc: 'Boomgaard x2',        target: 'orchard',   mult: 2,   cost: 2e+11,    req: 'cider' },
  { id: 'r_truck3',  name: 'Vrachttreinen',       desc: 'Vrachtwagens x2',     target: 'transport', mult: 2,   cost: 6e+11,    req: 'cider' },
  { id: 'r_cider1',  name: 'Gistlab',             desc: 'Appelcider x2',       target: 'cider',     mult: 2,   cost: 9e+12,   req: 'syrup' },
  { id: 'r_tv',      name: 'Tv-reclame',          desc: 'Alle prijzen x1,5',   target: 'all',       mult: 1.5, cost: 3e+13,   req: 'syrup' },
  { id: 'r_syrup1',  name: 'Vacuümketels',        desc: 'Appelstroop x2',      target: 'syrup',     mult: 2,   cost: 1.5e+15, req: 'candy' },
  { id: 'r_drones',  name: 'Plukdrones',          desc: 'Boomgaard x2',        target: 'orchard',   mult: 2,   cost: 5e+15,   req: 'candy' },
  { id: 'r_cargo',   name: 'Vrachtvliegtuigen',   desc: 'Vrachtwagens x3',     target: 'transport', mult: 3,   cost: 1.5e+16, req: 'candy' },
  { id: 'r_candy1',  name: 'Karamelrobots',       desc: 'Karamelappels x2',    target: 'candy',     mult: 2,   cost: 5e+16,   req: 'candy' },
  { id: 'r_export',  name: 'Wereldwijde export',  desc: 'Alle prijzen x2',     target: 'all',       mult: 2,   cost: 3e+17,   req: 'candy' },
  { id: 'r_gene',    name: 'Superappel-genen',    desc: 'Boomgaard x3',        target: 'orchard',   mult: 3,   cost: 2e+18,   req: 'candy' },
  { id: 'r_ai',      name: 'Slimme fabriek (AI)', desc: 'Alle prijzen x3',     target: 'all',       mult: 3,   cost: 2e+19,   req: 'candy' },
];

// Startgeld: genoeg voor de eerste machine.
export const START_MONEY = 10;

// Investeerders (prestige). Elke investeerder geeft +INVESTOR_BONUS inkomen.
export const INVESTOR_BONUS = 0.05;
export const INVESTOR_BASE = 5.6e7;   // totaalverdiensten voor de eerste investeerder
export const INVESTOR_POWER = 0.4;


// Gouden appel: verschijnt af en toe in de boomgaard.
export const GOLDEN = { minDelay: 45, maxDelay: 110, lifetime: 20, incomeSeconds: 45, minReward: 20 };

// Offline-inkomen.
export const OFFLINE = { maxHours: 4, rate: 0.5 };
