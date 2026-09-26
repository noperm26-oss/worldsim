# WORLDSIM

A god-game on a living 3D planet. You are a deity whose currency is **Faith**: you shape
continents, paint biomes, breathe the first two people into being, answer your people's
prayers — and strike them with meteors when they disappoint you.

The planet begins as **nothing but clear water.** Everything after that is yours.

You never place a building. You watch, and you interfere. They farm, found towns,
discover writing and bronze and gunpowder, take up religions, trade, betray each other
and go to war — from the Wood Age to the Space Age.

Inspired by Roblox's *World Sim* and Stateborn Studios' *[Beta] The Creator-God Sim*,
aiming to go deeper on climate, belief, language and real human history.
See [DESIGN.md](DESIGN.md) for the full spec.

---

## Play

**https://noperm26-oss.github.io/worldsim/**

Deployed automatically from `main` by GitHub Actions (`.github/workflows/static.yml`).
No build step, no bundler, no dependencies to install — it is plain static files.

### Controls

| Input | Action |
|---|---|
| Left-drag | Use the current tool (paint / power / inspect) |
| Right-drag | Orbit the camera |
| Wheel | Zoom |
| Toolbar | 🖐 Orbit · 🖌 Paint · ✦ Power · 🔍 Inspect |
| Speed bar | ❚❚ pause · 1× · 4× · 16× · 64× · 256× |

Touch devices start in Orbit mode; switch to Paint from the toolbar.

### The loop

1. **Shape the world** — start from clear water or one of six built-in biome set-ups,
   then paint 18 biomes across the sphere.
2. **Breathe life** — place the first pair. That is the only population you ever create
   by hand at the start; after that, they multiply on their own.
3. **Answer prayers** — plague, famine, drought, war. Answering costs Faith and buys
   devotion. Refusing is free and costs belief.
4. **Teach** — grant traits (*clever*, *fierce*, *devout*), give commandments, seal
   covenants with peoples whose belief runs deep enough.
5. **Watch history happen** — settlements found colonies, distant colonies lose the
   shared tongue and become new peoples, and everyone climbs the era ladder at their own
   pace.

## Layout

```
index.html              shell, HUD, panels, intro
css/style.css           UI
js/biomes.js            18-biome table: fertility, temperature, crossing cost
js/worldstate.js        world state as two data textures, brush painting, six presets
js/planet.js            GPU terrain displacement, ocean, atmosphere, stars
js/eras.js              the 15-era ladder and the 60-discovery chain
js/sim.js               cultures, settlements, population, migration, war, research
js/faith.js             powers, traits, commandments, covenants
js/render-entities.js   instanced humans, animals and era-styled buildings
js/save.js              save/load, export/import
js/ui.js                every panel and readout
js/main.js              scene, input routing, the simulation clock
tools/serve.mjs         dependency-free static server for local preview
tools/verify.mjs        the test suite (206 assertions)
tools/calib.mjs         prints the population/era timeline for a full 200,000-year run
```

## Tests

```
npm run verify
```

**206 assertions** covering world generation, all six presets, brush painting (including
the longitude seam), reproducible seeding, planet assembly, static validation of the
shader interfaces, the era ladder, the full 200,000-year population arc, powers,
doctrine, prayers, save/load round-tripping, and a per-tick cost budget.

It runs the real simulation code in Node against a stubbed `three`, so nothing in the
suite is a reimplementation. `npm run verify` takes about a minute; most of that is the
full historical run.

### What the tests do not cover

There is **no GPU in the test environment**, so the shaders are validated structurally
(varying/uniform agreement, balanced braces, bound samplers) rather than compiled.
**Visual correctness has to be confirmed in a browser.** `js/main.js` and `js/ui.js` need
a DOM and are syntax-checked only.

## Engine

[three.js](https://threejs.org) r160, loaded from a CDN at runtime via an import map. It
is the only external dependency and cannot be vendored from the current build
environment; the page therefore needs internet when it loads. Everything else is
first-party.

Terrain is displaced in the vertex shader from a height texture and biome colour comes
from a data texture in the fragment shader, so neither painting nor a large planet costs
per-frame CPU geometry work. Humans, animals and buildings are each a single
`InstancedMesh` draw call. The simulation runs on a fixed substep whose cadence is
measured in **simulated years**, not ticks, so the world evolves identically at 1× and
at 256×.
