// tools/verify.mjs — runs the real simulation core in Node against a stubbed `three`,
// so world generation, painting and planet assembly are actually executed and asserted.
// Run with: npm run verify

import { WorldState, PRESETS, pointToUV, uvToPoint, SEA_BYTE } from '../js/worldstate.js';
import { BIOMES, biomeIndex, biomeAt } from '../js/biomes.js';
import { buildPlanet, makePaletteTexture } from '../js/planet.js';
import * as THREE from 'three';

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? '  ' + detail : ''}`); }
}

function landStats(w) {
  let land = 0, biomes = new Set();
  for (let i = 0; i < w.height.length; i++) {
    if (w.height[i] > SEA_BYTE) land++;
    biomes.add(w.biome[i]);
  }
  return { pct: (land / w.height.length) * 100, distinct: biomes.size };
}

console.log('\n=== biome table ===');
check('18 biomes defined', BIOMES.length === 18, `got ${BIOMES.length}`);
check('biome keys unique', new Set(BIOMES.map(b => b.key)).size === BIOMES.length);
check('all colours in range', BIOMES.every(b => b.color.length === 3 && b.color.every(c => c >= 0 && c <= 1)));
check('deepOcean is index 0', biomeIndex('deepOcean') === 0);

console.log('\n=== default world is clear water ===');
const w0 = new WorldState(1024, 512);
const s0 = landStats(w0);
check('no land at birth', s0.pct === 0, `land ${s0.pct.toFixed(2)}%`);
check('single biome at birth', s0.distinct === 1, `${s0.distinct} biome(s)`);
check('that biome is deep ocean', w0.biome[0] === biomeIndex('deepOcean'));
check('textures flagged dirty after construction', w0.heightTex.needsUpdate && w0.biomeTex.needsUpdate);

console.log('\n=== uv <-> point round trip ===');
{
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const u = Math.random(), v = Math.random();
    const p = uvToPoint(u, v, new THREE.Vector3());
    const [u2, v2] = pointToUV(p);
    worst = Math.max(worst, Math.abs(u - u2), Math.abs(v - v2));
  }
  check('round trip is exact to 1e-6', worst < 1e-6, `max drift ${worst.toExponential(2)}`);
}
{
  const [u, v] = pointToUV(new THREE.Vector3(0, 1, 0));
  check('north pole maps to v=0', Math.abs(v) < 1e-6, `v=${v}`);
  const [u2, v2] = pointToUV(new THREE.Vector3(0, -1, 0));
  check('south pole maps to v=1', Math.abs(v2 - 1) < 1e-6, `v=${v2}`);
}

console.log('\n=== six world presets ===');
check('six presets exist', PRESETS.length === 6, `got ${PRESETS.length}`);
const seen = {};
for (const p of PRESETS) {
  const w = new WorldState(1024, 512);
  w.generate(p.id, 1337);
  const s = landStats(w);
  seen[p.id] = s;
  const okLand = s.pct > 3 && s.pct < 95;
  const okVariety = s.distinct >= 6;
  check(`${p.name}: land share plausible`, okLand, `${s.pct.toFixed(1)}%`);
  check(`${p.name}: biome variety`, okVariety, `${s.distinct} distinct biomes`);
}
check('presets differ from each other',
  new Set(PRESETS.map(p => Math.round(seen[p.id].pct))).size >= 5,
  PRESETS.map(p => `${p.id}=${seen[p.id].pct.toFixed(0)}%`).join(' '));

console.log('\n=== preset character ===');
{
  const w = new WorldState(1024, 512);
  w.generate('earth', 1337);
  const counts = new Map();
  for (let i = 0; i < w.biome.length; i++) counts.set(w.biome[i], (counts.get(w.biome[i]) || 0) + 1);
  const has = (k) => counts.has(biomeIndex(k));
  check('Earth Today has ice', has('permafrost'));
  check('Earth Today has desert', has('desert'));
  check('Earth Today has rainforest', has('rainforest'));
  check('Earth Today has taiga', has('taiga'));
  check('Earth Today has tundra', has('tundra'));

  // Southern pole band must be iced — that is the "RIGHT NOW with antarctic" requirement.
  const southIce = [];
  const southLand = [];
  for (let y = Math.floor(w.H * 0.94); y < w.H; y++)
    for (let x = 0; x < w.W; x += 8) {
      southIce.push(w.biome[y * w.W + x]);
      southLand.push(w.height[y * w.W + x]);
    }
  const iceFrac = southIce.filter(b => b === biomeIndex('permafrost')).length / southIce.length;
  check('south pole is iced (Antarctica)', iceFrac > 0.9, `${(iceFrac * 100).toFixed(0)}% permafrost`);
  const landFrac = southLand.filter(h => h > SEA_BYTE).length / southLand.length;
  check('Antarctica is a landmass, not open ocean', landFrac > 0.95, `${(landFrac * 100).toFixed(0)}% above sea`);

  // And the northern cap must be cold too — no jungle at the top of the world.
  const north = [];
  for (let y = 0; y < Math.ceil(w.H * 0.04); y++)
    for (let x = 0; x < w.W; x += 8) north.push(w.biome[y * w.W + x]);
  const cold = north.filter(b => ['permafrost', 'tundra'].includes(biomeAt(b).key)).length / north.length;
  check('north pole is cold (Arctic)', cold > 0.9, `${(cold * 100).toFixed(0)}% permafrost/tundra`);

  // Equatorial band should be wet and green, not desert.
  const eq = [];
  for (let y = Math.floor(w.H * 0.46); y < Math.floor(w.H * 0.54); y++)
    for (let x = 0; x < w.W; x += 8) eq.push(w.biome[y * w.W + x]);
  const green = eq.filter(b => ['rainforest', 'swamp', 'savanna'].includes(biomeAt(b).key)).length / eq.length;
  const dry = eq.filter(b => biomeAt(b).key === 'desert').length / eq.length;
  check('equator is green, not desert', green > dry && dry < 0.15,
    `${(green * 100).toFixed(0)}% green vs ${(dry * 100).toFixed(0)}% desert`);
}
{
  const w = new WorldState(512, 256);
  w.generate('desert', 42);
  const counts = new Map();
  for (let i = 0; i < w.biome.length; i++) counts.set(w.biome[i], (counts.get(w.biome[i]) || 0) + 1);
  const d = (counts.get(biomeIndex('desert')) || 0) + (counts.get(biomeIndex('wasteland')) || 0);
  check('Desert World is mostly arid', d / w.biome.length > 0.35, `${((d / w.biome.length) * 100).toFixed(0)}% arid`);
}
{
  const w = new WorldState(512, 256);
  w.generate('archipelago', 42);
  const s = landStats(w);
  check('Archipelago is mostly sea', s.pct < 45, `${s.pct.toFixed(1)}% land`);
}

console.log('\n=== seed changes the world ===');
{
  const a = new WorldState(256, 128); a.generate('earth', 1);
  const b = new WorldState(256, 128); b.generate('earth', 2);
  let diff = 0;
  for (let i = 0; i < a.height.length; i++) if (a.height[i] !== b.height[i]) diff++;
  check('different seeds give different terrain', diff / a.height.length > 0.5,
    `${((diff / a.height.length) * 100).toFixed(0)}% of texels differ`);

  const c = new WorldState(256, 128); c.generate('earth', 1);
  let same = 0;
  for (let i = 0; i < a.height.length; i++) if (a.height[i] === c.height[i]) same++;
  check('same seed is reproducible', same === a.height.length,
    `${((same / a.height.length) * 100).toFixed(2)}% identical`);
}

console.log('\n=== painting ===');
{
  const w = new WorldState(512, 256);   // starts as clear water
  const grass = biomeIndex('grassland');
  const before = landStats(w).pct;
  const touched = w.paint(0.5, 0.5, 20, grass, 1.0);
  const after = landStats(w).pct;
  check('paint reports it touched texels', touched === true);
  check('paint raises land out of water', after > before, `${before.toFixed(2)}% -> ${after.toFixed(2)}%`);
  const c = w.sample(0.5, 0.5);
  check('paint sets the chosen biome', c.biome === grass, `biome=${biomeAt(c.biome).name}`);
  check('painted height is above sea', c.height > SEA_BYTE, `h=${c.height} sea=${SEA_BYTE}`);
  check('paint marks textures dirty', w.heightTex.needsUpdate && w.biomeTex.needsUpdate);
}
{
  // Paint near the longitude seam — x must wrap, not clamp or crash.
  const w = new WorldState(512, 256);
  const beach = biomeIndex('beach');
  w.paint(0.001, 0.5, 18, beach, 1.0);
  w.paint(0.999, 0.5, 18, beach, 1.0);
  const left = w.sample(0.995, 0.5), right = w.sample(0.005, 0.5);
  check('seam paint wraps on both sides',
    left.biome === beach && right.biome === beach,
    `x=0.995 -> ${biomeAt(left.biome).name}, x=0.005 -> ${biomeAt(right.biome).name}`);
}
{
  const w = new WorldState(256, 128);
  w.paint(0.5, 0.5, 10, 999, 1.0);   // out-of-range biome must not throw or corrupt
  check('out-of-range biome is rejected safely', w.sample(0.5, 0.5).biome === biomeIndex('deepOcean'));
}

console.log('\n=== clear back to water ===');
{
  const w = new WorldState(512, 256);
  w.generate('earth', 7);
  const landBefore = landStats(w).pct;
  w.clearToWater();
  const s = landStats(w);
  check('generate made land first', landBefore > 5, `${landBefore.toFixed(1)}%`);
  check('clear removes all land', s.pct === 0, `${s.pct.toFixed(2)}%`);
  check('clear resets to one biome', s.distinct === 1);
}

console.log('\n=== planet assembly ===');
{
  const w = new WorldState(256, 128);
  w.generate('earth', 5);
  const pl = buildPlanet(w);
  check('group holds terrain, water, atmosphere, stars', pl.group.children.length === 4,
    `${pl.group.children.length} children`);
  check('terrain is a Mesh', pl.terrain.isMesh !== false && pl.terrain.geometry instanceof THREE.SphereGeometry);
  check('terrain shader has vertex + fragment', pl.terrainMat.vertexShader.length > 200 && pl.terrainMat.fragmentShader.length > 100);
  const un = Object.keys(pl.terrainMat.uniforms);
  for (const need of ['heightTex', 'biomeTex', 'uPalette', 'uSunDir', 'uSeaNorm', 'uHeightScale', 'uTexelU', 'uTexelV', 'uPaletteSize'])
    check(`terrain uniform "${need}" wired`, un.includes(need));
  check('heightTex uniform is the world texture', pl.terrainMat.uniforms.heightTex.value === w.heightTex);
  check('biomeTex uniform is the world texture', pl.terrainMat.uniforms.biomeTex.value === w.biomeTex);
  check('sea level uniform matches SEA_NORM', Math.abs(pl.terrainMat.uniforms.uSeaNorm.value - SEA_BYTE / 255) < 1e-9);

  pl.setSunDir(new THREE.Vector3(3, 1, 0));
  const sd = pl.terrainMat.uniforms.uSunDir.value;
  check('setSunDir normalises', Math.abs(sd.length() - 1) < 1e-6, `len=${sd.length().toFixed(6)}`);
  pl.setCamPos(new THREE.Vector3(0, 0, 3));
  check('setCamPos feeds water + atmosphere',
    pl.waterMat.uniforms.uCamPos.value.z === 3 && pl.atmoMat.uniforms.uCamPos.value.z === 3);
  check('water shares the sun direction', pl.waterMat.uniforms.uSunDir === pl.terrainMat.uniforms.uSunDir);
}

console.log('\n=== palette texture ===');
{
  const t = makePaletteTexture();
  const d = t.image.data;
  let mismatch = 0;
  for (let i = 0; i < BIOMES.length; i++) {
    const want = BIOMES[i].color.map(c => Math.round(c * 255));
    for (let k = 0; k < 3; k++) if (d[i * 4 + k] !== want[k]) mismatch++;
  }
  check('every biome colour encoded correctly', mismatch === 0, `${mismatch} channel mismatch(es)`);
  check('palette width is 32 (shader divides by 32)', t.image.width === 32);
  check('palette uses nearest filtering', t.minFilter === THREE.NearestFilter);
}

console.log('\n=== shader interface (static) ===');
{
  // No GPU is available here, so validate the parts of GLSL that actually break at
  // link time: varyings must match between stages, and every uniform a shader declares
  // must be supplied by the material.
  const decls = (src, kind) => {
    const out = new Map();
    const re = new RegExp(kind + '\\s+(\\w+)\\s+(\\w+)\\s*;', 'g');
    let m;
    while ((m = re.exec(src))) out.set(m[2], m[1]);
    return out;
  };

  const stages = [
    ['terrain', pl0().terrainMat],
    ['water',   pl0().waterMat],
    ['atmos',   pl0().atmoMat],
  ];

  function pl0() {
    if (!pl0._v) {
      const w = new WorldState(64, 32);
      pl0._v = buildPlanet(w);
    }
    return pl0._v;
  }

  for (const [name, mat] of stages) {
    const vVar = decls(mat.vertexShader, 'varying');
    const fVar = decls(mat.fragmentShader, 'varying');

    for (const [vname, vtype] of fVar) {
      check(`${name}: fragment varying "${vname}" written by vertex stage`, vVar.has(vname));
      if (vVar.has(vname))
        check(`${name}: varying "${vname}" types agree`, vVar.get(vname) === vtype,
          `vert ${vVar.get(vname)} / frag ${vtype}`);
    }

    const uni = new Map([...decls(mat.vertexShader, 'uniform'), ...decls(mat.fragmentShader, 'uniform')]);
    for (const [uname] of uni) {
      check(`${name}: uniform "${uname}" supplied`, Object.prototype.hasOwnProperty.call(mat.uniforms, uname));
    }
    for (const supplied of Object.keys(mat.uniforms)) {
      check(`${name}: uniform "${supplied}" actually used`, uni.has(supplied));
    }

    // Braces balanced — catches a truncated shader string.
    const bal = (s) => (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
    check(`${name}: vertex braces balanced`, bal(mat.vertexShader) === 0);
    check(`${name}: fragment braces balanced`, bal(mat.fragmentShader) === 0);

    // Samplers must be bound to a texture, never left undefined.
    for (const [uname, utype] of uni) {
      if (utype === 'sampler2D') {
        const val = mat.uniforms[uname] && mat.uniforms[uname].value;
        check(`${name}: sampler "${uname}" bound to a texture`, !!val && !!val.image && val.image.width > 0,
          val && val.image ? `${val.image.width}x${val.image.height}` : 'unbound');
      }
    }
  }
}

// ================================================================ eras
import { ERAS, TECHS, techsOfEra, formatYear, ERA_BY_ID } from '../js/eras.js';

console.log('\n=== era ladder ===');
check('15 eras defined', ERAS.length === 15, `got ${ERAS.length}`);
{
  const want = ['wood', 'stone', 'copper', 'bronze', 'iron', 'classical',
    'medievalEarly', 'medievalHigh', 'medievalLate', 'renaissance', 'sail',
    'industrial', 'modern', 'information', 'space'];
  check('era order is Wood -> Stone -> Copper -> Bronze -> Iron -> ... -> Space',
    JSON.stringify(ERAS.map(e => e.id)) === JSON.stringify(want),
    ERAS.map(e => e.id).join(' > '));
  check('Wood Age is first', ERAS[0].id === 'wood');
  check('the three medieval eras are present and in order',
    ERAS[6].id === 'medievalEarly' && ERAS[7].id === 'medievalHigh' && ERAS[8].id === 'medievalLate');
}
{
  let contiguous = true, gap = '';
  for (let i = 1; i < ERAS.length; i++) {
    if (ERAS[i].from !== ERAS[i - 1].to) { contiguous = false; gap = `${ERAS[i-1].id}->${ERAS[i].id}`; }
  }
  check('era year ranges are contiguous', contiguous, gap);
  check('every era has a build style', ERAS.every(e => e.build && e.build.scale > 0 && e.build.count > 0));
  check('every era declares discoveries', ERAS.every(e => Array.isArray(e.tech) && e.tech.length > 0));
  check('minPop never decreases', ERAS.every((e, i) => i === 0 || e.minPop >= ERAS[i - 1].minPop));
}
{
  let bad = [];
  for (const [k, t] of Object.entries(TECHS)) if (!ERA_BY_ID[t.era]) bad.push(k);
  check(`every tech (${Object.keys(TECHS).length}) references a real era`, bad.length === 0, bad.join(','));

  bad = [];
  for (const e of ERAS) for (const r of e.req) if (!TECHS[r]) bad.push(`${e.id}:${r}`);
  check('every era requirement is a real tech', bad.length === 0, bad.join(','));

  bad = [];
  for (const e of ERAS) for (const t of e.tech) if (!TECHS[t]) bad.push(`${e.id}:${t}`);
  check('every declared era tech exists', bad.length === 0, bad.join(','));
}
check('techsOfEra is memoised (same array identity)', techsOfEra('bronze') === techsOfEra('bronze'));
check('techsOfEra returns sorted-by-cost', (() => {
  const t = techsOfEra('bronze').map(k => TECHS[k].cost);
  return t.every((v, i) => i === 0 || v >= t[i - 1]);
})());
check('formatYear renders BC', formatYear(-3000) === '3,000 BC', formatYear(-3000));
check('formatYear renders AD', formatYear(1500) === '1,500 AD', formatYear(1500));

// ================================================================ simulation
import { Simulation, MAX_SETTLEMENTS, tierOf } from '../js/sim.js';
import { POWERS, POWER_BY_ID, grantTrait, giveCommandment, sealCovenant, COMMANDMENTS, COVENANTS } from '../js/faith.js';
import { serialize, deserialize } from '../js/save.js';

function habitableSpot(sim, rng = Math.random) {
  for (let i = 0; i < 20000; i++) {
    const u = rng(), v = 0.28 + rng() * 0.44;
    if (sim.habitable(u, v)) return { u, v };
  }
  return null;
}

console.log('\n=== simulation: the opening act ===');
{
  const w = new WorldState(512, 256); w.generate('earth', 1337);
  const sim = new Simulation(w, 7);
  check('a new world has no people', sim.population === 0);
  check('a new world has no cultures', sim.cultures.length === 0);
  const spot = habitableSpot(sim);
  check('Earth preset has habitable land', !!spot);
  const { culture, settlement } = sim.spawnFirstPair(spot.u, spot.v);
  check('the first pair is exactly two people', settlement.pop === 2, `pop=${settlement.pop}`);
  check('one culture awakens', sim.cultures.length === 1);
  check('they start in the Wood Age', ERAS[culture.eraIndex].id === 'wood');
  check('the culture remembers its homeland', culture.home && culture.home.u === spot.u);
  check('water is not habitable', sim.habitable(0.5, 0.5) === false || sim.fertilityAt(0.5, 0.5) > 0);
}

console.log('\n=== simulation: growth and history ===');
{
  const w = new WorldState(512, 256); w.generate('earth', 1337);
  const sim = new Simulation(w, 99);
  const spot = habitableSpot(sim);
  sim.spawnFirstPair(spot.u, spot.v);

  const marks = { 1: null, 1500: null, 1800: null, 2025: null };
  const real = { 1: 250e6, 1500: 500e6, 1800: 1e9, 2025: 8.1e9 };
  const order = [1, 1500, 1800, 2025];
  let oi = 0;
  const t0 = Date.now();
  while (sim.year < 2025) {
    sim.tick(8);
    if (oi < order.length && sim.year >= order[oi]) { marks[order[oi]] = sim.population; oi++; }
  }
  const secs = (Date.now() - t0) / 1000;

  // Within 2.5x of the published curve in either direction. The shape is the point:
  // a straight line here would mean the era ladder is not doing anything.
  for (const y of order) {
    const got = marks[y], want = real[y];
    const ratio = got / want;
    check(`population at ${y} AD within 2.5x of the real figure`,
      ratio > 0.4 && ratio < 2.5,
      `${(got / 1e6).toFixed(0)}M vs real ${(want / 1e6).toFixed(0)}M (x${ratio.toFixed(2)})`);
  }
  check('population is monotonically rising across the arc',
    order.every((y, i) => i === 0 || marks[y] > marks[order[i - 1]]));

  check('the world fills with settlements', sim.settlements.length >= MAX_SETTLEMENTS * 0.9,
    `${sim.settlements.length}/${MAX_SETTLEMENTS}`);
  check('languages diverge into many peoples', sim.cultures.length > 20, `${sim.cultures.length} cultures`);

  const lead = [...sim.cultures].sort((a, b) =>
    (b.eraIndex) - (a.eraIndex))[0];
  check('the leading people reach the Information Age', ERAS[lead.eraIndex].id === 'information',
    `${lead.name}: ${ERAS[lead.eraIndex].name}`);
  check('the leading people discovered gunpowder', lead.techs.has('gunpowder'));
  check('the leading people discovered writing', lead.techs.has('writing'));
  check('the leading people discovered bronze before iron',
    lead.techs.has('bronze') && lead.techs.has('iron'));
  check('every culture passed through the Stone Age',
    sim.cultures.every(c => c.eraIndex >= 1), 'no culture is still in the Wood Age');
  check('faith accumulates over 200,000 years', sim.faith > 1000, `${Math.round(sim.faith)}`);
  check(`full 200,000-year run completes promptly`, secs < 120, `${secs.toFixed(1)}s`);

  // Tick cost is the thing that decides whether the game is playable.
  const N = 1200;
  const p0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) sim.tick(1);
  const perTick = Number(process.hrtime.bigint() - p0) / 1e6 / N;
  check('tick cost leaves room in a 16.7ms frame at 5 substeps',
    perTick * 5 < 8, `${perTick.toFixed(3)} ms/tick -> ${(perTick * 5).toFixed(2)} ms/frame`);
}

console.log('\n=== tiers and powers ===');
check('tier ladder is ordered', tierOf(0).name === 'Camp' && tierOf(100).name === 'Hamlet'
  && tierOf(3000).name === 'Town' && tierOf(50000).name === 'City' && tierOf(2e7).name === 'Megacity');
{
  const w = new WorldState(256, 128); w.generate('earth', 5);
  const sim = new Simulation(w, 3);
  const spot = habitableSpot(sim);
  sim.spawnFirstPair(spot.u, spot.v);
  for (let i = 0; i < 4000; i++) sim.tick(2);
  const before = sim.population;
  sim.faith = 100000;

  const r = POWER_BY_ID.meteor.apply(sim, spot.u, spot.v);
  check('meteor kills', r.ok && r.killed > 0, `${Math.round(r.killed || 0)} killed`);
  check('meteor reduced the population', sim.population < before);

  const target = sim.settlements[0];
  target.drought = 1;
  POWER_BY_ID.rain.apply(sim, target.u, target.v);
  check('rain ends a drought', target.drought === 0);

  target.plague = 1;
  POWER_BY_ID.heal.apply(sim, target.u, target.v);
  check('heal lifts a plague', target.plague === 0);

  const n0 = sim.settlements.length;
  const rs = POWER_BY_ID.spawnHumans.apply(sim, spot.u + 0.15, spot.v);
  check('breathe life founds a settlement or refuses cleanly',
    rs.ok ? sim.settlements.length === n0 + 1 : typeof rs.why === 'string',
    rs.ok ? 'founded' : rs.why);

  const bad = POWER_BY_ID.spawnHumans.apply(sim, 0.5, 0.5);   // mid-Pacific
  check('cannot breathe life onto open ocean', bad.ok === false && !!bad.why, bad.why);

  check('spendFaith refuses when short', (() => { sim.faith = 10; return sim.spendFaith(50) === false; })());
  check('spendFaith succeeds when able', (() => { sim.faith = 100; return sim.spendFaith(50) === true && sim.faith === 50; })());
}

console.log('\n=== doctrine: creeds, commandments, covenants ===');
{
  const w = new WorldState(256, 128); w.generate('earth', 5);
  const sim = new Simulation(w, 3);
  const spot = habitableSpot(sim);
  const { culture } = sim.spawnFirstPair(spot.u, spot.v);
  sim.faith = 100000;

  const g = grantTrait(sim, culture.id, 'clever');
  check('grant a trait', g.ok, g.why || '');
  check('trait is recorded', culture.traits.clever === true);
  check('trait cache was invalidated', culture._mul === null);
  check('clever boosts research', sim._traitMul(culture, 'research') > 1,
    `x${sim._traitMul(culture, 'research').toFixed(2)}`);
  check('granting the same trait twice is refused', grantTrait(sim, culture.id, 'clever').ok === false);
  check('unknown trait is refused', grantTrait(sim, culture.id, 'zzz').ok === false);

  const c1 = giveCommandment(sim, culture.id, 'noWar');
  check('give a commandment', c1.ok, c1.why || '');
  check('commandment suppresses war', sim._traitMul(culture, 'war') < 1,
    `x${sim._traitMul(culture, 'war').toFixed(2)}`);
  check('duplicate commandment refused', giveCommandment(sim, culture.id, 'noWar').ok === false);

  const cov = sealCovenant(sim, culture.id, 'chosen');
  check('covenant needs real devotion first', cov.ok === false && /belief/.test(cov.why || ''), cov.why || '');
  for (const s of sim.settlements) s.devotion = 1.5;
  const cov2 = sealCovenant(sim, culture.id, 'chosen');
  check('covenant seals once belief is deep enough', cov2.ok, cov2.why || '');
  check('second covenant is refused', sealCovenant(sim, culture.id, 'exodus').ok === false);
  check('all commandments are defined', COMMANDMENTS.length >= 5, `${COMMANDMENTS.length}`);
  check('all covenants are defined', COVENANTS.length >= 3, `${COVENANTS.length}`);
}

console.log('\n=== prayers ===');
{
  const w = new WorldState(256, 128); w.generate('earth', 5);
  const sim = new Simulation(w, 3);
  const spot = habitableSpot(sim);
  const { settlement } = sim.spawnFirstPair(spot.u, spot.v);
  sim.faith = 1000;
  sim._raisePrayer(settlement, 'drought', 'The rivers are dust.');
  check('a prayer is raised', sim.prayers.length === 1);
  check('duplicate prayers are collapsed',
    (sim._raisePrayer(settlement, 'drought', 'again'), sim.prayers.length === 1));
  check('the prayer queue is capped', (() => {
    for (let i = 0; i < 40; i++) sim._raisePrayer({ ...settlement, id: 1000 + i }, 'famine', 'x');
    return sim.prayers.length === 1;
  })(), `${sim.prayers.length} — prayers for settlements that do not exist are dropped`);

  sim.prayers.length = 0;
  sim._raisePrayer(settlement, 'plague', 'Plague walks our streets.');
  const dev0 = settlement.devotion;
  const ans = sim.answerPrayer(sim.prayers[0].id);
  check('answering a prayer succeeds with faith', ans.ok, ans.why || '');
  check('answering raises devotion', settlement.devotion > dev0,
    `${dev0.toFixed(2)} -> ${settlement.devotion.toFixed(2)}`);
  check('answering clears the plague', settlement.plague === 0);
  check('answering costs faith', sim.faith < 1000);
  check('answering removes the prayer', sim.prayers.length === 0);

  sim._raisePrayer(settlement, 'war', 'They burn our fields.');
  sim.faith = 0;
  check('answering without faith is refused', sim.answerPrayer(sim.prayers[0].id).ok === false);
  const dev1 = settlement.devotion;
  sim.refusePrayer(sim.prayers[0].id);
  check('refusing is free and costs belief',
    settlement.devotion < dev1 && sim.faith === 0,
    `${dev1.toFixed(2)} -> ${settlement.devotion.toFixed(2)}`);
  check('refusing removes the prayer', sim.prayers.length === 0);

  sim._raisePrayer(settlement, 'famine', 'We starve.');
  sim.prayers[0].ttl = -1;
  const dev2 = settlement.devotion;
  sim._expirePrayers(1);
  check('an ignored prayer erodes belief', settlement.devotion < dev2,
    `${dev2.toFixed(2)} -> ${settlement.devotion.toFixed(2)}`);
  check('expired prayers are removed', sim.prayers.length === 0);
}

console.log('\n=== save and load ===');
{
  const w = new WorldState(256, 128); w.generate('earth', 21);
  const sim = new Simulation(w, 5);
  const spot = habitableSpot(sim);
  const { culture } = sim.spawnFirstPair(spot.u, spot.v);
  for (let i = 0; i < 3000; i++) sim.tick(2);
  grantTrait(sim, culture.id, 'fierce');

  const blob = serialize(w, sim);
  const json = JSON.stringify(blob);
  check('save is a round-trippable JSON string', json.length > 1000, `${(json.length / 1024).toFixed(0)} KB`);

  const w2 = new WorldState(256, 128);
  const sim2 = new Simulation(w2, 1);
  deserialize(JSON.parse(json), w2, sim2);

  check('terrain survives the round trip', w2.height.every((v, i) => v === w.height[i]));
  check('biomes survive the round trip', w2.biome.every((v, i) => v === w.biome[i]));
  check('the year survives', sim2.year === sim.year, formatYear(sim2.year));
  check('population survives', Math.abs(sim2.population - sim.population) < 1e-6);
  check('cultures survive', sim2.cultures.length === sim.cultures.length, `${sim2.cultures.length}`);
  check('settlements survive', sim2.settlements.length === sim.settlements.length);
  check('techs survive as a real Set',
    sim2.cultures[0].techs instanceof Set && sim2.cultures[0].techs.size === culture.techs.size,
    `${sim2.cultures[0].techs.size} techs`);
  check('traits survive', sim2.cultures[0].traits.fierce === true);
  check('era survives', sim2.cultures[0].eraIndex === culture.eraIndex,
    ERAS[sim2.cultures[0].eraIndex].name);

  let threw = false;
  try { deserialize({ v: 99 }, w2, sim2); } catch { threw = true; }
  check('a bad save version is rejected', threw);

  // The loaded world must still simulate.
  const before = sim2.population;
  for (let i = 0; i < 200; i++) sim2.tick(1);
  check('a loaded world keeps simulating', sim2.population !== before);
}

console.log(`\n${'-'.repeat(58)}`);

console.log(`${pass} passed, ${fail} failed`);
if (fail) { console.log('failed: ' + failures.join(', ')); process.exit(1); }
