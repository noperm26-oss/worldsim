// main.js — scene, input routing, the simulation clock, and wiring to the UI.

import * as THREE from 'three';
import { WorldState, pointToUV } from './worldstate.js';
import { buildPlanet } from './planet.js';
import { Entities, surfacePoint } from './render-entities.js';
import { Simulation } from './sim.js';
import { POWER_BY_ID, grantTrait, giveCommandment, sealCovenant } from './faith.js';
import { createUI } from './ui.js';
import { saveLocal, loadLocal, exportFile, importFile, clearLocal } from './save.js';
import { ERAS, formatYear } from './eras.js';
import { biomeAt, SEA_BYTE } from './biomes.js';

// ---------------------------------------------------------------- renderer

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.005, 400);

// Entities use Lambert shading, so they need real lights. The directional light tracks
// the same sun vector the terrain shader uses, so day and night agree everywhere.
const sunLight = new THREE.DirectionalLight(0xfff4e2, 2.2);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x334466, 0.85));

// ---------------------------------------------------------------- world + sim

const HEIGHT_SCALE = 0.14;
const world = new WorldState(1024, 512);
const planet = buildPlanet(world, { heightScale: HEIGHT_SCALE });
scene.add(planet.group);

const sim = new Simulation(world, 1337);
const entities = new Entities(world, { heightScale: HEIGHT_SCALE });
scene.add(entities.group);

const state = {
  tool: 'paint',
  biome: 4,
  powerId: 'spawnHumans',
  brush: 26,
  speed: 1,
  cultureId: null,
  painting: false,
  orbiting: false,
  lastX: 0, lastY: 0,
};

// ---------------------------------------------------------------- camera

const cam = { theta: 0.6, phi: 1.15, dist: 3.1 };
const target = new THREE.Vector3();

function applyCamera() {
  const s = Math.sin(cam.phi);
  camera.position.set(
    cam.dist * s * Math.cos(cam.theta),
    cam.dist * Math.cos(cam.phi),
    cam.dist * s * Math.sin(cam.theta)
  );
  camera.lookAt(target);
  planet.setCamPos(camera.position);
  sunLight.position.copy(sunDir).multiplyScalar(10);
}

const sunDir = new THREE.Vector3();

// ---------------------------------------------------------------- picking

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
const PROBE = [1 + HEIGHT_SCALE * 0.9, 1 + HEIGHT_SCALE * 0.5, 1 + HEIGHT_SCALE * 0.15, 1];

function pick(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  for (const R of PROBE) {
    const b = 2 * (o.x * d.x + o.y * d.y + o.z * d.z);
    const c = o.lengthSq() - R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / 2;
    if (t <= 0) continue;
    return hit.copy(d).multiplyScalar(t).add(o).normalize();
  }
  return null;
}

function nearestSettlement(u, v, maxD2 = 0.0025) {
  let best = null, bd = maxD2;
  for (const s of sim.settlements) {
    let dx = s.u - u; if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
    const d = dx * dx + (s.v - v) * (s.v - v);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ---------------------------------------------------------------- input

const el = renderer.domElement;
el.addEventListener('contextmenu', (e) => e.preventDefault());

el.addEventListener('pointerdown', (e) => {
  el.setPointerCapture(e.pointerId);
  state.lastX = e.clientX; state.lastY = e.clientY;
  if (e.button === 0 && (state.tool === 'paint' || state.tool === 'power' || state.tool === 'inspect')) {
    state.painting = true;
    act(e.clientX, e.clientY);
  } else {
    state.orbiting = true;
  }
});

el.addEventListener('pointermove', (e) => {
  if (state.painting && state.tool === 'paint') { act(e.clientX, e.clientY); }
  else if (state.orbiting) {
    cam.theta -= (e.clientX - state.lastX) * 0.005;
    cam.phi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.phi - (e.clientY - state.lastY) * 0.005));
    applyCamera();
  }
  state.lastX = e.clientX; state.lastY = e.clientY;
  hover(e.clientX, e.clientY);
});

function endPointer(e) {
  state.painting = false; state.orbiting = false;
  if (e && e.pointerId != null && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);

el.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = Math.max(1.22, Math.min(12, cam.dist * Math.exp(e.deltaY * 0.0011)));
  applyCamera();
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- actions

function act(cx, cy) {
  const p = pick(cx, cy);
  if (!p) return;
  const [u, v] = pointToUV(p);

  if (state.tool === 'paint') {
    if (world.paint(u, v, state.brush, state.biome, 0.55)) world.dirty();
    return;
  }
  if (state.tool === 'power') {
    const pow = POWER_BY_ID[state.powerId];
    if (!pow) return;
    if (sim.faith < pow.cost) { ui.toast(`Not enough faith — ${pow.name} costs ${pow.cost}.`); return; }
    if (!sim.spendFaith(pow.cost)) return;
    pow.apply(sim, u, v);
    return;
  }
  if (state.tool === 'inspect') {
    const s = nearestSettlement(u, v);
    if (s) { state.cultureId = s.cultureId; ui.renderPeoples(); focusSettlement(s); }
    else ui.toast('Nothing is settled there.');
  }
}

let hoverThrottle = 0;
function hover(cx, cy) {
  const now = performance.now();
  if (now - hoverThrottle < 60) return;
  hoverThrottle = now;
  const p = pick(cx, cy);
  if (!p) { ui.cursor(''); return; }
  const [u, v] = pointToUV(p);
  const s = world.sample(u, v);
  const b = biomeAt(s.biome);
  const elev = Math.round((s.height - SEA_BYTE) * 90);
  let text = `${b.name} · ${elev >= 0 ? '+' : ''}${elev} m`;
  const near = nearestSettlement(u, v, 0.0012);
  if (near) {
    const c = sim.culture(near.cultureId);
    text = `${near.name} · ${Math.round(near.pop).toLocaleString('en-US')} people · ${c ? ERAS[c.eraIndex].name : ''}`;
  }
  ui.cursor(text);
}

function focusSettlement(s) {
  cam.phi = Math.max(0.08, Math.min(Math.PI - 0.08, s.v * Math.PI));
  cam.theta = (s.u - 0.5) * Math.PI * 2;
  cam.dist = 1.5;
  applyCamera();
}

// ---------------------------------------------------------------- UI

const ui = createUI({
  world, sim, state,
  actions: {
    usePreset(id) {
      world.generate(id, parseInt(document.getElementById('seed').value, 10) || 1337);
      sim.settlements.length = 0;
      sim.cultures.length = 0;
      sim.prayers.length = 0;
      sim._dirty();
      sim.note(`A new world takes shape: ${id}.`);
      document.getElementById('intro').hidden = true;
    },
    clearWorld() {
      world.clearToWater();
      sim.settlements.length = 0; sim.cultures.length = 0; sim.prayers.length = 0;
      sim._dirty();
      sim.note('The world is nothing but clear water again.');
    },
    closeIntro() { document.getElementById('intro').hidden = true; },
    grantTrait: (cid, t) => grantTrait(sim, cid, t),
    giveCommandment: (cid, c) => giveCommandment(sim, cid, c),
    sealCovenant: (cid, c) => sealCovenant(sim, cid, c),
    answerPrayer: (id) => sim.answerPrayer(id),
    refusePrayer: (id) => sim.refusePrayer(id),
    focusSettlement,
    save() { return saveLocal(world, sim); },
    load() { return loadLocal(world, sim); },
    export() { exportFile(world, sim); },
    import(file) { return importFile(file, world, sim); },
    wipe() {
      clearLocal();
      world.clearToWater();
      sim.settlements.length = 0; sim.cultures.length = 0; sim.prayers.length = 0;
      sim.log.length = 0; sim.faith = 200; sim.year = ERAS[0].from;
      sim._dirty();
      document.getElementById('intro').hidden = false;
    },
  },
});

// Touch has no right button, so start those users in orbit mode.
if (window.matchMedia('(pointer: coarse)').matches) {
  state.tool = 'orbit';
  ui.setTool('orbit');
}

// ---------------------------------------------------------------- boot

world.generate('earth', 1337);
sim.note('A world of clear water, waiting.');
applyCamera();

// ---------------------------------------------------------------- loop

// One simulated year per substep. Logistic growth at r=0.03 is unconditionally stable
// at this step, and keeping the step large bounds the per-frame cost at high time-warp.
// Substeps are capped hard: the simulation costs ~0.6ms per step at a few hundred
// settlements, so an unbounded step count would eat the frame budget at high time-warp.
// Dropping substeps slows the in-game clock on slow machines; it never stalls rendering.
const MAX_SUBTICK = 2.0;
const MAX_STEPS = 5;

let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;
let uiTimer = 0;

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Day cycle — slow enough to be pleasant, fast enough to see the terminator move.
  const sunAngle = now * 0.00004;
  sunDir.set(Math.cos(sunAngle), 0.28, Math.sin(sunAngle)).normalize();
  planet.setSunDir(sunDir);
  sunLight.position.copy(sunDir).multiplyScalar(10);

  // Simulation, on a fixed substep, decoupled from the framerate.
  let budget = state.speed * dt;
  let steps = 0;
  while (budget > 0 && steps < MAX_STEPS) {
    const step = Math.min(MAX_SUBTICK, budget);
    sim.tick(step);
    budget -= step;
    steps++;
  }

  entities.update(sim, dt, now / 1000);
  renderer.render(scene, camera);

  fpsAcc += dt; fpsFrames++; fpsTimer += dt; uiTimer += dt;
  if (fpsTimer > 0.5) {
    document.getElementById('r-fps').textContent = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
  }
  if (uiTimer > 0.2) { ui.refresh(); uiTimer = 0; }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Expose a little for debugging from the console.
window.WORLDSIM = { world, sim, entities, state, formatYear };
