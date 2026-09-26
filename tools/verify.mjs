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

console.log(`\n${'-'.repeat(58)}`);

console.log(`${pass} passed, ${fail} failed`);
if (fail) { console.log('failed: ' + failures.join(', ')); process.exit(1); }
