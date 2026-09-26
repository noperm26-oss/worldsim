// faith.js — what Faith buys. Powers, creeds, commandments and covenants.
//
// Faith is two things at once (DESIGN.md §2): a currency you spend, and a doctrine you
// teach. The powers here are the currency half; the creeds are the doctrine half.

import { TRAITS } from './sim.js';

export const POWERS = [
  {
    id: 'spawnHumans', name: 'Breathe Life', cost: 150, kind: 'creation',
    blurb: 'Place a group of people on habitable land.',
    apply(sim, u, v) {
      if (!sim.habitable(u, v)) return { ok: false, why: 'That ground cannot hold life.' };
      const home = sim.settlements.length
        ? sim.settlements.reduce((a, s) => (Math.abs(s.u - u) + Math.abs(s.v - v) < Math.abs(a.u - u) + Math.abs(a.v - v) ? s : a))
        : null;
      const c = home ? sim.culture(home.cultureId) : sim.newCulture({ home: { u, v } });
      if (!c) return { ok: false, why: 'No people to receive them.' };
      const s = sim.foundSettlement(c, u, v, 24);
      if (!s) return { ok: false, why: 'The world is full.' };
      sim.note(`You breathe ${24} souls into being at ${s.name}.`);
      return { ok: true };
    },
  },
  {
    id: 'rain', name: 'Rain', cost: 40, kind: 'blessing',
    blurb: 'End a drought and lift the land around it.',
    apply(sim, u, v) {
      let n = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) < 0.06 && Math.abs(s.v - v) < 0.06 && s.drought > 0) {
          s.drought = 0; n++;
        }
      }
      sim.note(n ? `Rain falls. ${n} settlement(s) drink.` : 'Rain falls on empty land.');
      return { ok: true };
    },
  },
  {
    id: 'fertility', name: 'Bless Harvest', cost: 70, kind: 'blessing',
    blurb: 'A generation of abundance.',
    apply(sim, u, v) {
      let n = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) < 0.06 && Math.abs(s.v - v) < 0.06) { s.food = 2; n++; }
      }
      sim.note(n ? `The harvest is blessed near ${n} settlement(s).` : 'The blessing finds no one.');
      return { ok: true };
    },
  },
  {
    id: 'heal', name: 'Heal', cost: 90, kind: 'blessing',
    blurb: 'Lift plague from a region.',
    apply(sim, u, v) {
      let n = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) < 0.07 && Math.abs(s.v - v) < 0.07 && s.plague > 0) { s.plague = 0; n++; }
      }
      sim.note(n ? `Sickness lifts from ${n} settlement(s).` : 'There is no sickness here.');
      return { ok: true };
    },
  },
  {
    id: 'meteor', name: 'Meteor', cost: 200, kind: 'destruction',
    blurb: 'Destroy everything in one strike.',
    apply(sim, u, v) {
      let killed = 0;
      for (const s of sim.settlements) {
        const d = Math.abs(s.u - u) + Math.abs(s.v - v);
        if (d > 0.09) continue;
        const f = 1 - d / 0.09;
        const loss = s.pop * (0.4 + 0.6 * f);
        s.pop = Math.max(0, s.pop - loss);
        killed += loss;
      }
      sim.dead += killed;
      sim.note(killed > 0
        ? `A meteor falls. ${Math.round(killed).toLocaleString('en-US')} are gone.`
        : 'A meteor falls on empty ground.');
      return { ok: true, killed };
    },
  },
  {
    id: 'lightning', name: 'Smite', cost: 60, kind: 'destruction',
    blurb: 'A single bolt on one settlement.',
    apply(sim, u, v) {
      let target = null, best = Infinity;
      for (const s of sim.settlements) {
        const d = (s.u - u) ** 2 + (s.v - v) ** 2;
        if (d < best) { best = d; target = s; }
      }
      if (!target || best > 0.01) { sim.note('The bolt finds nothing.'); return { ok: true }; }
      const loss = target.pop * 0.15;
      target.pop = Math.max(0, target.pop - loss);
      target.devotion = Math.min(2, target.devotion + 0.3);
      sim.dead += loss;
      sim.note(`You smite ${target.name}. The survivors are certain of you now.`);
      return { ok: true, killed: loss };
    },
  },
  {
    id: 'plague', name: 'Plague', cost: 120, kind: 'destruction',
    blurb: 'Sickness that spreads on its own.',
    apply(sim, u, v) {
      let n = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) < 0.08 && Math.abs(s.v - v) < 0.08) { s.plague = 1; n++; }
      }
      sim.note(n ? `Plague is loosed on ${n} settlement(s).` : 'The plague finds no hosts.');
      return { ok: true };
    },
  },
  {
    id: 'drought', name: 'Drought', cost: 80, kind: 'destruction',
    blurb: 'Years without rain.',
    apply(sim, u, v) {
      let n = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) < 0.08 && Math.abs(s.v - v) < 0.08) { s.drought = 1; n++; }
      }
      sim.note(n ? `The rains fail over ${n} settlement(s).` : 'The drought falls on empty land.');
      return { ok: true };
    },
  },
  {
    id: 'flood', name: 'Flood', cost: 140, kind: 'destruction',
    blurb: 'The waters rise and take the low ground.',
    apply(sim, u, v) {
      let killed = 0;
      for (const s of sim.settlements) {
        if (Math.abs(s.u - u) > 0.07 || Math.abs(s.v - v) > 0.07) continue;
        const loss = s.pop * 0.3;
        s.pop = Math.max(0, s.pop - loss);
        killed += loss;
      }
      sim.dead += killed;
      sim.note(killed > 0
        ? `The flood takes ${Math.round(killed).toLocaleString('en-US')}.`
        : 'The flood finds no one.');
      return { ok: true, killed };
    },
  },
  {
    id: 'inspire', name: 'Inspire', cost: 110, kind: 'blessing',
    blurb: 'A leap of understanding.',
    apply(sim, u, v) {
      let target = null, best = Infinity;
      for (const s of sim.settlements) {
        const d = (s.u - u) ** 2 + (s.v - v) ** 2;
        if (d < best) { best = d; target = s; }
      }
      if (!target) { sim.note('There is no one here to inspire.'); return { ok: true }; }
      const c = sim.culture(target.cultureId);
      if (c) {
        c.research += 400;
        sim.note(`${c.name} is struck by insight.`);
      }
      return { ok: true };
    },
  },
];

export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));

// ---------------------------------------------------------------- doctrine

export const TRAIT_COST = 250;
export const COMMANDMENT_COST = 180;
export const COVENANT_COST = 900;

/** Commandments: rules you impose. Keeping them earns Faith; breaking them splinters. */
export const COMMANDMENTS = [
  { id: 'noWar',    name: 'Thou Shalt Not War',   effect: { war: 0.45 }, faith: 1.25 },
  { id: 'devotion', name: 'Worship At Dawn',      effect: {},              faith: 1.6 },
  { id: 'noSlaves', name: 'Take No Slaves',       effect: { growth: 0.9 }, faith: 1.2 },
  { id: 'honourDead', name: 'Honour The Dead',    effect: { research: 1.15 }, faith: 1.15 },
  { id: 'seekKnowledge', name: 'Seek Understanding', effect: { research: 1.5 }, faith: 0.9 },
  { id: 'multiply', name: 'Be Fruitful',          effect: { growth: 1.35 }, faith: 1.0 },
];

/** Covenants: permanent pacts, unlocked by long devotion. */
export const COVENANTS = [
  { id: 'chosen',   name: 'The Chosen People', blurb: 'Doubled faith forever; they will not war.', cost: COVENANT_COST, effect: { faith: 2, war: 0 } },
  { id: 'eternal',  name: 'The Eternal City',  blurb: 'Their capital never falls to plague.',      cost: COVENANT_COST, effect: { plagueImmune: true } },
  { id: 'exodus',   name: 'The Exodus',        blurb: 'They found settlements twice as fast.',     cost: COVENANT_COST, effect: { growth: 1.5 } },
];

export function grantTrait(sim, cultureId, traitId) {
  const c = sim.culture(cultureId);
  if (!c) return { ok: false, why: 'No such people.' };
  if (!TRAITS[traitId]) return { ok: false, why: 'No such trait.' };
  if (c.traits[traitId]) return { ok: false, why: `${c.name} is already ${TRAITS[traitId].name.toLowerCase()}.` };
  if (!sim.spendFaith(TRAIT_COST)) return { ok: false, why: 'Not enough faith.' };
  c.traits[traitId] = true;
  sim.invalidateDoctrine(c);
  sim.note(`You make ${c.name} ${TRAITS[traitId].name.toLowerCase()}.`);
  return { ok: true };
}

export function giveCommandment(sim, cultureId, cmdId) {
  const c = sim.culture(cultureId);
  const cmd = COMMANDMENTS.find((x) => x.id === cmdId);
  if (!c || !cmd) return { ok: false, why: 'No such people or commandment.' };
  c.commandments = c.commandments || [];
  if (c.commandments.includes(cmdId)) return { ok: false, why: 'Already commanded.' };
  if (!sim.spendFaith(COMMANDMENT_COST)) return { ok: false, why: 'Not enough faith.' };
  c.commandments.push(cmdId);
  c.mods = c.mods || [];
  for (const [k, v] of Object.entries(cmd.effect)) c.mods.push([k, v]);
  if (cmd.faith) c.mods.push(['faith', cmd.faith]);
  sim.invalidateDoctrine(c);
  sim.note(`${c.name} receives the commandment: ${cmd.name}.`);
  return { ok: true };
}

export function sealCovenant(sim, cultureId, covId) {
  const c = sim.culture(cultureId);
  const cov = COVENANTS.find((x) => x.id === covId);
  if (!c || !cov) return { ok: false, why: 'No such people or covenant.' };
  if (c.covenant) return { ok: false, why: `${c.name} already has a covenant.` };

  const avgDevotion = sim.settlements
    .filter((s) => s.cultureId === cultureId)
    .reduce((a, s) => a + s.devotion, 0)
    / Math.max(1, sim.settlements.filter((s) => s.cultureId === cultureId).length);
  if (avgDevotion < 0.9) return { ok: false, why: 'Their belief is not deep enough yet.' };
  if (!sim.spendFaith(cov.cost)) return { ok: false, why: 'Not enough faith.' };

  c.covenant = covId;
  c.mods = c.mods || [];
  for (const [k, v] of Object.entries(cov.effect)) {
    if (k === 'plagueImmune') continue;
    c.mods.push([k, v]);
  }
  sim.invalidateDoctrine(c);
  sim.note(`${c.name} seals the covenant: ${cov.name}.`);
  return { ok: true };
}
