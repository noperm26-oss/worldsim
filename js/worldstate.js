// worldstate.js — the planet's state lives in two data textures.
//
// The whole world is an equirectangular grid (W x H texels) holding a height byte and a
// biome byte. The GPU reads these in the vertex/fragment shaders, so terrain is
// displaced on the GPU and the CPU never rebuilds geometry. Painting writes texels and
// flags an upload. (DESIGN.md §11)

import * as THREE from 'three';
import { BIOMES, biomeIndex, SEA_BYTE } from './biomes.js';

// ---------------------------------------------------------------- noise (3D, seamless)
// 3D value noise sampled on the unit sphere, so there are no poles pinch or seams.

function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1442695041) ^ Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix,     iy,     iz,     seed);
  const c100 = hash3(ix + 1, iy,     iz,     seed);
  const c010 = hash3(ix,     iy + 1, iz,     seed);
  const c110 = hash3(ix + 1, iy + 1, iz,     seed);
  const c001 = hash3(ix,     iy,     iz + 1, seed);
  const c101 = hash3(ix + 1, iy,     iz + 1, seed);
  const c011 = hash3(ix,     iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

function fbm3(x, y, z, octaves, seed) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- sphere <-> texel
// Mirrors exactly the math in the vertex shader, so a raycast hit maps to the texel
// the GPU is actually shading.

export function pointToUV(p) {
  const u = Math.atan2(p.z, p.x) / (2 * Math.PI) + 0.5;
  const v = Math.acos(Math.max(-1, Math.min(1, p.y))) / Math.PI;
  return [u, v];
}

export function uvToPoint(u, v, out) {
  const theta = v * Math.PI;
  const phi = (u - 0.5) * 2 * Math.PI;
  const s = Math.sin(theta);
  return out.set(s * Math.cos(phi), Math.cos(theta), s * Math.sin(phi));
}

// ---------------------------------------------------------------- world state

export class WorldState {
  constructor(w = 1024, h = 512) {
    this.W = w;
    this.H = h;
    this.height = new Uint8Array(w * h);
    this.biome = new Uint8Array(w * h);
    this.seed = 1337;

    // RGBA8 so we stay on universally supported formats.
    this.heightBuf = new Uint8Array(w * h * 4);
    this.biomeBuf = new Uint8Array(w * h * 4);

    this.heightTex = new THREE.DataTexture(this.heightBuf, w, h, THREE.RGBAFormat);
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.wrapS = THREE.RepeatWrapping;   // wrap the longitude seam
    this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.generateMipmaps = false;

    this.biomeTex = new THREE.DataTexture(this.biomeBuf, w, h, THREE.RGBAFormat);
    this.biomeTex.minFilter = THREE.NearestFilter; // crisp biome borders, no colour bleed
    this.biomeTex.magFilter = THREE.NearestFilter;
    this.biomeTex.wrapS = THREE.RepeatWrapping;
    this.biomeTex.wrapT = THREE.ClampToEdgeWrapping;
    this.biomeTex.generateMipmaps = false;

    this.clearToWater();
  }

  clearToWater() {
    const deep = biomeIndex('deepOcean');
    this.height.fill(30);
    this.biome.fill(deep);
    this.flush();
  }

  flush() {
    const n = this.W * this.H;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      this.heightBuf[j] = this.height[i];
      this.heightBuf[j + 1] = 0;
      this.heightBuf[j + 2] = 0;
      this.heightBuf[j + 3] = 255;
      this.biomeBuf[j] = this.biome[i];
      this.biomeBuf[j + 1] = 0;
      this.biomeBuf[j + 2] = 0;
      this.biomeBuf[j + 3] = 255;
    }
    this.heightTex.needsUpdate = true;
    this.biomeTex.needsUpdate = true;
  }

  sample(u, v) {
    const x = (((Math.floor(u * this.W) % this.W) + this.W) % this.W);
    const y = Math.max(0, Math.min(this.H - 1, Math.floor(v * this.H)));
    const i = y * this.W + x;
    return { height: this.height[i], biome: this.biome[i] };
  }

  // Paint a soft disc of biome at (u,v). `radius` is in texels.
  paint(u, v, radius, biomeId, strength = 1) {
    const b = BIOMES[biomeId];
    if (!b) return false;
    const W = this.W, H = this.H;
    const cx = u * W;
    const cy = Math.max(0, Math.min(H - 1, v * H));
    const r = Math.max(1, radius);
    const r2 = r * r;
    let touched = false;

    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const y = Math.round(cy) + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = (((Math.round(cx) + dx) % W) + W) % W;   // wrap longitude
        const i = y * W + x;

        // Smooth falloff so repeated strokes build up instead of stamping.
        const fall = 1 - Math.sqrt(d2) / r;
        const k = Math.min(1, strength * fall * fall);

        // Height eases toward the biome's natural elevation with a little relief.
        const nz = noise3(x * 0.05, y * 0.05, this.seed * 0.01, this.seed);
        const target = b.base + (nz - 0.5) * 2 * b.relief;
        this.height[i] = Math.max(0, Math.min(255, Math.round(this.height[i] + (target - this.height[i]) * k)));

        // Biome flips once the stroke is committed enough to read as intentional.
        if (k > 0.35) this.biome[i] = biomeId;

        // Keep the GPU buffers in sync per texel so we never rebuild the whole thing.
        const j = i * 4;
        this.heightBuf[j] = this.height[i];
        this.biomeBuf[j] = this.biome[i];
        touched = true;
      }
    }
    return touched;
  }

  // Flag only — the buffers are already current because paint() writes them directly.
  dirty() {
    this.heightTex.needsUpdate = true;
    this.biomeTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- world presets
  // Six built-in biome set-ups (DESIGN.md §4). Each writes height + biome directly,
  // and every one stays fully editable afterwards — presets and hand-painting touch the
  // same arrays.

  generate(presetId, seed = 1337) {
    this.seed = seed;
    const W = this.W, H = this.H;
    const p = new THREE.Vector3();

    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const lat = Math.abs(90 - v * 180);          // 0 at equator, 90 at poles
      const south = v > 0.5;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        uvToPoint(u, v, p);

        // Continental shape — 3D noise on the sphere, so no seam and no pole pinch.
        const cont = fbm3(p.x * 1.6, p.y * 1.6, p.z * 1.6, 6, seed);
        const detail = fbm3(p.x * 7, p.y * 7, p.z * 7, 4, seed + 7);
        const moist = fbm3(p.x * 2.6 + 11, p.y * 2.6 + 11, p.z * 2.6 + 11, 4, seed + 31);
        const ridge = fbm3(p.x * 3.4 - 5, p.y * 3.4 - 5, p.z * 3.4 - 5, 5, seed + 57);

        const i = y * W + x;
        const r = applyPreset(presetId, { lat, south, cont, detail, moist, ridge });
        this.height[i] = r.h;
        this.biome[i] = r.b;
      }
    }
    this.flush();
  }
}

const idx = (k) => biomeIndex(k);

function applyPreset(id, n) {
  const { lat, south, cont, detail, moist, ridge } = n;

  // Elevation: continental noise sets land vs sea, detail adds relief.
  const land = (cont - 0.5) * 2;                    // -1..1
  let h;
  let b;

  switch (id) {
    case 'earth': {
      // Antarctica is a continent and the Arctic is pack ice, so both polar caps are
      // forced to exist rather than left to noise. This is what makes the preset read
      // as "Earth right now".
      const antarctic = south && lat > 70;
      const arctic = !south && lat > 82;
      const polar = antarctic || arctic;

      h = land > 0.02
        ? SEA_BYTE + 8 + land * 90 + detail * 22
        : 30 + Math.max(0, land + 1) * 55;
      if (polar) h = Math.max(h, SEA_BYTE + 8);     // ice sits proud of the water

      if (!polar && land <= 0.02) { b = idx(h > 90 ? 'shallowSea' : 'deepOcean'); break; }
      if (polar) { b = idx('permafrost'); break; }

      if (ridge > 0.66) { b = idx(ridge > 0.80 ? 'snowPeak' : 'mountain'); break; }

      // Latitude bands give Earth its recognisable character.
      if (lat > 64) b = idx('tundra');
      else if (lat > 50) b = idx(moist > 0.5 ? 'taiga' : 'tundra');
      else if (lat > 34) b = idx(moist > 0.55 ? 'temperateForest' : moist > 0.42 ? 'birchForest' : 'grassland');
      else if (lat > 21) b = idx(moist < 0.40 ? 'desert' : moist < 0.50 ? 'savanna' : 'grassland');
      else if (lat > 9)  b = idx(moist > 0.55 ? 'rainforest' : 'savanna');
      else b = idx(moist > 0.58 ? 'rainforest' : moist < 0.40 ? 'swamp' : 'rainforest');

      if (h < SEA_BYTE + 4) b = idx('beach');
      break;
    }

    case 'ice': {
      h = land > 0.00 ? SEA_BYTE + 6 + land * 70 + detail * 18 : 30 + Math.max(0, land + 1) * 50;
      if (land <= 0.00) { b = idx(h > 92 ? 'shallowSea' : 'deepOcean'); break; }
      if (ridge > 0.70) { b = idx('snowPeak'); break; }
      if (lat > 34) b = idx('permafrost');
      else if (lat > 20) b = idx('tundra');
      else b = idx(moist > 0.6 ? 'taiga' : 'grassland');
      break;
    }

    case 'desert': {
      h = land > -0.04 ? SEA_BYTE + 6 + (land + 0.04) * 80 + detail * 16 : 30 + Math.max(0, land + 1) * 55;
      if (land <= -0.04) { b = idx(h > 92 ? 'shallowSea' : 'deepOcean'); break; }
      if (ridge > 0.72) { b = idx('mountain'); break; }
      // Oases: wherever moisture spikes, life survives.
      if (moist > 0.68) b = idx('grassland');
      else if (moist > 0.60) b = idx('savanna');
      else if (moist < 0.30) b = idx('wasteland');
      else b = idx('desert');
      break;
    }

    case 'jungle': {
      h = land > -0.10 ? SEA_BYTE + 6 + (land + 0.10) * 70 + detail * 20 : 30 + Math.max(0, land + 1) * 55;
      if (land <= -0.10) { b = idx(h > 92 ? 'shallowSea' : 'deepOcean'); break; }
      if (h < SEA_BYTE + 5) { b = idx('beach'); break; }
      if (ridge > 0.79) { b = idx('snowPeak'); break; }
      if (ridge > 0.70) { b = idx('mountain'); break; }
      if (moist < 0.36) b = idx('swamp');
      else if (moist > 0.66) b = idx('rainforest');
      else b = idx(lat > 45 ? 'temperateForest' : 'flowerMeadow');
      break;
    }

    case 'volcanic': {
      h = land > -0.06 ? SEA_BYTE + 10 + (land + 0.06) * 100 + detail * 26 : 30 + Math.max(0, land + 1) * 50;
      if (land <= -0.06) { b = idx(h > 92 ? 'shallowSea' : 'deepOcean'); break; }
      if (ridge > 0.62) b = idx(ridge > 0.78 ? 'volcanic' : 'mountain');
      else if (moist > 0.62) b = idx('rainforest');
      else if (moist > 0.50) b = idx('grassland');
      else b = idx('wasteland');
      break;
    }

    case 'archipelago': {
      // Sea level sits high, so only the noise peaks break the surface.
      h = land > 0.16 ? SEA_BYTE + 4 + (land - 0.16) * 130 + detail * 14 : 30 + Math.max(0, land + 1) * 60;
      if (land <= 0.16) { b = idx(h > 95 ? 'shallowSea' : 'deepOcean'); break; }
      if (ridge > 0.76) { b = idx('volcanic'); break; }
      if (h < SEA_BYTE + 9) b = idx('beach');
      else if (moist > 0.60) b = idx('rainforest');
      else if (moist > 0.45) b = idx('grassland');
      else b = idx('savanna');
      break;
    }

    default: {
      h = 30;
      b = idx('deepOcean');
    }
  }

  return { h: Math.max(0, Math.min(255, Math.round(h))), b };
}

export const PRESETS = [
  { id: 'earth',      name: 'Earth Today', blurb: 'Antarctic ice, Sahara, Amazon, taiga — the world as it is now' },
  { id: 'ice',        name: 'Ice World',   blurb: 'Glaciers at the poles, wide tundra, no true tropics' },
  { id: 'desert',     name: 'Desert World',blurb: 'Arid almost everywhere, oases clinging to water' },
  { id: 'jungle',     name: 'Jungle World', blurb: 'Rainforest blanket, heavy rain, no ice anywhere' },
  { id: 'volcanic',   name: 'Volcanic World', blurb: 'Lava fields, ash plains, thin but fertile soil' },
  { id: 'archipelago',name: 'Archipelago', blurb: 'Open ocean, thousands of small islands' },
];

export { SEA_BYTE };
