// main.js — scene, camera, painting, UI.

import * as THREE from 'three';
import { WorldState, PRESETS, pointToUV, SEA_BYTE } from './worldstate.js';
import { buildPlanet } from './planet.js';
import { BIOMES, biomeIndex, biomeAt } from './biomes.js';

// ---------------------------------------------------------------- renderer

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 400);

// ---------------------------------------------------------------- world

const world = new WorldState(1024, 512);
const planet = buildPlanet(world);
scene.add(planet.group);

const sun = { angle: 0.6 };
const sunDir = new THREE.Vector3();

// ---------------------------------------------------------------- orbit camera

const cam = { theta: 0.6, phi: 1.15, dist: 3.1, target: new THREE.Vector3(0, 0, 0) };

function applyCamera() {
  const s = Math.sin(cam.phi);
  camera.position.set(
    cam.target.x + cam.dist * s * Math.cos(cam.theta),
    cam.target.y + cam.dist * Math.cos(cam.phi),
    cam.target.z + cam.dist * s * Math.sin(cam.theta)
  );
  camera.lookAt(cam.target);
  planet.setCamPos(camera.position);
}

// ---------------------------------------------------------------- ray -> sphere

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

// Terrain is displaced on the GPU, so the CPU has no exact surface. Probe a few radii
// from the tallest terrain down to sea level and take the first hit — closest wins.
const PROBE_RADII = [1.10, 1.06, 1.03, 1.0];

function pickSphere(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  for (const R of PROBE_RADII) {
    const b = 2 * (o.x * d.x + o.y * d.y + o.z * d.z);
    const c = o.lengthSq() - R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / 2;
    if (t <= 0) continue;
    hitPoint.copy(d).multiplyScalar(t).add(o);
    return hitPoint.normalize();
  }
  return null;
}

// ---------------------------------------------------------------- state

const ui = {
  biome: biomeIndex('grassland'),
  brush: 26,
  mode: 'paint',
  painting: false,
  orbiting: false,
  lastX: 0,
  lastY: 0,
};

function paintAt(clientX, clientY) {
  const p = pickSphere(clientX, clientY);
  if (!p) return;
  const [u, v] = pointToUV(p);
  if (world.paint(u, v, ui.brush, ui.biome, 0.55)) world.dirty();
}

// ---------------------------------------------------------------- input

const el = renderer.domElement;

el.addEventListener('contextmenu', (e) => e.preventDefault());

el.addEventListener('pointerdown', (e) => {
  el.setPointerCapture(e.pointerId);
  ui.lastX = e.clientX;
  ui.lastY = e.clientY;

  const wantsPaint = e.button === 0 && ui.mode === 'paint';
  if (wantsPaint) {
    ui.painting = true;
    paintAt(e.clientX, e.clientY);
  } else {
    ui.orbiting = true;
  }
});

el.addEventListener('pointermove', (e) => {
  if (ui.painting) {
    paintAt(e.clientX, e.clientY);
    updateReadout(e.clientX, e.clientY);
    return;
  }
  if (ui.orbiting) {
    const dx = e.clientX - ui.lastX;
    const dy = e.clientY - ui.lastY;
    ui.lastX = e.clientX;
    ui.lastY = e.clientY;
    cam.theta -= dx * 0.005;
    cam.phi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.phi - dy * 0.005));
    applyCamera();
    return;
  }
  updateReadout(e.clientX, e.clientY);
});

function endPointer(e) {
  if (ui.painting) {
    ui.painting = false;
    refreshLand();
  }
  ui.orbiting = false;
  if (e && e.pointerId != null && el.hasPointerCapture(e.pointerId)) {
    el.releasePointerCapture(e.pointerId);
  }
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);

el.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = Math.max(1.25, Math.min(12, cam.dist * Math.exp(e.deltaY * 0.0011)));
  applyCamera();
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- readout

const rBiome = document.getElementById('r-biome');
const rElev = document.getElementById('r-elev');
const rLand = document.getElementById('r-land');
const rFps = document.getElementById('r-fps');

function updateReadout(cx, cy) {
  const p = pickSphere(cx, cy);
  if (!p) { rBiome.textContent = '—'; rElev.textContent = '—'; return; }
  const [u, v] = pointToUV(p);
  const s = world.sample(u, v);
  const b = biomeAt(s.biome);
  rBiome.textContent = b.name;
  rBiome.style.color = `rgb(${b.color.map((c) => Math.round(c * 255)).join(',')})`;
  const metres = Math.round((s.height - SEA_BYTE) * 90);
  rElev.textContent = `${metres >= 0 ? '+' : ''}${metres} m`;
}

function refreshLand() {
  let land = 0;
  const n = world.height.length;
  for (let i = 0; i < n; i++) if (world.height[i] > SEA_BYTE) land++;
  rLand.textContent = ((land / n) * 100).toFixed(1) + '%';
}

// ---------------------------------------------------------------- UI

const presetsEl = document.getElementById('presets');
PRESETS.forEach((p) => {
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="pname">${p.name}</span><span class="pblurb">${p.blurb}</span>`;
  btn.addEventListener('click', () => {
    world.generate(p.id, parseInt(document.getElementById('seed').value, 10) || 1337);
    markActive(presetsEl, btn);
    refreshLand();
  });
  presetsEl.appendChild(btn);
});

const paletteEl = document.getElementById('palette');
const biomeInfo = document.getElementById('biome-info');
BIOMES.forEach((b, i) => {
  const btn = document.createElement('button');
  btn.style.background = `rgb(${b.color.map((c) => Math.round(c * 255)).join(',')})`;
  btn.title = b.name;
  btn.addEventListener('click', () => selectBiome(i));
  paletteEl.appendChild(btn);
});

function selectBiome(i) {
  ui.biome = i;
  markActive(paletteEl, paletteEl.children[i]);
  const b = biomeAt(i);
  const habitable = b.cost < 90 ? `fertility ${(b.fertility * 100) | 0}% · crossing ×${b.cost}` : 'impassable water';
  biomeInfo.innerHTML = `<b style="color:#fff">${b.name}</b><br>${habitable}`;
}

function markActive(container, btn) {
  for (const c of container.children) c.classList.remove('on');
  btn.classList.add('on');
}

const brushEl = document.getElementById('brush');
const brushVal = document.getElementById('brush-val');
brushEl.addEventListener('input', () => {
  ui.brush = parseInt(brushEl.value, 10);
  brushVal.textContent = ui.brush;
});

const modeBtn = document.getElementById('mode');
modeBtn.addEventListener('click', () => {
  ui.mode = ui.mode === 'paint' ? 'orbit' : 'paint';
  modeBtn.innerHTML = `mode: <b>${ui.mode}</b>`;
  modeBtn.classList.toggle('on', ui.mode === 'orbit');
});

document.getElementById('regen').addEventListener('click', () => {
  const on = presetsEl.querySelector('.on');
  const idxOf = on ? [...presetsEl.children].indexOf(on) : -1;
  const preset = idxOf >= 0 ? PRESETS[idxOf].id : 'earth';
  world.generate(preset, parseInt(document.getElementById('seed').value, 10) || 1337);
  refreshLand();
});

document.getElementById('clear').addEventListener('click', () => {
  world.clearToWater();
  for (const c of presetsEl.children) c.classList.remove('on');
  refreshLand();
});

// Touch devices get no right button, so start them in orbit mode and let them switch.
if (window.matchMedia('(pointer: coarse)').matches) {
  ui.mode = 'orbit';
  modeBtn.innerHTML = 'mode: <b>orbit</b>';
  modeBtn.classList.add('on');
}

// ---------------------------------------------------------------- boot

selectBiome(biomeIndex('grassland'));
world.generate('earth', 1337);
refreshLand();
applyCamera();

// ---------------------------------------------------------------- loop

let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  sun.angle += dt * 0.045;                     // slow day cycle
  sunDir.set(Math.cos(sun.angle), 0.28, Math.sin(sun.angle)).normalize();
  planet.setSunDir(sunDir);

  renderer.render(scene, camera);

  fpsAcc += dt; fpsFrames++; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    rFps.textContent = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
