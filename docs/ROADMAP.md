# Development Roadmap

This roadmap intentionally favors complete playable slices over a large feature dump.

## Phase 0 — Design and asset audit

Status: **complete for the first playable slice; additional packs may still be audited later.**

Goals:

- freeze the initial game vision and architecture;
- receive and audit preferred asset packs;
- verify licenses and commercial-use terms;
- choose the primary character, environment, animal, building, prop and UI sets;
- normalize intended scale and visual direction;
- identify missing assets before coding around assumptions.

The first vertical-slice asset direction is sufficiently defined to begin the technical foundation without closing the registry to later supporting assets.

## Phase 1 — Stable technical foundation

Status: **complete — Foundation 0.2 verified in CI on 2026-08-29.**

Goals:

- initialize the project with pinned local dependencies and a reproducible bundler;
- create a minimal boot path and loading state;
- establish automated build/smoke checks;
- implement scene/camera foundations and mobile input shell;
- create the data registries needed by the Day 1 slice.

Foundation 0.2 replaces the procedural production path with the selected KayKit Ranger and animation sets, KayKit forest assets, and validated Kenney rock/cliff geometry while preserving procedural fallbacks. Runtime asset paths are held in one registry and CI verifies those same paths before and after the production build.

Success condition: the game reliably boots on target mobile browsers and displays the selected Ranger in a test environment.

## Phase 2 — Day 1 survival vertical slice

Status: **in progress — Foundation 0.3.2 landscape-enclosure/island-scale pass is under visual acceptance on 2026-08-30.**

Current playable milestone:

- nearby stick and stone pickups exist around the shipwreck-beach start;
- the nearest valid pickup is targeted within interaction range;
- desktop uses E and mobile uses a contextual hand button for gathering;
- gathered resources are removed from the world and added to a small visible inventory;
- resource definitions, inventory state and world gatherables remain separate systems so later player/NPC harvesting can share the same data model;
- the first recipe is data-driven: one stick + one stone crafts one spear;
- crafting checks requirements before consuming anything, so failed recipes cannot partially remove materials;
- desktop uses C and mobile exposes a contextual spear button only when the recipe can be completed;
- the HUD separates the current objective from inventory counts and records the crafted spear in inventory;
- desktop uses F and mobile exposes the spear attack button only for a valid Day 1 hunt target;
- the spear follows the Ranger's right-hand rig/socket and uses the KayKit one-handed stab animation, retaining a controlled fallback presentation if the combat clip is unavailable;
- Day 1 hunting is species-neutral at the gameplay layer; the Qiwii Wild Pig is the current asset/style candidate and can be replaced without rewriting targeting, damage, carcass harvesting or loot;
- the hunt target takes two spear hits, provides hit feedback, falls when defeated and advances the objective;
- the defeated carcass exposes the normal contextual hand interaction when the player moves close enough;
- harvesting is one-time and data-driven from the animal definition, adding two Raw Meat to inventory without duplicating loot;
- Day 1 spawn, resource and hunt coordinates come from one shared world-layout definition;
- the Foundation 0.3.1 main-island height field remains authoritative, including the traversable central lowland, distributed highlands, cliffs, shelves, ravines and deliberate drops;
- Foundation 0.3.2 adds five irregular satellite islands around the main island without rescaling or reorganizing the accepted main-island terrain;
- satellite islands and their sandbar/shallow-water connectors are terrain-owned and use the same height, sand, playability and collision path as the main island;
- steep terrain is rock-colored while Kenney cliff meshes are used selectively as embedded face dressing;
- environment placement remains footprint-aware, preventing accepted cliffs/rocks/trees from being scattered through one another and preserving the tutorial route/clearings;
- forest generation targets roughly 540 collision-aware trees with broad scale variation and larger hero trees to close sightlines;
- repeated KayKit tree meshes and understory render as instanced batches while individual trunk collision remains world data;
- standalone rocks use a wider size/aspect range instead of reading as one repeated platform family;
- interactive fine grass targets roughly 13,800 segmented blade tufts with spatially bounded Ranger bending/compression/recovery inspired by the archived-game behavior;
- procedural fern understory targets roughly 2,200 instanced plants and shares the same localized reaction engine as grass rather than duplicating movement logic;
- forest-cover data now drives both tree density and subtle terrain darkening so dense groves read as more cohesive enclosed spaces without enabling full dynamic shadow maps;
- two deterministic instanced rings of off-limits mountain silhouettes close distant ocean sightlines and increase perceived scale without entering terrain or collision logic;
- rocks and broad cliff props still expose smaller standable support zones while their sides remain blocking;
- coastline, satellite bounds, sandbars, steep terrain, tree trunks and solid prop sides remain shared collision rules while deliberate interior drops remain fallable/jumpable;
- the GitHub Pages production build is also installable as a desktop Progressive Web App, avoiding a separate desktop gameplay fork;
- gameplay and landscape regression contracts run before the production build, runtime-asset checks and PWA verification.

Foundation 0.3.2 acceptance gate before adding tree chopping:

- ordinary exploration views are sufficiently enclosed by tree/grass/fern density and forest-cover shading that the island does not read as one open field;
- large terrain drops/rock faces create recognizably different vertical spaces without becoming invisible traversal walls;
- cliff/rock dressing no longer reads as many copies of one similarly sized platform;
- no obvious generated tree/rock/cliff intersections in the Day 1 route and surrounding forest;
- grass and fern vegetation visibly part/rebound around the Ranger and remain acceptable on target mobile hardware;
- satellite islands read as irregular natural extensions of the landscape rather than repeated circular props;
- sandbar/shallow-water connectors are visibly understandable and traversable without creating a second collision system;
- distant mountain silhouettes increase world scale while remaining clearly atmospheric/off-limits rather than suggesting reachable collision terrain;
- the Qiwii Wild Pig remains correctly grounded/scaled/oriented against the KayKit Ranger;
- the desktop build can be installed/launched from the desktop or Start menu;
- gameplay contracts, landscape contracts, runtime-asset verification, production build, selected-asset integrity and Pages deployment are green.

Next playable milestone after this gate: **chop the first tree and gather logs.**

Target final-game sequence:

Shipwreck beach -> movement/camera -> gather stick -> gather stone -> craft spear -> hunt animal -> gather meat -> chop tree -> gather logs -> build campfire -> cook meat -> eat -> night -> sleep until morning.

Required supporting systems:

- player locomotion and camera;
- interaction targeting;
- health, hunger and stamina;
- resource pickup/harvesting;
- simple inventory/material carrying as required;
- simple crafting;
- animal/hunting loop;
- campfire/cooking;
- day/night and sleeping;
- tutorial objectives;
- one-time discovery cards;
- save-state foundation for tutorial/discovery progress.

Success condition: Day 1 is polished, understandable and playable end to end on mobile.

## Phase 3 — Day 2 settlement foundation

Target sequence:

Morning -> gather/build -> custom Home Base/Town Centre -> place door -> designate building type -> place Storage Flag -> first villager arrives -> dialogue/recruitment -> place preset house blueprint -> villager gathers materials -> villager builds home -> villager idles/roams.

Required supporting systems:

- custom structural building;
- building designation;
- settlement origin/state;
- physical storage/drop-off point;
- first villager AI/navigation;
- recruitment dialogue;
- blueprint construction;
- villager home ownership;
- basic idle roaming.

Success condition: the player can transform the Day 1 survival camp into the beginning of a functioning settlement.

## Phase 4 — Basic villager automation

Goals:

- proximity job bubbles/icons;
- persistent field assignments;
- wood gathering;
- stone gathering;
- grass gathering;
- hunting;
- construction assignment;
- resource delivery to storage/construction;
- return-home-at-night behavior;
- idle fallback when no valid work exists;
- danger retreat behavior.

Success condition: repetitive camp work can be visibly delegated without creating a second disconnected economy.

## Phase 5 — Village production

Goals:

- workplace assignment framework;
- farming;
- cooking/food workplace;
- at least one additional simple production building;
- food security and settlement supply loops;
- unlock Village status when at least three functional production buildings exist.

Success condition: the settlement can transition from hunting/gathering dependence toward production.

## Phase 6 — Exploration population and world depth

Goals:

- broader island layout;
- survivor camps and personal belongings;
- up to approximately 30 recruitable villagers;
- region-specific wildlife/resources;
- environmental landmarks;
- simple hostile skeleton-like enemies;
- exploration cues such as firelight, smoke and paths.

Success condition: exploration feels meaningful and the settlement population can grow through discovery.

## Phase 7 — Town progression

Goals:

- specialized workplaces;
- improved construction/logistics;
- reliable food and resource production;
- settlement management improvements;
- meaningful Town criteria based on capability rather than population alone.

Exact features remain open until earlier loops are validated.

## Phase 8 — Fantasy island city

Goal: mature settlement gameplay with distinct functional areas, advanced production/civic structures and enough automation that the player can focus on exploration, expansion and design.

City requirements and end-game systems are intentionally not locked yet. They should be designed from evidence gathered while playing the Village/Town stages rather than guessed now.
