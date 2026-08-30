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

Status: **in progress — Foundation 0.3.4 first-campfire pass is under device acceptance on 2026-08-30.**

Accepted foundation carried forward:

- the 0.3.2 terrain, collision, ecology, satellite-island, vegetation, mountain-silhouette and mobile-performance architecture remains authoritative;
- the native Chromium PWA install flow, PNG-only launcher manifest, simple service worker and deterministic branch-source-first / production-dist-last Pages deployment architecture remain unchanged;
- the 0.3.3 tree/log loop has passed device verification: the first tree uses the existing forest population, three deliberate axe swings, removable shared collision, one retained stump and three normal Log pickups;
- gameplay, tree-harvest, landscape, runtime-asset, production-build and PWA checks remain required before merge.

Current playable sequence:

Gather stick -> gather stone -> craft spear -> hunt animal -> gather meat -> chop first tree -> gather logs -> **build first campfire**.

Foundation 0.3.4 adds:

- a data-driven `campfire` world-structure definition with a three-Log requirement and placement constraints;
- a dedicated `CampfireSystem` rather than representing the fire as an inventory item or adding a second crafting economy;
- the existing mobile craft button becomes contextual: spear during the spear step, campfire during the campfire step; desktop continues to use C;
- a shared `WorldCollisionSystem.isCircleClear()` placement query so structures can validate existing world obstacles without duplicating collision rules;
- a Ranger facing-direction accessor so placement systems use the player-controller boundary rather than reading controller internals;
- nearby placement search around the Ranger using playable terrain, slope and collision clearance, with materials consumed only after a valid placement is found;
- one grounded campfire presentation using a stone ring, crossed logs, emissive flame geometry and one non-shadow-casting point light;
- one normal campfire collision handle after construction;
- an active campfire state intended to become the shared proximity anchor for cooking and first-night sleeping;
- a dedicated campfire regression contract beside the existing gameplay, harvesting and landscape checks.

Foundation 0.3.4 acceptance gate before adding cooking:

- after all three Logs are gathered, the objective changes clearly to building the campfire;
- the mobile contextual craft button shows the campfire glyph instead of the spear glyph, while desktop C performs the same build action;
- the campfire cannot be built before the three Log requirement is met;
- building consumes exactly three Logs once and does not leave a fake campfire item in inventory;
- the campfire appears on valid nearby ground rather than at one fixed tutorial coordinate;
- the build avoids tree/rock/cliff collision and rejects unsuitable steep/out-of-bounds placement without consuming materials;
- the campfire remains grounded and visually readable, with lightweight visible flame/flicker on target mobile hardware;
- the campfire registers one shared-world collision handle and does not alter unrelated collision;
- after construction the objective advances to cooking the gathered meat;
- the full gather/craft/hunt/meat/tree/log sequence still works from a clean page load;
- terrain, ecology and PWA/install behavior remain unchanged;
- gameplay, tree-harvest, campfire, landscape, runtime-asset, production-build, PWA and Pages deployment checks are green.

Next playable milestone after this gate: **cook the gathered meat at the campfire.**

Target final-game Day 1 sequence:

Shipwreck beach -> movement/camera -> gather stick -> gather stone -> craft spear -> hunt animal -> gather meat -> chop tree -> gather logs -> build campfire -> cook meat -> eat -> night -> sleep until morning.

Required supporting systems:

- player locomotion and camera;
- interaction targeting;
- health, hunger and stamina;
- resource pickup/harvesting;
- simple inventory/material carrying as required;
- simple crafting;
- animal/hunting loop;
- tree/log harvesting;
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
