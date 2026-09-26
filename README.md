# WORLDSIM

A god-game on a living 3D planet. You are a deity whose currency is **Faith**: you shape
continents, paint biomes, breathe the first humans into existence, answer your people's
prayers — and strike them with meteors when they disappoint you.

The planet begins as **nothing but clear water.** Everything after that is yours.

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
| Left-drag | Paint the selected biome |
| Right-drag | Orbit the camera |
| Wheel | Zoom |
| `mode` button | Switch between paint and orbit (touch devices start in orbit) |

### Layout

```
index.html          shell + HUD
css/style.css       UI
js/biomes.js        the 18-biome table: colour, fertility, temperature, crossing cost
js/worldstate.js    world state as two data textures, brush painting, six world presets
js/planet.js        GPU terrain displacement, ocean, atmosphere, stars
js/main.js          scene, camera, input, HUD
tools/serve.mjs     dependency-free static server for local preview
tools/verify.mjs    the test suite
```

## Tests

```
npm run verify
```

120 assertions covering world generation, all six presets, brush painting (including the
longitude seam), reproducible seeding, planet assembly and static validation of the
shader interfaces. It runs the real simulation code in Node against a stubbed `three`, so
nothing in the suite is a reimplementation.

There is **no GPU in the test environment**, so the shaders are validated structurally
(varying/uniform agreement, balanced braces, bound samplers) rather than compiled. Visual
correctness has to be confirmed in a browser.

## Status

Milestones 1–3 — planet, biomes, six worlds — are built. Life simulation, faith,
civilisation and persistence are specced in [DESIGN.md](DESIGN.md) but not written yet.

## Engine

[three.js](https://threejs.org) r160, loaded from a CDN at runtime via an import map. It
is the only external dependency and cannot be vendored from the current build
environment; the page therefore needs internet when it loads. Everything else is
first-party.
