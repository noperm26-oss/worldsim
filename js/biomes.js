// biomes.js — the biome table. Everything about a biome lives here.
//
// A biome is not just a colour: it carries the simulation values that decide whether
// people can live there, how much food it yields, and how hard it is to cross.
// (See DESIGN.md §4 — "biomes are simulation, not texture".)

export const BIOMES = [
  // id, key, name, colour, baseHeight, relief, fertility, tempBias, cost
  { key: 'deepOcean',    name: 'Deep Ocean',      color: [0.04, 0.13, 0.32], base: 30,  relief: 14, fertility: 0.05, tempBias:  0.0, cost: 99 },
  { key: 'shallowSea',   name: 'Shallow Sea',     color: [0.09, 0.34, 0.60], base: 78,  relief: 10, fertility: 0.20, tempBias:  0.0, cost: 99 },
  { key: 'beach',        name: 'Beach',           color: [0.88, 0.83, 0.63], base: 118, relief:  4, fertility: 0.15, tempBias:  0.2, cost: 1.0 },
  { key: 'grassland',    name: 'Grassland',       color: [0.42, 0.66, 0.31], base: 132, relief: 10, fertility: 0.72, tempBias:  0.1, cost: 1.0 },
  { key: 'savanna',      name: 'Savanna',         color: [0.71, 0.64, 0.32], base: 134, relief:  9, fertility: 0.52, tempBias:  0.5, cost: 1.1 },
  { key: 'temperateForest', name: 'Temperate Forest', color: [0.25, 0.49, 0.23], base: 138, relief: 14, fertility: 0.80, tempBias: -0.1, cost: 1.6 },
  { key: 'birchForest',  name: 'Birch Forest',    color: [0.50, 0.65, 0.36], base: 136, relief: 12, fertility: 0.66, tempBias: -0.2, cost: 1.5 },
  { key: 'rainforest',   name: 'Rainforest',      color: [0.12, 0.36, 0.16], base: 130, relief: 16, fertility: 0.90, tempBias:  0.6, cost: 2.4 },
  { key: 'flowerMeadow', name: 'Flower Meadow',   color: [0.66, 0.78, 0.42], base: 133, relief:  6, fertility: 0.68, tempBias:  0.1, cost: 1.0 },
  { key: 'swamp',        name: 'Swamp',           color: [0.29, 0.42, 0.27], base: 116, relief:  5, fertility: 0.58, tempBias:  0.3, cost: 2.8 },
  { key: 'taiga',        name: 'Taiga',           color: [0.18, 0.36, 0.29], base: 140, relief: 15, fertility: 0.40, tempBias: -0.5, cost: 1.8 },
  { key: 'tundra',       name: 'Tundra',          color: [0.62, 0.69, 0.66], base: 126, relief:  8, fertility: 0.18, tempBias: -0.7, cost: 2.2 },
  { key: 'permafrost',   name: 'Permafrost',      color: [0.91, 0.95, 0.97], base: 128, relief: 10, fertility: 0.04, tempBias: -1.0, cost: 4.0 },
  { key: 'desert',       name: 'Desert',          color: [0.85, 0.75, 0.48], base: 134, relief:  8, fertility: 0.06, tempBias:  0.9, cost: 2.6 },
  { key: 'wasteland',    name: 'Wasteland',       color: [0.54, 0.50, 0.42], base: 130, relief: 10, fertility: 0.10, tempBias:  0.2, cost: 2.0 },
  { key: 'mountain',     name: 'Mountain',        color: [0.54, 0.51, 0.47], base: 190, relief: 40, fertility: 0.12, tempBias: -0.4, cost: 3.4 },
  { key: 'snowPeak',     name: 'Snow Peak',       color: [1.00, 1.00, 1.00], base: 225, relief: 26, fertility: 0.00, tempBias: -0.9, cost: 6.0 },
  { key: 'volcanic',     name: 'Volcanic',        color: [0.29, 0.21, 0.19], base: 168, relief: 34, fertility: 0.62, tempBias:  0.8, cost: 2.0 },
];

// Sea level as a 0..255 height byte. Anything below this is underwater.
export const SEA_BYTE = 110;
export const SEA_NORM = SEA_BYTE / 255;

// Land biomes only — used by the "spawn life" logic and the palette UI.
export const LAND_BIOMES = BIOMES.filter((b) => b.cost < 90);

export function biomeIndex(key) {
  return BIOMES.findIndex((b) => b.key === key);
}

export function biomeAt(i) {
  return BIOMES[i] || BIOMES[0];
}
