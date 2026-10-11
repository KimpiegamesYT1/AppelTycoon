// Alle balans-getallen van het spel staan hier bij elkaar.
// tools/balance-sim.mjs gebruikt dezelfde waarden om de progressie te testen.

// Levels waarop een station een mijlpaal haalt (x2 productie).
export const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

// Overtollige appels die geen productielijn kan verwerken worden los verkocht.
export const RAW_APPLE_PRICE = 0.25;

export const ORCHARD = {
  name: 'Boomgaard',
  icon: '🌳',
  baseRate: 1.2,      // appels per seconde per level
  baseCost: 10,
  growth: 1.13,
};

export const SALES = {
  name: 'Verkoop & Marketing',
  icon: '🚚',
  perLevel: 0.12,     // +12% verkoopprijs per level
  baseCost: 60,
  growth: 1.19,
};

// Productielijnen. value = prijs per product, apples = appels per product,
// rate = producten per seconde per level, cost = prijs eerste upgrade.
export const LINES = [
  { id: 'fresh',   name: 'Verse Appels',  machine: 'Sorteer- & inpakstation', icon: '🍎', value: 1,      apples: 1,  rate: 1.0,  cost: 6,      unlock: 0,       color: 0xe8423f },
  { id: 'juice',   name: 'Appelsap',      machine: 'Sappers',                 icon: '🧃', value: 9,      apples: 2,  rate: 0.5,  cost: 60,     unlock: 60,      color: 0xf2c14e },
  { id: 'sauce',   name: 'Appelmoes',     machine: 'Kookketel',               icon: '🥣', value: 55,     apples: 3,  rate: 0.4,  cost: 700,    unlock: 900,     color: 0xf6e7b0 },
  { id: 'chips',   name: 'Appelchips',    machine: 'Droogoven',               icon: '🥨', value: 320,    apples: 4,  rate: 0.32, cost: 8e3,    unlock: 12e3,    color: 0xd9a35b },
  { id: 'pie',     name: 'Appeltaart',    machine: 'Bakkerij',                icon: '🥧', value: 2200,   apples: 6,  rate: 0.25, cost: 1.1e5,  unlock: 2.2e5,   color: 0xc9853e },
  { id: 'cider',   name: 'Appelcider',    machine: 'Brouwerij',               icon: '🍾', value: 16000,  apples: 8,  rate: 0.2,  cost: 1.6e6,  unlock: 4e6,     color: 0xb5d36b },
  { id: 'syrup',   name: 'Appelstroop',   machine: 'Stroopkokerij',           icon: '🍯', value: 130000, apples: 12, rate: 0.15, cost: 2.8e7,  unlock: 9e7,     color: 0x7a3b1d },
  { id: 'candy',   name: 'Karamelappels', machine: 'Karamelfabriek',          icon: '🍭', value: 1.2e6,  apples: 15, rate: 0.12, cost: 5e8,    unlock: 2.5e9,   color: 0xff6fa8 },
];
export const LINE_GROWTH = 1.14;

// Fabrieksuitbreidingen. slots = aantal productielijnen, mult = inkomensbonus,
// orchard = vermenigvuldiger voor de boomgaard, size = grootte van de hal in de 3D-wereld.
export const TIERS = [
  { name: 'Schuurtje',     cost: 0,      slots: 2, mult: 1,   orchard: 1,  plots: 1 },
  { name: 'Werkplaats',    cost: 3e3,    slots: 3, mult: 1.25, orchard: 1.5, plots: 2 },
  { name: 'Fabriek',       cost: 1e5,    slots: 4, mult: 1.25, orchard: 1.5, plots: 2 },
  { name: 'Grote Fabriek', cost: 4e6,    slots: 5, mult: 1.5, orchard: 1.5, plots: 3 },
  { name: 'Industriehal',  cost: 2e8,    slots: 6, mult: 1.5, orchard: 2,  plots: 3 },
  { name: 'Megafabriek',   cost: 1.2e10, slots: 7, mult: 1.5, orchard: 2,  plots: 4 },
  { name: 'Gigafabriek',   cost: 3e11,   slots: 8, mult: 2,   orchard: 2,  plots: 4 },
  { name: 'Appelcomplex',  cost: 5e13,   slots: 8, mult: 3,   orchard: 2,  plots: 5 },
  { name: 'Appelstad',     cost: 2e16,   slots: 8, mult: 3,   orchard: 2,  plots: 5 },
  { name: 'Appelimperium', cost: 1e19,   slots: 8, mult: 4,   orchard: 3,  plots: 6 },
  { name: 'Appelplaneet',  cost: 1e22,   slots: 8, mult: 5,   orchard: 3,  plots: 6 },
];

// Eenmalige onderzoeken. target: 'orchard' | 'all' | line-id.
// req: welke lijn ontgrendeld moet zijn voordat het onderzoek verschijnt.
export const RESEARCH = [
  { id: 'r_fert1',  name: 'Kunstmest',            desc: 'Boomgaard x2',          target: 'orchard', mult: 2,   cost: 1.5e3,  req: 'juice' },
  { id: 'r_fresh1', name: 'Snelle sorteerband',   desc: 'Verse Appels x2',       target: 'fresh',   mult: 2,   cost: 4e3,    req: 'juice' },
  { id: 'r_juice1', name: 'Hogedrukpers',         desc: 'Appelsap x2',           target: 'juice',   mult: 2,   cost: 2e4,    req: 'sauce' },
  { id: 'r_ads1',   name: 'Radioreclame',         desc: 'Alle verkoop x1,5',     target: 'all',     mult: 1.5, cost: 1.5e5,  req: 'sauce' },
  { id: 'r_sauce1', name: 'Roerrobot',            desc: 'Appelmoes x2',          target: 'sauce',   mult: 2,   cost: 6e5,    req: 'chips' },
  { id: 'r_bees',   name: 'Bijenkasten',          desc: 'Boomgaard x2',          target: 'orchard', mult: 2,   cost: 2e6,    req: 'chips' },
  { id: 'r_chips1', name: 'Snijlaser',            desc: 'Appelchips x2',         target: 'chips',   mult: 2,   cost: 1.5e7,  req: 'pie' },
  { id: 'r_brand',  name: 'Merkidentiteit',       desc: 'Alle verkoop x1,5',     target: 'all',     mult: 1.5, cost: 8e7,    req: 'pie' },
  { id: 'r_pie1',   name: 'Tunneloven',           desc: 'Appeltaart x2',         target: 'pie',     mult: 2,   cost: 6e8,    req: 'cider' },
  { id: 'r_irrig',  name: 'Druppelirrigatie',     desc: 'Boomgaard x2',          target: 'orchard', mult: 2,   cost: 3e9,    req: 'cider' },
  { id: 'r_cider1', name: 'Gistlab',              desc: 'Appelcider x2',         target: 'cider',   mult: 2,   cost: 3e10,   req: 'syrup' },
  { id: 'r_tv',     name: 'Tv-reclame',           desc: 'Alle verkoop x1,5',     target: 'all',     mult: 1.5, cost: 1.5e11, req: 'syrup' },
  { id: 'r_syrup1', name: 'Vacuümketels',         desc: 'Appelstroop x2',        target: 'syrup',   mult: 2,   cost: 2e12,   req: 'candy' },
  { id: 'r_drones', name: 'Plukdrones',           desc: 'Boomgaard x2',          target: 'orchard', mult: 2,   cost: 8e12,   req: 'candy' },
  { id: 'r_candy1', name: 'Karamelrobots',        desc: 'Karamelappels x2',      target: 'candy',   mult: 2,   cost: 5e13,   req: 'candy' },
  { id: 'r_export', name: 'Wereldwijde export',   desc: 'Alle verkoop x2',       target: 'all',     mult: 2,   cost: 3e14,   req: 'candy' },
  { id: 'r_gene',   name: 'Superappel-genen',     desc: 'Boomgaard x3',          target: 'orchard', mult: 3,   cost: 2e15,   req: 'candy' },
  { id: 'r_ai',     name: 'Slimme fabriek (AI)',  desc: 'Alle verkoop x3',       target: 'all',     mult: 3,   cost: 2e16,   req: 'candy' },
];

// Investeerders (prestige). Elke investeerder geeft +INVESTOR_BONUS inkomen.
export const INVESTOR_BONUS = 0.05;
export const INVESTOR_BASE = 1e9;   // run-verdiensten voor de eerste investeerder

// Turbo: tijdelijke productieboost.
export const BOOST = { mult: 2, duration: 120, cooldown: 300 };

// Gouden appel: verschijnt af en toe in de boomgaard.
export const GOLDEN = { minDelay: 60, maxDelay: 140, lifetime: 12, incomeSeconds: 45, minReward: 50 };

// Offline-inkomen.
export const OFFLINE = { maxHours: 3, rate: 0.5 };
