# WORLDSIM — Design Spec

> **Status: v4 — complete.** Planet, biomes, six worlds, faith, life, civilisation,
> the full era ladder, powers and persistence are all built and tested.
> Repo description (the only original statement of intent on GitHub):
> *"Planet living simulation as 3D planet with NPCS"*

---

## 0. Reference games, and what we take from each

The design is anchored on two Roblox experiences.

**Honesty note:** I cannot play Roblox games. Everything below is read from the games'
public descriptions and community trackers, not from hands-on play. Exact feel, exact
biome lists and balancing are not verified.

### World Sim🌍 — by World Simulation (place ID 83900135839110)

> *"A God-game pixel sandbox! Raise islands, carve oceans, and paint 18+ biomes. Get
> rabbits, wolves, bears, fish, dragons and humans. Villagers build houses, grow into
> kingdoms, and go to war over the land you created! Rain down meteors, lightning,
> tornadoes, wildfire, plague and acid — destroy everything in one click! SAVE your
> worlds and load them back anytime!"*

**What we take:** the **breadth**. 18+ biomes, a real animal roster, a full disaster
arsenal, kingdoms that fight over land you shaped, and save/load. Single-player.

### [Beta] The Creator-God Sim — by Stateborn Studios (place ID 10626746750)

> *"You are the god of a small round world. The Egonians spread across it on their own:
> they farm, quarry and build, found towns, discover writing and gunpowder and flight,
> take up religions, trade, betray each other and go to war. **You never place a
> building. You watch, and you interfere.** Send rain on a drought or lightning on a
> temple. Raise mountains, carve canyons, sink a city. Answer your towns' prayers, or
> refuse them. Shape each people with your creed: make one village clever, strong or
> fierce, give it commandments, and unlock covenants. Step down and live as one of them."*

Beta 1.5 added: Elves and Ogres as optional packs, *"a rival god in your sky, and one day
his fleet"*, drifting rain clouds, forests the people plant themselves.
Live stats: ~1.7K concurrent players, ~110K visits, 70–72% like ratio, 5 players/server,
avg session ~20 min, created Aug 2026.

**What we take:** the **soul**. A round world, a civilisation that runs itself, a god who
interferes rather than builds, faith as doctrine, and prayers you answer or refuse.

### The synthesis

**Creator-God Sim's philosophy, with World Sim's content breadth, on a real 3D planet
that runs in a browser.** And per your note — grounded in actual human history rather
than fantasy, which neither reference does.

### What "better and deeper" means, concretely

"Better" is a claim that has to be earned by execution, so here is the specific list of
places the references are shallow and what we do instead. These are the design targets,
not marketing.

| # | Where the references are shallow | What we do instead |
|---|---|---|
| 1 | Roblox caps them hard — World Sim is 1 player, Creator-God Sim 5 per server | No server tick limit. Instanced rendering and a decoupled fixed-timestep sim target **50,000+ agents** on one planet |
| 2 | "Egonians" are generic; no real history behind them | Anchored to the real human record: real population curve, out-of-Africa migration along coasts and land bridges, a discovery chain with real ordering |
| 3 | Biomes are largely paint — they look different but do not do much | **Biomes are simulation.** Each drives temperature, rainfall, food yield, carrying capacity, disease and movement cost. A desert genuinely cannot support a city |
| 4 | Terrain edits are cosmetic | **Terrain edits have climatic consequences.** Raise a mountain range and you get a permanent rain-shadow desert on the lee side; melt the ice and coastlines drown. Climate is computed, not decorated |
| 5 | Religion is a buff picker (clever/strong/fierce) | **Belief spreads as its own system.** Religions propagate along trade routes and conquest, splinter into sects, and a people who break your commandments can found a rival faith that outlives them |
| 6 | Session-scoped worlds | **Deep time** — ~200,000 simulated years with pause and warp, fully saved |
| 7 | Populations are undifferentiated blobs | **Generational depth** — families, dynasties, hereditary succession, and cultural memory that persists and drifts |
| 8 | Everyone speaks the same language | **Languages diverge.** Isolated populations drift apart, so two groups who meet again ten thousand years later are effectively different peoples — which is what actually drives history |
| 9 | Trade and cities appear where the game needs them | **Geography decides.** Trade routes form along real coasts, rivers and mountain passes; cities grow at genuine chokepoints, never placed by the player |

Items 3, 4, 5 and 8 are the ones that make it feel like a *world* rather than a map with
dots on it, and none of them require more art — only more simulation. That is the
cheapest place to be deeper, so that is where we spend the effort.

---

## 1. The core rule

> **You never place a building. You watch, and you interfere.**

Everything the player does is indirect. You shape terrain, you set climate, you spawn
life, you answer prayers, you strike with disasters. **The people do everything else** —
farming, building, founding towns, trading, warring, inventing. This is the rule that
makes the game feel alive instead of like a city-builder, and it overrides any other
design instinct. If a feature tempts us toward direct micromanagement, it's wrong.

---

## 2. Faith — a currency *and* a creed

My first draft treated Faith as money. That was too thin. In the reference it is both.

**As currency:** living followers generate Faith. You spend it on terrain, biomes,
animals, humans, blessings and disasters. Population is your income.

**As doctrine — the part I'd missed:** Faith is *what you teach*. You give each people
a **creed** that biases who they become:

- **Traits:** make a village *clever* (faster discovery), *strong* (better at war and
  labour), *fierce* (aggressive expansion), *devout* (more Faith, slower change),
  *seafaring*, *mercantile*.
- **Commandments:** rules you impose — *do not war*, *worship at dawn*, *honour the
  dead*, *take no slaves*. Peoples that keep them grow in Faith; peoples that break them
  may splinter into a new religion.
- **Covenants:** major pacts unlocked by long devotion — a blessing bound to a people in
  exchange for permanent obligation. High-tier progression.

Commandments that contradict a people's needs are where the drama lives.

---

## 3. Prayers

Towns send up prayers: *rain on our drought*, *heal our sick*, *spare us the flood*,
*bless our harvest*, *smite the tribe across the river*.

You **answer or refuse**. Answering costs Faith and buys devotion. Refusing costs nothing
and may break belief — or harden it. Ignoring a prayer during a plague can empty a
kingdom. This is the main moment-to-moment interaction and it belongs in milestone 4, not
at the end.

---

## 4. The planet

**Big, round, real 3D.** Begins as **clear water** — a bare blue sphere, no land. You
raise continents and carve oceans.

The reference calls its world *"small round world"* — small is a performance choice. You
want BIG, so we buy it with engineering instead: GPU-side terrain displacement from a
heightmap, biome colour from a data texture, level-of-detail chunks, and every agent
rendered through instancing. See §11.

**Six built-in world biome set-ups.** Each is a complete biome layout, chosen for players
who'd rather not sculpt their own — and, because presets and hand-painting write to the
same biome map, **every preset stays fully editable.** A built-in world is a starting
point, never a lock-in.

| # | World | Biome character |
|---|---|---|
| 1 | **Earth Today** | The current real map: Antarctic ice sheet, Arctic tundra, Sahara and Arabian desert, Amazon and Congo rainforest, Eurasian steppe, temperate forest |
| 2 | **Ice World** | Glaciers across the high latitudes, wide tundra belt, small temperate pockets, no true tropics |
| 3 | **Desert World** | Arid nearly everywhere, dune seas, scrub, oases clinging to water |
| 4 | **Jungle World** | Tropical rainforest blanket, heavy rainfall, dense rivers, no ice anywhere |
| 5 | **Volcanic World** | Active lava fields, ash plains, basalt rock, hot springs, thin but very fertile soil |
| 6 | **Archipelago** | Mostly open ocean, thousands of small islands, reef and coast, seafaring life |

**Biome palette — 18 core biomes** (matching the reference's "18+"):

Deep Ocean · Shallow Sea / Reef · Beach · Grassland · Savanna · Temperate Forest ·
Birch Forest · Rainforest · Flower Meadow · Swamp · Taiga · Tundra · Permafrost ·
Desert · Wasteland · Mountain · Snow Peak · Volcanic

**Optional fantasy biome pack** (off by default — see §10):
Infernal · Corrupted · Enchanted · Crystal · Celestial · Rocklands

Biome determines height, colour, movement cost, food yield, water access and temperature
— and therefore whether people can settle there at all.

---

## 5. Life

**Humans — the historical arc.** The world starts with **one male and one female.** From
that single couple, population grows, splits, migrates and expands, tuned to real
published world-population estimates rather than gamey numbers:

| Date | Population | Stage |
|---|---|---|
| ~200,000 ya | — | Humans appear in Africa |
| ~70,000 ya | — | Out-of-Africa migration along coasts and land bridges |
| 10,000 BC | a few million | Agriculture; first permanent villages |
| 1 AD | ~250 million | Bronze → Iron → Classical |
| 1500 | ~500 million | Medieval; first global contact |
| 1800 | 1 billion | Industrial Revolution |
| 2024 | ~8.1 billion | Modern |

Each human carries sex, age, health, hunger, partner and home settlement. Villages form
where food and water are good, absorb nearby people, and step village → town → city →
metropolis at population thresholds. When carrying capacity is exceeded, a group **walks**
to the best unclaimed habitable land — that walking is what paints civilisation across
the globe. Migrating groups meet, and trade or war.

**Discovery chain** (following the reference's "writing and gunpowder and flight"):
Fire → language → tools → agriculture → pottery → wheel → writing → bronze → iron →
sailing → currency → mathematics → gunpowder → printing → steam → flight → electricity →
computing → spaceflight. Unlocked by cleverness, population and era.

**Animals:** rabbits, deer, wolves, bears, fish, birds — prey, predators, food sources.
Herds migrate with the biomes. Forests are planted by the people themselves over time,
not painted instantly.

---

## 5b. The era ladder

Fifteen eras, gated on three things at once: the year, the people's numbers, and the
prerequisite discoveries. A culture cannot leap to castles with forty villagers.

| Era | Years | Anchored to |
|---|---|---|
| Wood Age | 200,000 – 70,000 BC | fire, speech, wooden tools |
| Stone Age | 70,000 – 3,500 BC | flint, the bow, then agriculture and pottery |
| Copper Age | 3,500 – 3,000 BC | first metal, the plough, the wheel |
| Bronze Age | 3,000 – 1,200 BC | writing, cities, the chariot, the first states |
| Iron Age | 1,200 – 500 BC | iron, coinage, the alphabet, cavalry |
| Classical Age | 500 BC – 500 AD | roads, aqueducts, cut masonry, philosophy |
| Early Medieval | 500 – 1000 | feudalism, the heavy plough, the stirrup |
| High Medieval | 1000 – 1300 | stone castles, universities, guilds |
| Late Medieval | 1300 – 1500 | gunpowder, banking, quarantine |
| Renaissance | 1500 – 1650 | the press, ocean navigation, astronomy |
| Age of Sail | 1650 – 1760 | cartography, the scientific method |
| Industrial Age | 1760 – 1900 | steam, railways, germ theory |
| Modern Age | 1900 – 1970 | electricity, flight, antibiotics |
| Information Age | 1970 – 2025 | computing, the internet, genetics |
| Space Age | 2025 → | fusion, terraforming, interplanetary travel |

Each era also restyles the settlements — hut, then timber hall, then stone keep, then
chimney and then tower — so a world's history is readable at a glance from orbit.

**Calibration.** The carrying-capacity ladder behind this was tuned against the published
world-population curve, and `npm run verify` asserts it on every run. A full
200,000-year simulation lands at:

| Year | Simulated | Real |
|---|---|---|
| 1 AD | 156M | ~250M |
| 1500 | 519M | ~500M |
| 1800 | 991M | ~1B |
| 2025 | 5.8B | ~8.1B |

Within roughly a third of the real figure across two hundred millennia, and monotonic
throughout. Splinter peoples inherit their parent's technology — they do not rediscover
fire — but lose the shared tongue, which is what makes them a new people.

## 6. Powers and disasters

Blessings and destruction, one click each:

| Kind | Powers |
|---|---|
| **Creation** | Raise land, carve ocean, paint biome, spawn animals, spawn humans |
| **Blessing** | Rain, fertility, growth, healing, calm seas |
| **Destruction** | Meteor, lightning strike, tornado, wildfire, plague, acid rain, drought, flood, earthquake, sink a city |

Destruction is the interesting half. Striking a temple can harden belief or end a
kingdom — and refusing to strike when your people demand it does the same.

---

## 7. Step down and live as one of them

From the reference: the god can **become mortal.** Drop into a single human body and
live an ordinary life inside the world you made — your civilisation continues without
you, and your prayers now go *up* to the empty sky. Powerful tonal payoff; scoped as a
late milestone, but the data model must allow it from day one (an agent is an agent).

---

## 8. A rival god

Also from the reference: *"a rival god in your sky, and one day his fleet."* A second
deity with his own people, competing for the same land and the same believers. The long
endgame. Designed for, not built early.

---

## 9. Save and load

From World Sim, and non-negotiable: **save your world and load it back.** Worlds
serialise to browser `localStorage` (plus export/import as a file), covering terrain,
biomes, every agent, settlements, creeds, tech state and the clock.

---

## 10. Realism vs fantasy — decision needed

You asked for **historical fact**. Both references lean fantasy — World Sim has dragons,
Creator-God Sim has "Egonians", elves and ogres. My proposal:

- **Core game is strictly realistic.** Real humans, real animals, real history.
- **Fantasy is an optional pack**, switched on per world, exactly as Creator-God Sim
  ships Elves and Ogres as separate packs: dragons, elves, ogres, enchanted biomes.

This keeps the history honest without throwing away the fun. Tell me if you'd rather have
fantasy in the core, or gone entirely.

---

## 11. Engine and performance

**Three.js from a CDN.** All game code is first-party in this repo; Three.js is the only
external dependency. Chosen because `THREE.InstancedMesh` draws tens of thousands of
agents in **one draw call**, and because terrain displaces in the vertex shader from a
heightmap so a large detailed planet costs no per-frame CPU geometry work.

**Known limitation, stated plainly:** this sandbox cannot reach CDNs (`curl` to
unpkg/jsDelivr returns `code=000`), so Three.js cannot be committed into the repo. The
browser fetches it at load — zero setup for you, but the page needs internet to load.
Going fully offline later is one file dropped into `vendor/` plus a one-line change.

**Deployment is already wired.** Pages is enabled: `build_type: workflow`, source `main`,
path `/`. An `index.html` at the repo root goes live at
`https://noperm26-oss.github.io/worldsim/` with no configuration. The existing workflow
uploads the whole repo with no build step, so the game is plain static files — no
bundler, no npm install, nothing for you to integrate.

**Targets:** 60 fps with 50,000 agents alive; fixed-timestep simulation decoupled from
rendering, so time-warp never breaks the sim and slow machines drop sim rate, not
framerate; spatial hash grid for all neighbour queries — no O(n²) loops.

Time runs as **1 real second = N simulated years**, with pause and 1× / 4× / 16× / 64×.

---

## 12. Build order

| # | Milestone | Deliverable | |
|---|---|---|---|
| 1 | The planet | Big sphere, orbit camera, day/night, ocean + atmosphere | ✅ |
| 2 | Terrain & biomes | Raise land, carve ocean, paint the 18-biome palette | ✅ |
| 3 | Six worlds | The six presets, all editable afterwards | ✅ |
| 4 | Faith & life | The two-person beginning, reproduction, animals, prayers, creeds | ✅ |
| 5 | Civilisation | Settlements, migration, language divergence, war, eras, discoveries | ✅ |
| 6 | Powers | Full blessing and disaster arsenal | ✅ |
| 7 | Persistence | Save/load, export/import | ✅ |
| 8 | Late | Commandments, covenants, era ladder to the Space Age | ✅ |
| — | Mortal mode, rival god, fantasy pack | Specced, not built | ✗ |

Everything except the three items in the last row is built. Those remain specced only.

### Running it

```
npm run verify    # 120 assertions over world gen, painting, planet + shader wiring
node tools/serve.mjs   # local preview on :5173
```

No build step and no dependencies to install — `npm run verify` uses a stubbed `three`
that lives in `node_modules/` (gitignored) purely so the simulation can be executed in
Node. The game itself is plain static files.

---

## 13. Open questions

1. **Fantasy** — core, optional pack, or gone? (§10)
2. **Scale vs speed** — how big must "BIG" be? Bigger planets cost framerate; I'd rather
   ship a planet that holds 60 fps than one that crawls. Your call on the trade.
3. **Multiplayer** — both references are small servers (World Sim 1 player, Creator-God
   Sim 5). GitHub Pages is static and cannot host a server, so multiplayer would need an
   external backend. Assume single-player?
