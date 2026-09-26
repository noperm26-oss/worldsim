// render-entities.js — everything alive, drawn with instancing.
//
// One draw call each for humans, animals and buildings. Agents are a bounded *sample*
// drawn from settlement populations (js/sim.js), not one object per person, which is how
// a world of billions still renders at 60fps.

import * as THREE from 'three';
import { ERAS } from './eras.js';
import { biomeAt, SEA_BYTE, SEA_NORM } from './biomes.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 3D position of the terrain surface at (u,v), matching the vertex shader's displacement. */
export function surfacePoint(world, u, v, out, heightScale = 0.14) {
  const theta = v * Math.PI;
  const phi = (u - 0.5) * 2 * Math.PI;
  const st = Math.sin(theta);
  const s = world.sample(u, v);
  const r = 1 + (s.height / 255 - SEA_NORM) * heightScale;
  return out.set(r * st * Math.cos(phi), r * Math.cos(theta), r * st * Math.sin(phi));
}

export class Entities {
  constructor(world, opts = {}) {
    this.world = world;
    this.heightScale = opts.heightScale ?? 0.14;
    this.maxAgents = opts.maxAgents ?? 2600;
    this.maxBuildings = opts.maxBuildings ?? 14000;

    this.group = new THREE.Group();

    // --- humans: a simple two-part figure reads better than a dot at any distance
    const body = new THREE.CapsuleGeometry(0.0032, 0.0075, 3, 6);
    this.humanMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.humans = new THREE.InstancedMesh(body, this.humanMat, this.maxAgents);
    this.humans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.humans.count = 0;
    this.humans.frustumCulled = false;
    this.group.add(this.humans);

    // --- animals
    const beast = new THREE.BoxGeometry(0.006, 0.0045, 0.010);
    this.animalMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.animals = new THREE.InstancedMesh(beast, this.animalMat, 1400);
    this.animals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.animals.count = 0;
    this.animals.frustumCulled = false;
    this.group.add(this.animals);

    // --- buildings: one box per structure, styled by the culture's era
    const brick = new THREE.BoxGeometry(1, 1, 1);
    brick.translate(0, 0.5, 0);                       // grow upward from the ground
    this.buildMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.buildings = new THREE.InstancedMesh(brick, this.buildMat, this.maxBuildings);
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.buildings.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxBuildings * 3), 3);
    this.buildings.count = 0;
    this.buildings.frustumCulled = false;
    this.group.add(this.buildings);

    // --- markers for the player: capital rings and the origin
    const ring = new THREE.RingGeometry(0.010, 0.0135, 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd479, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
      depthTest: false,
    });
    this.rings = new THREE.InstancedMesh(ring, this.ringMat, 220);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 5;
    this.group.add(this.rings);

    this.animalSeeds = [];
    for (let i = 0; i < 1400; i++) {
      this.animalSeeds.push({
        u: Math.random(), v: Math.random(), phase: Math.random() * 100, speed: 0.002 + Math.random() * 0.006,
      });
    }

    this._acc = 0;
  }

  /** Rebuild every instance buffer from the simulation. */
  update(sim, dt, now) {
    this._acc += dt;
    const slow = this._acc > 0.12;          // agents wander smoothly; layout refreshes rarely
    if (slow) this._acc = 0;

    this._buildBuildings(sim);
    this._buildHumans(sim, now, slow);
    this._buildAnimals(sim, now);
    this._buildRings(sim);
  }

  _orient(u, v, outPos) {
    surfacePoint(this.world, u, v, outPos, this.heightScale);
    _n.copy(outPos).normalize();
    return _n;
  }

  _buildHumans(sim, now, full) {
    const total = sim.population;
    let i = 0;
    if (total <= 0) { this.humans.count = 0; return; }

    for (const s of sim.settlements) {
      if (i >= this.maxAgents) break;
      const c = sim.culture(s.cultureId);
      if (!c) continue;
      // Sample proportional to population, with a floor so tiny camps are still visible.
      let n = Math.round((s.pop / total) * this.maxAgents);
      if (s.pop > 1) n = Math.max(n, 2);
      n = Math.min(n, this.maxAgents - i, 90);

      const era = ERAS[c.eraIndex] || ERAS[0];
      _c.setHex(c.color);

      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + s.id * 0.7;
        const rr = 0.004 + 0.012 * Math.sqrt((k + 0.5) / n) * Math.min(2.4, 0.6 + Math.log10(Math.max(10, s.pop)) * 0.22);
        const wob = full ? Math.sin(now * 2 + k * 1.7 + s.id) * 0.0006 : 0;
        const u = (s.u + Math.cos(a) * rr + 1) % 1;
        const v = Math.max(0.015, Math.min(0.985, s.v + Math.sin(a) * rr));

        const nrm = this._orient(u, v, _p);
        _p.addScaledVector(nrm, 0.004 + wob);
        _q.setFromUnitVectors(UP, nrm);
        const sc = 0.8 + (era.index * 0.03);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        this.humans.setMatrixAt(i, _m);
        this.humans.setColorAt(i, _c);
        i++;
      }
    }
    this.humans.count = i;
    this.humans.instanceMatrix.needsUpdate = true;
    if (this.humans.instanceColor) this.humans.instanceColor.needsUpdate = true;
  }

  _buildAnimals(sim, now) {
    let i = 0;
    const seeds = this.animalSeeds;
    for (let k = 0; k < seeds.length; k++) {
      if (i >= 1400) break;
      const a = seeds[k];
      // Wander, but only occupy habitable land — animals follow the biomes.
      const u = (a.u + Math.sin(now * a.speed + a.phase) * 0.03 + 1) % 1;
      const v = Math.max(0.02, Math.min(0.98, a.v + Math.cos(now * a.speed * 0.8 + a.phase) * 0.02));
      const s = this.world.sample(u, v);
      if (s.height <= SEA_BYTE) continue;
      const b = biomeAt(s.biome);
      if (b.fertility < 0.12 || b.cost > 3) continue;

      const nrm = this._orient(u, v, _p);
      _p.addScaledVector(nrm, 0.0025);
      _q.setFromUnitVectors(UP, nrm);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      this.animals.setMatrixAt(i, _m);
      // Coat colour tracks the biome: grey on rock, brown in forest, pale on tundra.
      _c.setRGB(
        0.34 + b.color[0] * 0.45,
        0.28 + b.color[1] * 0.42,
        0.24 + b.color[2] * 0.38
      );
      this.animals.setColorAt(i, _c);
      i++;
      if (i >= 1400) break;
    }
    this.animals.count = i;
    this.animals.instanceMatrix.needsUpdate = true;
    if (this.animals.instanceColor) this.animals.instanceColor.needsUpdate = true;
  }

  _buildBuildings(sim) {
    let i = 0;
    for (const s of sim.settlements) {
      if (i >= this.maxBuildings) break;
      const c = sim.culture(s.cultureId);
      if (!c || s.pop < 2) continue;
      const era = ERAS[c.eraIndex] || ERAS[0];
      const bs = era.build;

      const n = Math.min(bs.count, 2 + Math.floor(Math.log10(Math.max(10, s.pop)) * 3.2));
      _c.setHex(bs.body);

      for (let k = 0; k < n; k++) {
        if (i >= this.maxBuildings) break;
        const a = (k / n) * Math.PI * 2 + s.id * 1.3;
        const rr = 0.003 + 0.016 * Math.sqrt((k + 0.5) / n);
        const u = (s.u + Math.cos(a) * rr + 1) % 1;
        const v = Math.max(0.015, Math.min(0.985, s.v + Math.sin(a) * rr));

        const nrm = this._orient(u, v, _p);
        _p.addScaledVector(nrm, -0.001);
        _q.setFromUnitVectors(UP, nrm);

        // Taller and denser as the era advances; the centre plot is the keep.
        const central = k === 0;
        const h = (central ? 0.016 : 0.008) * bs.scale * (0.7 + ((k * 37) % 10) / 16);
        const w = (central ? 0.0055 : 0.004) * bs.scale;
        _s.set(w, h, w);
        _m.compose(_p, _q, _s);
        this.buildings.setMatrixAt(i, _m);
        this.buildings.setColorAt(i, central ? _c.setHex(bs.roof) : _c.setHex(bs.body));
        i++;
      }
    }
    this.buildings.count = i;
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  _buildRings(sim) {
    let i = 0;
    for (const s of sim.settlements) {
      if (i >= 220) break;
      if (s.pop < 2000) continue;                 // only towns and up get a marker
      const nrm = this._orient(s.u, s.v, _p);
      _p.addScaledVector(nrm, 0.004);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      const sc = 1 + Math.min(2.2, Math.log10(Math.max(10, s.pop)) * 0.22);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.rings.setMatrixAt(i, _m);
      i++;
    }
    this.rings.count = i;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.humans.geometry.dispose(); this.humanMat.dispose();
    this.animals.geometry.dispose(); this.animalMat.dispose();
    this.buildings.geometry.dispose(); this.buildMat.dispose();
    this.rings.geometry.dispose(); this.ringMat.dispose();
  }
}
