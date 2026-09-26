// save.js — persistence. Save to the browser, or export/import a world as a file.

const KEY = 'worldsim.save.v1';

function bytesToB64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function serialize(world, sim) {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    world: {
      W: world.W, H: world.H, seed: world.seed,
      height: bytesToB64(world.height),
      biome: bytesToB64(world.biome),
    },
    sim: {
      year: sim.year,
      faith: sim.faith,
      nextId: sim.nextId,
      born: sim.born,
      dead: sim.dead,
      cultures: sim.cultures.map((c) => ({
        id: c.id, name: c.name, eraIndex: c.eraIndex, color: c.color,
        founded: c.founded, parent: c.parent, research: c.research,
        techs: [...c.techs],
        traits: c.traits,
        mods: c.mods || [],
        commandments: c.commandments || [],
        covenant: c.covenant || null,
      })),
      settlements: sim.settlements.map((s) => ({
        id: s.id, name: s.name, cultureId: s.cultureId, u: s.u, v: s.v,
        pop: s.pop, food: s.food, founded: s.founded, devotion: s.devotion,
        plague: s.plague, drought: s.drought, warWith: s.warWith,
      })),
      prayers: sim.prayers,
      log: sim.log,
    },
  };
}

export function deserialize(data, world, sim) {
  if (!data || data.v !== 1) throw new Error('Unrecognised save format');

  if (data.world.W !== world.W || data.world.H !== world.H) {
    throw new Error(`Save is for a ${data.world.W}x${data.world.H} world; this is ${world.W}x${world.H}`);
  }
  world.height.set(b64ToBytes(data.world.height));
  world.biome.set(b64ToBytes(data.world.biome));
  world.seed = data.world.seed;
  world.flush();

  const s = data.sim;
  sim.year = s.year;
  sim.faith = s.faith;
  sim.nextId = s.nextId;
  sim.born = s.born || 0;
  sim.dead = s.dead || 0;
  sim.cultures = s.cultures.map((c) => ({
    ...c,
    techs: new Set(c.techs),
    traits: c.traits || {},
    mods: c.mods || [],
    _mul: null,
    commandments: c.commandments || [],
  }));
  sim.settlements = s.settlements.map((x) => ({ ...x }));
  sim.prayers = s.prayers || [];
  sim.log = s.log || [];
  return sim;
}

export function saveLocal(world, sim) {
  const data = serialize(world, sim);
  localStorage.setItem(KEY, JSON.stringify(data));
  return data.savedAt;
}

export function loadLocal(world, sim) {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  deserialize(JSON.parse(raw), world, sim);
  return true;
}

export function hasLocal() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function exportFile(world, sim) {
  const blob = new Blob([JSON.stringify(serialize(world, sim))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worldsim-${Math.round(sim.year)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function importFile(file, world, sim) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(deserialize(JSON.parse(fr.result), world, sim)); }
      catch (e) { reject(e); }
    };
    fr.onerror = () => reject(new Error('Could not read that file'));
    fr.readAsText(file);
  });
}
