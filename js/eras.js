// eras.js — the era ladder and the discovery chain.
//
// Eras gate what a people can build, fight with and discover. Advancement needs three
// things at once: the year, enough people, and the prerequisite discoveries. That keeps
// a culture from leaping to castles with forty villagers.
//
// Note on "Wood Age": the archaeological record goes Stone -> Bronze -> Iron. Wood Age
// is a game convention for the earliest tier, before worked stone is routine, and it
// sits in front of the real sequence rather than replacing it.

export const ERAS = [
  {
    id: 'wood', name: 'Wood Age', from: -200000, to: -70000,
    blurb: 'Fire, sharpened sticks, gathered food. No permanent home yet.',
    req: [], minPop: 0,
    tech: ['fire', 'speech', 'woodTools'],
    build: { scale: 0.35, body: 0x6b5637, roof: 0x4a5a2c, count: 2 },
  },
  {
    id: 'stone', name: 'Stone Age', from: -70000, to: -3500,
    blurb: 'Flint blades, sewn hides, the bow. Late in the era: sown grain and pottery.',
    req: [], minPop: 0,
    tech: ['flint', 'clothing', 'bow', 'burial', 'agriculture', 'pottery'],
    build: { scale: 0.5, body: 0x8a7a5c, roof: 0x5c6b3a, count: 3 },
  },
  {
    id: 'copper', name: 'Copper Age', from: -3500, to: -3000,
    blurb: 'The first metal, beaten cold then smelted. Short, and it changes everything.',
    req: ['agriculture'], minPop: 400,
    tech: ['metallurgy', 'plough', 'wheel'],
    build: { scale: 0.62, body: 0x9c8a68, roof: 0x6a5a3c, count: 4 },
  },
  {
    id: 'bronze', name: 'Bronze Age', from: -3000, to: -1200,
    blurb: 'Tin and copper make bronze. Writing, cities, the wheel, the first true states.',
    req: ['metallurgy', 'agriculture'], minPop: 3000,
    tech: ['bronze', 'writing', 'city', 'chariot', 'sailing', 'law'],
    build: { scale: 0.8, body: 0xb09a72, roof: 0x7a5c34, count: 6 },
  },
  {
    id: 'iron', name: 'Iron Age', from: -1200, to: -500,
    blurb: 'Iron is everywhere and cheaper than bronze. Farming spreads, armies grow.',
    req: ['bronze'], minPop: 25000,
    tech: ['iron', 'coinage', 'alphabet', 'cavalry'],
    build: { scale: 0.92, body: 0xa89274, roof: 0x6e4f30, count: 8 },
  },
  {
    id: 'classical', name: 'Classical Age', from: -500, to: 500,
    blurb: 'Roads, aqueducts, philosophy and empires that think in centuries.',
    req: ['iron', 'writing', 'coinage'], minPop: 250000,
    tech: ['engineering', 'roads', 'aqueduct', 'philosophy', 'masonry'],
    build: { scale: 1.05, body: 0xc8bda4, roof: 0x9c4b32, count: 11 },
  },
  {
    id: 'medievalEarly', name: 'Early Medieval', from: 500, to: 1000,
    blurb: 'Rome is gone. Wooden halls, hill forts, the first stone keeps.',
    req: ['masonry'], minPop: 300000,
    tech: ['feudalism', 'heavyPlough', 'stirrup'],
    build: { scale: 1.1, body: 0x8f8474, roof: 0x5e5347, count: 13 },
  },
  {
    id: 'medievalHigh', name: 'High Medieval', from: 1000, to: 1300,
    blurb: 'Cathedrals, universities, heavy cavalry. Population climbs fast.',
    req: ['feudalism', 'heavyPlough'], minPop: 400000,
    tech: ['castle', 'university', 'windmill', 'guilds'],
    build: { scale: 1.25, body: 0x9a9184, roof: 0x4d5a6b, count: 16 },
  },
  {
    id: 'medievalLate', name: 'Late Medieval', from: 1300, to: 1500,
    blurb: 'Plague, cannon, and the first printed pages. The old order cracks.',
    req: ['castle', 'guilds'], minPop: 450000,
    tech: ['gunpowder', 'banking', 'blastFurnace', 'plague medicine'],
    build: { scale: 1.35, body: 0xa89c8c, roof: 0x40484f, count: 18 },
  },
  {
    id: 'renaissance', name: 'Renaissance', from: 1500, to: 1650,
    blurb: 'The press, the telescope, and ships that cross open ocean.',
    req: ['gunpowder', 'banking'], minPop: 500000,
    tech: ['printing', 'navigation', 'astronomy', 'anatomy'],
    build: { scale: 1.45, body: 0xc0a98c, roof: 0x8c4a32, count: 20 },
  },
  {
    id: 'sail', name: 'Age of Sail', from: 1650, to: 1760,
    blurb: 'Every ocean is connected. Trade and disease travel at the same speed.',
    req: ['navigation', 'printing'], minPop: 600000,
    tech: ['cartography', 'scientificMethod', 'jointStock'],
    build: { scale: 1.55, body: 0xc4b39a, roof: 0x6b4630, count: 22 },
  },
  {
    id: 'industrial', name: 'Industrial Age', from: 1760, to: 1900,
    blurb: 'Steam, iron rails, and cities that outgrow their water supply.',
    req: ['scientificMethod', 'cartography'], minPop: 900000,
    tech: ['steam', 'railway', 'telegraph', 'medicine'],
    build: { scale: 1.75, body: 0x8e7f70, roof: 0x3c3a38, count: 26 },
  },
  {
    id: 'modern', name: 'Modern Age', from: 1900, to: 1970,
    blurb: 'Electric light, flight, and two wars that reach every continent.',
    req: ['steam', 'medicine'], minPop: 1600000,
    tech: ['electricity', 'flight', 'antibiotics', 'radio'],
    build: { scale: 2.0, body: 0x9aa3ad, roof: 0x2f3742, count: 30 },
  },
  {
    id: 'information', name: 'Information Age', from: 1970, to: 2025,
    blurb: 'Computing, then a network that reaches most of the species.',
    req: ['electricity', 'antibiotics'], minPop: 3000000,
    tech: ['computing', 'internet', 'nuclear', 'genetics'],
    build: { scale: 2.3, body: 0xa8b4c0, roof: 0x26313d, count: 34 },
  },
  {
    id: 'space', name: 'Space Age', from: 2025, to: 100000,
    blurb: 'Off-world colonies. The planet becomes one place among several.',
    req: ['computing', 'nuclear'], minPop: 8000000,
    tech: ['fusion', 'terraforming', 'interplanetary'],
    build: { scale: 2.6, body: 0xbfd0e0, roof: 0x1c2836, count: 38 },
  },
];

export const ERA_BY_ID = Object.fromEntries(ERAS.map((e, i) => [e.id, { ...e, index: i }]));

// ---------------------------------------------------------------- discoveries

// Each tech costs `cost` research points. A culture earns research from its population,
// scaled by how clever you made it. Nothing here is placed by the player.
export const TECHS = {
  fire:            { name: 'Fire',             era: 'wood',          cost: 10 },
  speech:          { name: 'Language',         era: 'wood',          cost: 14 },
  woodTools:       { name: 'Wooden Tools',     era: 'wood',          cost: 18 },

  flint:           { name: 'Flint Knapping',   era: 'stone',         cost: 24 },
  clothing:        { name: 'Sewn Hides',       era: 'stone',         cost: 26 },
  bow:             { name: 'The Bow',          era: 'stone',         cost: 34 },
  burial:          { name: 'Burial Rites',     era: 'stone',         cost: 40 },
  agriculture:     { name: 'Agriculture',      era: 'stone',         cost: 120 },
  pottery:         { name: 'Pottery',          era: 'stone',         cost: 60 },

  metallurgy:      { name: 'Metallurgy',       era: 'copper',        cost: 140 },
  plough:          { name: 'The Plough',       era: 'copper',        cost: 90 },
  wheel:           { name: 'The Wheel',        era: 'copper',        cost: 80 },

  bronze:          { name: 'Bronze Working',   era: 'bronze',        cost: 220 },
  writing:         { name: 'Writing',          era: 'bronze',        cost: 260 },
  city:            { name: 'The City',         era: 'bronze',        cost: 300 },
  chariot:         { name: 'Chariot',          era: 'bronze',        cost: 180 },
  sailing:         { name: 'Sailing',          era: 'bronze',        cost: 160 },
  law:             { name: 'Written Law',      era: 'bronze',        cost: 200 },

  iron:            { name: 'Iron Working',     era: 'iron',          cost: 420 },
  coinage:         { name: 'Coinage',          era: 'iron',          cost: 320 },
  alphabet:        { name: 'Alphabet',         era: 'iron',          cost: 280 },
  cavalry:         { name: 'Cavalry',          era: 'iron',          cost: 340 },

  engineering:     { name: 'Engineering',      era: 'classical',     cost: 700 },
  roads:           { name: 'Roads',            era: 'classical',     cost: 620 },
  aqueduct:        { name: 'Aqueducts',        era: 'classical',     cost: 680 },
  philosophy:      { name: 'Philosophy',       era: 'classical',     cost: 560 },
  masonry:         { name: 'Cut Masonry',      era: 'classical',     cost: 740 },

  feudalism:       { name: 'Feudalism',        era: 'medievalEarly', cost: 900 },
  heavyPlough:     { name: 'Heavy Plough',     era: 'medievalEarly', cost: 820 },
  stirrup:         { name: 'Stirrup',          era: 'medievalEarly', cost: 640 },

  castle:          { name: 'Stone Castle',     era: 'medievalHigh',  cost: 1400 },
  university:      { name: 'University',       era: 'medievalHigh',  cost: 1600 },
  windmill:        { name: 'Windmill',         era: 'medievalHigh',  cost: 900 },
  guilds:          { name: 'Guilds',           era: 'medievalHigh',  cost: 1100 },

  gunpowder:       { name: 'Gunpowder',        era: 'medievalLate',  cost: 2200 },
  banking:         { name: 'Banking',          era: 'medievalLate',  cost: 1900 },
  blastFurnace:    { name: 'Blast Furnace',    era: 'medievalLate',  cost: 1700 },
  'plague medicine': { name: 'Quarantine',     era: 'medievalLate',  cost: 1500 },

  printing:        { name: 'Printing Press',   era: 'renaissance',   cost: 2600 },
  navigation:      { name: 'Ocean Navigation', era: 'renaissance',   cost: 2400 },
  astronomy:       { name: 'Astronomy',        era: 'renaissance',   cost: 2100 },
  anatomy:         { name: 'Anatomy',          era: 'renaissance',   cost: 1800 },

  cartography:     { name: 'Cartography',      era: 'sail',          cost: 3000 },
  scientificMethod:{ name: 'Scientific Method',era: 'sail',          cost: 3600 },
  jointStock:      { name: 'Joint Stock',      era: 'sail',          cost: 2800 },

  steam:           { name: 'Steam Power',      era: 'industrial',    cost: 5000 },
  railway:         { name: 'Railways',         era: 'industrial',    cost: 5400 },
  telegraph:       { name: 'Telegraph',        era: 'industrial',    cost: 4200 },
  medicine:        { name: 'Germ Theory',      era: 'industrial',    cost: 5800 },

  electricity:     { name: 'Electricity',      era: 'modern',        cost: 8000 },
  flight:          { name: 'Flight',           era: 'modern',        cost: 8600 },
  antibiotics:     { name: 'Antibiotics',      era: 'modern',        cost: 9200 },
  radio:           { name: 'Radio',            era: 'modern',        cost: 7000 },

  computing:       { name: 'Computing',        era: 'information',   cost: 14000 },
  internet:        { name: 'Internet',         era: 'information',   cost: 16000 },
  nuclear:         { name: 'Nuclear Power',    era: 'information',   cost: 15000 },
  genetics:        { name: 'Genetics',         era: 'information',   cost: 13000 },

  fusion:          { name: 'Fusion',           era: 'space',         cost: 26000 },
  terraforming:    { name: 'Terraforming',     era: 'space',         cost: 30000 },
  interplanetary:  { name: 'Interplanetary Travel', era: 'space',    cost: 28000 },
};

export const START_YEAR = ERAS[0].from;

export function eraIndex(id) {
  return ERA_BY_ID[id] ? ERA_BY_ID[id].index : 0;
}

// Which techs belong to an era — used to decide whether a culture is ready to advance.
// Memoised: this is on the hottest path in the simulation.
const _techsByEra = new Map();
export function techsOfEra(eraId) {
  let t = _techsByEra.get(eraId);
  if (!t) {
    t = Object.keys(TECHS)
      .filter((k) => TECHS[k].era === eraId)
      .sort((a, b) => TECHS[a].cost - TECHS[b].cost);
    _techsByEra.set(eraId, t);
  }
  return t;
}

export function formatYear(y) {
  const n = Math.abs(Math.round(y));
  if (y < 0) return `${n.toLocaleString('en-US')} BC`;
  return `${n.toLocaleString('en-US')} AD`;
}
