// planet.js — the planet: GPU-displaced terrain, ocean, atmosphere, stars.
//
// Terrain is a single sphere whose vertices are pushed outward by the height texture in
// the vertex shader, so the CPU never rebuilds geometry. Normals are re-derived from
// neighbouring height samples so mountains actually catch light.

import * as THREE from 'three';
import { BIOMES, SEA_NORM } from './biomes.js';

// ---------------------------------------------------------------- palette texture

export function makePaletteTexture() {
  const size = 32;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const b = BIOMES[i];
    if (!b) { data[i * 4 + 3] = 255; continue; }
    // Authored as sRGB; converted to linear in the shader.
    data[i * 4 + 0] = Math.round(b.color[0] * 255);
    data[i * 4 + 1] = Math.round(b.color[1] * 255);
    data[i * 4 + 2] = Math.round(b.color[2] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- shaders

const TERRAIN_VERT = /* glsl */ `
  uniform sampler2D heightTex;
  uniform sampler2D biomeTex;
  uniform float uSeaNorm;
  uniform float uHeightScale;
  uniform float uTexelU;
  uniform float uTexelV;

  varying vec3  vNormalW;
  varying vec3  vPosW;
  varying float vBiome;
  varying float vHeight;

  const float PI = 3.14159265359;

  void main() {
    vec3 n = normalize(position);

    // Same mapping as pointToUV() in worldstate.js — must stay in sync.
    float u = atan(n.z, n.x) / (2.0 * PI) + 0.5;
    float v = acos(clamp(n.y, -1.0, 1.0)) / PI;

    float h  = texture2D(heightTex, vec2(u, v)).r;
    float bm = texture2D(biomeTex,  vec2(u, v)).r;
    vBiome  = bm;
    vHeight = h;

    vec3 displaced = position + n * (h - uSeaNorm) * uHeightScale;

    // Re-derive the normal from neighbouring samples so relief reads in the lighting.
    float hl = texture2D(heightTex, vec2(u - uTexelU, v)).r;
    float hr = texture2D(heightTex, vec2(u + uTexelU, v)).r;
    float hd = texture2D(heightTex, vec2(u, v - uTexelV)).r;
    float hu = texture2D(heightTex, vec2(u, v + uTexelV)).r;

    vec3 up = abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 east = normalize(cross(up, n));
    vec3 north = cross(n, east);

    float sinT = max(sqrt(max(0.0, 1.0 - n.y * n.y)), 0.08);
    float dU = uTexelU * 2.0 * sinT;   // world distance per texel eastward
    float dV = uTexelV * PI;           // world distance per texel northward

    float gE = (hr - hl) * uHeightScale / max(dU, 1e-4);
    float gN = (hu - hd) * uHeightScale / max(dV, 1e-4);

    vec3 tilted = normalize(n - east * gE - north * gN);

    vNormalW = normalize(mat3(modelMatrix) * tilted);
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TERRAIN_FRAG = /* glsl */ `
  uniform sampler2D uPalette;
  uniform vec3  uSunDir;
  uniform float uPaletteSize;

  varying vec3  vNormalW;
  varying vec3  vPosW;
  varying float vBiome;
  varying float vHeight;

  void main() {
    vec3 srgb = texture2D(uPalette, vec2((vBiome * 255.0 + 0.5) / uPaletteSize, 0.5)).rgb;
    vec3 base = pow(srgb, vec3(2.2));           // sRGB -> linear for lighting

    vec3 N = normalize(vNormalW);
    float ndl = dot(N, normalize(uSunDir));
    float day = smoothstep(-0.18, 0.30, ndl);

    // Warm the light near the terminator so dawn/dusk reads as dawn/dusk.
    vec3 lightCol = mix(vec3(1.0, 0.55, 0.30), vec3(1.0, 0.98, 0.94), smoothstep(0.0, 0.4, ndl));

    vec3 col = base * (vec3(0.055, 0.07, 0.11) + lightCol * day * 1.05);

    // High rock gets a touch of snow regardless of painted biome.
    float snow = smoothstep(0.86, 0.97, vHeight);
    col = mix(col, vec3(0.95) * (0.25 + day), snow * 0.7);

    gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
  }
`;

const WATER_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uCamPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCamPos - vPosW);
    vec3 L = normalize(uSunDir);

    float ndl = dot(N, L);
    float day = smoothstep(-0.20, 0.35, ndl);

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    vec3 deep = vec3(0.02, 0.11, 0.28);
    vec3 shal = vec3(0.06, 0.30, 0.48);
    vec3 col = mix(deep, shal, fres * 0.85);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * day * 0.9;

    col = col * (0.20 + 1.15 * day) + vec3(1.0, 0.95, 0.85) * spec;
    col = col + vec3(0.35, 0.55, 0.95) * fres * 0.10 * day;

    gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 0.94);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uCamPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCamPos - vPosW);
    // BackSide sphere: the rim glow is strongest where we look across the shell.
    float rim = pow(1.0 - abs(dot(N, V)), 2.6);
    float lit = smoothstep(-0.45, 0.35, dot(N, normalize(uSunDir)));
    vec3 col = mix(vec3(0.15, 0.30, 0.75), vec3(0.45, 0.70, 1.0), lit);
    gl_FragColor = vec4(col * rim * (0.25 + lit * 1.1), rim * (0.15 + lit * 0.75));
  }
`;

// ---------------------------------------------------------------- assembly

export function buildPlanet(world, opts = {}) {
  const radius = opts.radius ?? 1;
  const heightScale = opts.heightScale ?? 0.14;
  const group = new THREE.Group();

  const palette = makePaletteTexture();

  const terrainMat = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    uniforms: {
      heightTex:   { value: world.heightTex },
      biomeTex:    { value: world.biomeTex },
      uPalette:    { value: palette },
      uSunDir:     { value: new THREE.Vector3(1, 0.25, 0.4).normalize() },
      uSeaNorm:    { value: SEA_NORM },
      uHeightScale:{ value: heightScale },
      uTexelU:     { value: 1 / world.W },
      uTexelV:     { value: 1 / world.H },
      uPaletteSize:{ value: 32 },
    },
  });

  const terrain = new THREE.Mesh(new THREE.SphereGeometry(radius, 288, 180), terrainMat);
  terrain.name = 'terrain';
  group.add(terrain);

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uSunDir: terrainMat.uniforms.uSunDir,
      uCamPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
  });
  const water = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 80), waterMat);
  water.renderOrder = 1;
  group.add(water);

  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    uniforms: {
      uSunDir: terrainMat.uniforms.uSunDir,
      uCamPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.075, 64, 48), atmoMat);
  atmosphere.renderOrder = 2;
  group.add(atmosphere);

  group.add(buildStars(90, 3500));

  return {
    group, terrain, water, atmosphere, terrainMat, waterMat, atmoMat,
    setSunDir(v) { terrainMat.uniforms.uSunDir.value.copy(v).normalize(); },
    setCamPos(v) {
      waterMat.uniforms.uCamPos.value.copy(v);
      atmoMat.uniforms.uCamPos.value.copy(v);
    },
  };
}

function buildStars(radius, count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const s = Math.sin(v);
    pos[i * 3] = radius * s * Math.cos(u);
    pos[i * 3 + 1] = radius * Math.cos(v);
    pos[i * 3 + 2] = radius * s * Math.sin(u);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}
