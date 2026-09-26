// sim.js — the living world: cultures, settlements, population, migration, research,
// war and era advancement.
//
// Two-tier model, and this is the load-bearing decision in the whole game:
//   * a SETTLEMENT carries a population as a number, so the world can genuinely reach
//     billions;
//   * individual AGENTS exist only as a bounded render sample drawn from those numbers.
// Simulating eight billion objects is not possible; simulating eight billion people as
// cohorts and showing a few thousand of them is.
//
// The player never places a building and never founds a town (DESIGN.md §1). Everything
// here is emergent. The only population the player can create directly is the opening
// pair, and later miracles.

import { ERAS, TECHS, techsOfEra, eraIndex, START_YEAR } from './eras.js';
import { biomeAt, SEA_BYTE } from './biomes.js';

// ---------------------------------------------------------------- rng

export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    // xorshift32 — fast, and reproducible, which is what makes the sim testable.
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// ---------------------------------------------------------------- names

const SYL_A = ['ka', 'to', 'ri', 'men', 'sha', 'vo', 'lu', 'dra', 'bel', 'nor', 'ith', 'zar', 'que', 'wan', 'os', 'fel'];
const SYL_B = ['ra', 'din', 'mos', 'tha', 'vek', 'lia', 'gan', 'sor', 'mun', 'tis', 'ova', 'ren', 'duk', 'pha', 'lin'];
const SYL_C = ['a', 'os', 'um', 'ia', 'ar', 'eth', 'on', 'ya', 'us', 'ir'];

function makeName(rng) {
  const n = rng.int(2, 3);
  let s = rng.pick(SYL_A);
  for (let i = 1; i < n; i++) s += rng.pick(SYL_B);
  return s.charAt(0).toUpperCase() + s.slice(1) + rng.pick(SYL_C);
}

// ---------------------------------------------------------------- tuning

// Carrying capacity multiplier per era. This single ladder is what turns a few thousand
// villagers into billions of city-dwellers, and it is anchored to the real population
// curve in DESIGN.md §5.
// Carrying-capacity ladder. Empirically a full 900-settlement world carries ~1M people
// per unit of this multiplier, so the values below are chosen to land on the published
// world-population curve (DESIGN.md §5):
//   10,000 BC ~4M | 3000 BC ~14M | 1200 BC ~50M | 1 AD ~250M | 1000 AD ~310M
//   1500 ~500M | 1700 ~680M | 1800 ~1B | 1900 ~1.65B | 2025 ~8.1B
const K_ERA = {
  wood: 0.4, stone: 6, copper: 20, bronze: 55, iron: 105, classical: 250,
  medievalEarly: 310, medievalHigh: 400, medievalLate: 500, renaissance: 580,
  sail: 680, industrial: 1000, modern: 1800, information: 10500, space: 24000,
};

export const MAX_SETTLEMENTS = 900;
export const MAX_AGENTS = 2600;
const BASE_K = 2000;                 // people per unit of fertility at Stone Age

// Traits you can grant a people with Faith. They bias behaviour; they never automate it.
export const TRAITS = {
  clever:     { name: 'Clever',     research: 1.6, war: 0.9,  growth: 1.0 },
  strong:     { name: 'Strong',     research: 1.0, war: 1.25, growth: 1.1 },
  fierce:     { name: 'Fierce',     research: 0.9, war: 1.9,  growth: 1.0 },
  devout:     { name: 'Devout',     research: 0.95, war: 0.8, growth: 1.0, faith: 2.0 },
  seafaring:  { name: 'Seafaring',  research: 1.1, war: 1.0,  growth: 1.0, sea: true },
  mercantile: { name: 'Mercantile', research: 1.3, war: 0.85, growth: 1.05 },
};

// ---------------------------------------------------------------- helpers

function dist2uv(a, b) {
  // squared angular distance on the sphere, via the chord — cheap and good enough
  let dx = a.u - b.u;
  if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
  const dy = a.v - b.v;
  return dx * dx + dy * dy;
}

export const SETTLEMENT_TIERS = [
  { name: 'Camp',       min: 0 },
  { name: 'Hamlet',     min: 40 },
  { name: 'Village',    min: 200 },
  { name: 'Town',       min: 2000 },
  { name: 'City',       min: 40000 },
  { name: 'Metropolis', min: 1000000 },
  { name: 'Megacity',   min: 10000000 },
];

export function tierOf(pop) {
  let t = SETTLEMENT_TIERS[0];
  for (const x of SETTLEMENT_TIERS) if (pop >= x.min) t = x;
  return t;
}

// ---------------------------------------------------------------- simulation

export class Simulation {
  constructor(world, seed = 1) {
    this.world = world;
    this.rng = new Rng(seed);
    this.year = START_YEAR;
    this.cultures = [];
    this.settlements = [];
    this.prayers = [];
    this.log = [];
    this.faith = 200;
    this.nextId = 1;
    this.dead = 0;
    this.born = 0;
    this.grid = new Map();      // spatial hash: "gx,gy" -> settlement ids
    this._byId = new Map();     // id -> settlement, so lookups are O(1)
    this._culturesById = new Map();
    this.GRID = 40;
    this._reindex();
  }

  // Integer key: string concatenation here was the single biggest per-tick cost.
  _key(u, v) {
    const gx = (((Math.floor(u * this.GRID) % this.GRID) + this.GRID) % this.GRID);
    const gy = Math.max(0, Math.min(this.GRID - 1, Math.floor(v * this.GRID)));
    return gx * 64 + gy;
  }

  /** Invalidate the id/population caches after anything is added or removed. */
  _dirty() { this._reindex(); }

  // -------------------------------------------------------------- querying

  // Deliberately uncached. Powers mutate settlement populations directly, and a cache
  // here made the HUD report stale figures after every meteor or plague.
  get population() {
    let p = 0;
    for (let i = 0; i < this.settlements.length; i++) p += this.settlements[i].pop;
    return p;
  }

  culture(id) { return this._culturesById.get(id); }
  settlement(id) { return this._byId.get(id); }

  _reindex() {
    this.grid.clear();
    this._byId.clear();
    this._culturesById.clear();
    for (const s of this.settlements) {
      this._byId.set(s.id, s);
      const k = this._key(s.u, s.v);
      let b = this.grid.get(k);
      if (!b) { b = []; this.grid.set(k, b); }
      b.push(s.id);
    }
    for (const c of this.cultures) this._culturesById.set(c.id, c);
  }

  // Neighbouring settlements within `radius` in uv space, using the spatial hash so
  // war and trade never cost O(n^2).
  neighbours(s, radius) {
    const out = [];
    const span = Math.ceil(radius * this.GRID);
    const gx0 = Math.floor(s.u * this.GRID), gy0 = Math.floor(s.v * this.GRID);
    const r2 = radius * radius;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const gx = ((gx0 + dx) % this.GRID + this.GRID) % this.GRID;
        const gy = gy0 + dy;
        if (gy < 0 || gy >= this.GRID) continue;
        const bucket = this.grid.get(gx * 64 + gy);
        if (!bucket) continue;
        for (const id of bucket) {
          const o = this._byId.get(id);
          if (!o || o.id === s.id) continue;
          if (dist2uv(s, o) <= r2) out.push(o);
        }
      }
    }
    return out;
  }

  // -------------------------------------------------------------- creation

  newCulture(opts = {}) {
    const c = {
      id: this.nextId++,
      name: makeName(this.rng),
      // A splinter people inherit their parent's technology — they do not rediscover
      // fire. What they lose is the shared tongue and creed, which is the point.
      eraIndex: opts.eraIndex ?? 0,
      techs: new Set(opts.techs || []),
      research: 0,
      traits: { ...(opts.traits || {}) },
      mods: [],                        // [key, multiplier] from commandments & covenants
      _mul: null,                      // cached trait multipliers
      commandments: [],
      covenant: null,
      color: opts.color ?? this.rng.int(0, 0xffffff),
      founded: this.year,
      parent: opts.parent ?? null,
      home: opts.home ?? null,        // where this people began — drives language drift
    };
    this.cultures.push(c);
    this._dirty();
    return c;
  }

  /**
   * The opening act: one male and one female, placed by the player, and nothing else.
   * Everything that follows comes from these two.
   */
  spawnFirstPair(u, v) {
    const c = this.newCulture({ home: { u, v } });
    const s = this.foundSettlement(c, u, v, 2, 'Origin');
    this.note(`${c.name} awakens — one man and one woman, on a world of water.`);
    return { culture: c, settlement: s };
  }

  foundSettlement(culture, u, v, pop = 30, label = null) {
    if (this.settlements.length >= MAX_SETTLEMENTS) return null;
    const s = {
      id: this.nextId++,
      name: label || `${makeName(this.rng)}`,
      cultureId: culture.id,
      u, v,
      pop,
      food: 1,
      founded: this.year,
      devotion: 0.5,
      plague: 0,
      drought: 0,
      warWith: null,
      lastGrowth: 0,
    };
    this.settlements.push(s);
    this._dirty();
    return s;
  }

  // Is this spot habitable at all? Water and ice are not.
  habitable(u, v) {
    const s = this.world.sample(u, v);
    if (s.height <= SEA_BYTE) return false;
    const b = biomeAt(s.biome);
    return b.cost < 90 && b.fertility > 0.03;
  }

  fertilityAt(u, v) {
    const s = this.world.sample(u, v);
    if (s.height <= SEA_BYTE) return 0;
    return biomeAt(s.biome).fertility;
  }

  // Is anything already settled within `minD2` of this point? Grid lookup, so founding a
  // town stays cheap no matter how many towns exist.
  _nearAny(u, v, minD2) {
    const gx0 = Math.floor(u * this.GRID), gy0 = Math.floor(v * this.GRID);
    const span = Math.ceil(Math.sqrt(minD2) * this.GRID) + 1;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const gx = ((gx0 + dx) % this.GRID + this.GRID) % this.GRID;
        const gy = gy0 + dy;
        if (gy < 0 || gy >= this.GRID) continue;
        const bucket = this.grid.get(gx * 64 + gy);
        if (!bucket) continue;
        for (const id of bucket) {
          const o = this._byId.get(id);
          if (o && dist2uv({ u, v }, o) < minD2) return true;
        }
      }
    }
    return false;
  }

  // Find unclaimed habitable land near (u,v) by walking an outward spiral.
  findSite(u, v, maxR = 0.22) {
    for (let r = 0.015; r <= maxR; r += 0.012) {
      const steps = Math.max(6, Math.floor(r * 140));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + this.rng.next();
        const nu = (u + Math.cos(a) * r + 1) % 1;
        const nv = Math.max(0.02, Math.min(0.98, v + Math.sin(a) * r));
        if (!this.habitable(nu, nv)) continue;
        if (this._nearAny(nu, nv, 0.0004)) continue;
        return { u: nu, v: nv };
      }
    }
    return null;
  }

  // -------------------------------------------------------------- the tick

  tick(dtYears) {
    this._tickN = (this._tickN || 0) + 1;
    if (!this.settlements.length) { this.year += dtYears; return; }
    // Settlements never move, so the spatial index is only rebuilt when one is founded
    // or dies (_dirty). Rebuilding it every tick was the dominant cost.
    let faithGain = 0;
    for (const c of this.cultures) { c._pop = 0; }

    for (const s of this.settlements) {
      faithGain += this._tickSettlement(s, dtYears);
      const c = this._culturesById.get(s.cultureId);
      if (c) c._pop += s.pop;
    }
    this.faith += faithGain;

    // Per-culture work happens once per culture, not once per settlement.
    for (const c of this.cultures) {
      this._discover(c);
      this._maybeAdvance(c);
    }

    // Cadence is measured in SIMULATED YEARS, not ticks. Counting ticks made the world
    // evolve ~20x faster per year at 1x speed than at 256x, because the number of ticks
    // per year depends on the frame rate and the time-warp setting.
    // Subtract the interval rather than zeroing it, and bound the catch-up loop: zeroing
    // silently turned "once a year" into "once a tick", which at a large substep meant
    // the world colonised eight times slower than it should.
    this._warAcc = (this._warAcc || 0) + dtYears;
    for (let g = 0; this._warAcc >= 3 && g < 2; g++) { this._war(3); this._warAcc -= 3; }
    if (this._warAcc > 12) this._warAcc = 0;

    this._migAcc = (this._migAcc || 0) + dtYears;
    for (let g = 0; this._migAcc >= 1 && g < 4; g++) { this._migrate(); this._migAcc -= 1; }
    if (this._migAcc > 8) this._migAcc = 0;

    this._prayAcc = (this._prayAcc || 0) + dtYears;
    for (let g = 0; this._prayAcc >= 6 && g < 2; g++) { this._tickPrayers(6); this._prayAcc -= 6; }
    if (this._prayAcc > 24) this._prayAcc = 0;

    this._expirePrayers(dtYears);

    // Drop the dead.
    let removed = false;
    for (let i = this.settlements.length - 1; i >= 0; i--) {
      if (this.settlements[i].pop < 1) { this.settlements.splice(i, 1); removed = true; }
    }
    if (removed) {
      for (let i = this.cultures.length - 1; i >= 0; i--) {
        const c = this.cultures[i];
        if (!this.settlements.some((s) => s.cultureId === c.id)) this.cultures.splice(i, 1);
      }
      this._dirty();
    }

    this.year += dtYears;
  }

  /** Returns the faith this settlement generated. */
  _tickSettlement(s, dt) {
    const c = this._culturesById.get(s.cultureId);
    if (!c) { s.pop = 0; return 0; }
    const era = ERAS[c.eraIndex];

    const fert = (s._fert = this.fertilityAt(s.u, s.v));
    if (fert <= 0) {                       // the land went under, or was painted over
      s.pop *= Math.max(0, 1 - 0.6 * dt);
      return 0;
    }

    const kMult = K_ERA[era.id] ?? 1;
    let K = fert * BASE_K * kMult * this._traitMul(c, 'growth');

    // Drought cuts the ceiling; irrigation and medicine raise it.
    if (s.drought > 0) K *= 0.35;
    if (c.techs.has('aqueduct')) K *= 1.4;
    if (c.techs.has('heavyPlough')) K *= 1.5;
    if (c.techs.has('medicine')) K *= 1.6;
    if (c.techs.has('antibiotics')) K *= 1.5;
    if (c.techs.has('genetics')) K *= 1.3;

    // Logistic growth with a demographic transition: rich societies slow down.
    const r = 0.03 * (kMult > 2000 ? 0.45 : kMult > 150 ? 0.7 : 1);
    const growth = r * s.pop * Math.max(0, 1 - s.pop / Math.max(1, K));
    s.pop = Math.max(0, s.pop + growth * dt);
    if (growth > 0) this.born += growth * dt;

    // Plague: density plus ignorance. Quarantine and germ theory blunt it hard.
    if (s.plague > 0) {
      const loss = s.pop * 0.25 * s.plague * dt;
      s.pop = Math.max(0, s.pop - loss);
      this.dead += loss;
      s.plague = Math.max(0, s.plague - 0.5 * dt);
    } else {
      let risk = 0.0006 * (s.pop / Math.max(1, K)) * dt;
      if (c.techs.has('plague medicine')) risk *= 0.4;
      if (c.techs.has('medicine')) risk *= 0.25;
      if (c.techs.has('antibiotics')) risk *= 0.2;
      if (s.pop > 500 && this.rng.chance(risk)) {
        s.plague = 1;
        this.note(`Plague reaches ${s.name}.`);
        this._raisePrayer(s, 'plague', 'Plague walks our streets. Heal us.');
      }
    }

    if (s.drought > 0) {
      s.drought = Math.max(0, s.drought - 0.25 * dt);
      if (s.drought === 0) this.note(`The drought over ${s.name} breaks.`);
    }

    // Research scales with people, softened so a megacity is not a million villages.
    c.research += Math.pow(s.pop, 0.62) * this._traitMul(c, 'research') * 0.004 * dt;

    // Faith is log-scaled so it stays spendable at any population size.
    return Math.log10(Math.max(10, s.pop)) * 0.9 * s.devotion * this._traitMul(c, 'faith') * dt;
  }

  // Trait and commandment multipliers, cached until the culture's doctrine changes.
  _traitMul(c, key) {
    if (!c._mul) c._mul = {};
    const hit = c._mul[key];
    if (hit !== undefined) return hit;
    let m = 1;
    for (const t in c.traits) {
      const T = TRAITS[t];
      if (T && T[key] !== undefined) m *= T[key];
    }
    if (c.mods) for (const [k, v] of c.mods) if (k === key) m *= v;
    c._mul[key] = m;
    return m;
  }

  /** Called by faith.js whenever doctrine changes, to drop the multiplier cache. */
  invalidateDoctrine(c) { c._mul = null; }

  _discover(c) {
    const era = ERAS[c.eraIndex];
    if (c._era !== era.id) { c._era = era.id; c._ti = 0; }
    const pool = techsOfEra(era.id);
    while (c._ti < pool.length) {
      const k = pool[c._ti];
      if (c.techs.has(k)) { c._ti++; continue; }
      if (c.research < TECHS[k].cost) break;
      c.research -= TECHS[k].cost;
      c.techs.add(k);
      this.note(`${c.name} discovers ${TECHS[k].name}.`);
      c._ti++;
    }
  }

  _maybeAdvance(c) {
    if (c.eraIndex >= ERAS.length - 1) return;
    const next = ERAS[c.eraIndex + 1];
    if (this.year < next.from) return;
    if ((c._pop || 0) < next.minPop) return;
    for (const t of next.req) if (!c.techs.has(t)) return;
    c.eraIndex++;
    c._era = null;                       // reset the discovery cursor
    this.note(`${c.name} enters the ${next.name}.`);
  }

  // -------------------------------------------------------------- migration

  _migrate() {
    if (this.settlements.length >= MAX_SETTLEMENTS) return;
    const n = this.settlements.length;
    // Rotating cursor: each pass inspects a slice, so founding stays O(slice) not O(n).
    const start = this._migCursor || 0;
    const slice = Math.min(n, 24);
    for (let k = 0; k < slice; k++) {
      const s = this.settlements[(start + k) % n];
      this._migCursor = (start + k + 1) % n;
      const c = this._culturesById.get(s.cultureId);
      if (!c || s.pop < 25) continue;
      const K = this.fertilityAt(s.u, s.v) * BASE_K * (K_ERA[ERAS[c.eraIndex].id] ?? 1);
      if (s.pop < K * 0.5) continue;

      const site = this.findSite(s.u, s.v);
      if (!site) continue;

      // Distance decides whether the migrants are still the same people. Far enough
      // away and the language drifts — a new culture is born (DESIGN.md §0, item 8).
      // Isolation is measured from the culture's homeland, not its nearest neighbour:
      // a contiguous frontier never splits, but a colony across an ocean does.
      const fromHome = c.home ? dist2uv(site, c.home) : Infinity;
      const isolated = fromHome > 0.012 && this.rng.chance(0.14);
      const settlers = Math.max(2, s.pop * 0.15);
      s.pop -= settlers;

      const parent = isolated
        ? this.newCulture({
            parent: c.id, color: c.color, home: site,
            eraIndex: c.eraIndex, techs: c.techs,
          })
        : c;
      const ns = this.foundSettlement(parent, site.u, site.v, settlers);
      if (!ns) { s.pop += settlers; return; }
      this.note(isolated
        ? `${parent.name} splits from ${c.name} — a new people, and a new tongue.`
        : `${c.name} founds ${ns.name}.`);
      return;   // one founding per pass keeps expansion readable
    }
  }

  // -------------------------------------------------------------- war

  _war(dt) {
    for (const s of this.settlements) {
      const c = this._culturesById.get(s.cultureId);
      if (!c) continue;
      // Hamlets are beneath the notice of armies. Without this floor, war wiped out
      // every young settlement faster than migration could found one.
      if (s.pop < 5000) continue;
      const fierce = this._traitMul(c, 'war');
      for (const o of this.neighbours(s, 0.05)) {
        if (o.cultureId === s.cultureId || o.pop < 5000) continue;
        const oc = this._culturesById.get(o.cultureId);
        if (!oc) continue;

        const ofier = this._traitMul(oc, 'war');
        const tension = fierce * ofier * 0.00025 * dt;
        if (!this.rng.chance(tension)) continue;

        const sLoss = s.pop * 0.02 * dt * ofier;
        const oLoss = o.pop * 0.02 * dt * fierce;
        s.pop = Math.max(0, s.pop - sLoss);
        o.pop = Math.max(0, o.pop - oLoss);
        this.dead += sLoss + oLoss;
        s.warWith = o.id; o.warWith = s.id;
        if (this.rng.chance(0.02)) {
          this.note(`${c.name} and ${oc.name} go to war over ${s.name}.`);
          this._raisePrayer(s, 'war', `${oc.name} burns our fields. Smite them.`);
        }
      }
    }
  }

  spendFaith(amount) {
    if (this.faith < amount) return false;
    this.faith -= amount;
    return true;
  }

  // -------------------------------------------------------------- prayers

  _raisePrayer(s, kind, text) {
    if (!s || !this._byId.get(s.id)) return;
    if (this.prayers.length >= 6) return;
    if (this.prayers.some((p) => p.settlementId === s.id && p.kind === kind)) return;
    this.prayers.push({
      id: this.nextId++,
      settlementId: s.id,
      settlementName: s.name,
      cultureName: (this._culturesById.get(s.cultureId) || {}).name || '?',
      kind, text,
      raised: this.year,
      ttl: 40,
    });
  }

  _tickPrayers(dt) {
    for (const s of this.settlements) {
      const c = this._culturesById.get(s.cultureId);
      if (!c) continue;
      const f = s._fert !== undefined ? s._fert : this.fertilityAt(s.u, s.v);
      const K = f * BASE_K * (K_ERA[ERAS[c.eraIndex].id] ?? 1);
      if (s.pop > K * 0.97 && this.rng.chance(0.004 * dt)) {
        this._raisePrayer(s, 'famine', 'Our granaries are empty. Send rain, or send mercy.');
      }
      if (s.drought === 0 && f < 0.4 && this.rng.chance(0.002 * dt)) {
        s.drought = 1;
        this._raisePrayer(s, 'drought', 'The rivers are dust. Answer us.');
      }
    }
  }

  _expirePrayers(dt) {
    for (let i = this.prayers.length - 1; i >= 0; i--) {
      const p = this.prayers[i];
      p.ttl -= dt;
      if (p.ttl > 0) continue;
      const s = this._byId.get(p.settlementId);
      if (s) {
        // An unanswered prayer costs belief. Sometimes it destroys it.
        s.devotion = Math.max(0.05, s.devotion - 0.35);
        this.note(`${s.name} stops praying. You did not answer.`);
      }
      this.prayers.splice(i, 1);
    }
  }


  /** Answer a prayer. Costs Faith, buys devotion. */
  answerPrayer(id) {
    const i = this.prayers.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, why: 'no such prayer' };
    const p = this.prayers[i];
    const cost = 60;
    if (!this.spendFaith(cost)) return { ok: false, why: 'not enough faith' };

    const s = this._byId.get(p.settlementId);
    if (s) {
      if (p.kind === 'plague') s.plague = 0;
      if (p.kind === 'drought' || p.kind === 'famine') s.drought = 0;
      if (p.kind === 'war') s.warWith = null;
      s.devotion = Math.min(2, s.devotion + 0.5);
    }
    this.prayers.splice(i, 1);
    this.note(`${s ? s.name : 'Your people'}: their prayer is answered.`);
    return { ok: true };
  }

  /** Refuse a prayer. Free, and it costs belief immediately. */
  refusePrayer(id) {
    const i = this.prayers.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const p = this.prayers[i];
    const s = this._byId.get(p.settlementId);
    if (s) s.devotion = Math.max(0.05, s.devotion - 0.2);
    this.prayers.splice(i, 1);
    return true;
  }

  // -------------------------------------------------------------- events

  note(msg) {
    this.log.unshift({ year: this.year, msg });
    if (this.log.length > 120) this.log.length = 120;
  }
}
