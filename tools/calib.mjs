import { WorldState } from '../js/worldstate.js';
import { Simulation, MAX_SETTLEMENTS } from '../js/sim.js';
import { ERAS, formatYear } from '../js/eras.js';

const w = new WorldState(512, 256);
w.generate('earth', 1337);
const sim = new Simulation(w, 99);

// find a habitable spot
let site = null;
for (let i = 0; i < 4000 && !site; i++) {
  const u = Math.random(), v = 0.35 + Math.random() * 0.3;
  if (sim.habitable(u, v)) site = { u, v };
}
sim.spawnFirstPair(site.u, site.v);

const marks = [-100000, -70000, -10000, -3000, -1200, -500, 1, 500, 1000, 1300, 1500, 1650, 1800, 1900, 1970, 2025];
const t0 = Date.now();
let steps = 0;
const DT = 1;
while (sim.year < 2025) {
  sim.tick(DT);
  steps++;
  if (marks.length && sim.year >= marks[0]) {
    marks.shift();
    const eras = [...new Set(sim.cultures.map(c => ERAS[c.eraIndex].name))];
    console.log(`${formatYear(sim.year).padStart(14)}  pop=${Math.round(sim.population).toLocaleString('en-US').padStart(16)}  settlements=${String(sim.settlements.length).padStart(4)}  cultures=${String(sim.cultures.length).padStart(3)}  eras=${eras.join(', ')}`);
  }
}
console.log(`\nsteps=${steps} elapsed=${((Date.now()-t0)/1000).toFixed(1)}s  final pop=${Math.round(sim.population).toLocaleString('en-US')}`);
console.log(`settlements=${sim.settlements.length}/${MAX_SETTLEMENTS} cultures=${sim.cultures.length} faith=${Math.round(sim.faith)} prayers=${sim.prayers.length}`);
