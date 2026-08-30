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

Status: **in progress — Foundation 0.3.3 first-tree/log-gathering pass is under device acceptance on 2026-08-30.**

Accepted foundation carried forward from 0.3.2:

- the main-island height field, traversable central lowland, irregular highlands, cliffs, shelves, ravines and deliberate drops remain authoritative;
- five irregular satellite islands and their terrain-owned sandbar/shallow-water connectors remain part of the same `heightAt()` / `isPlayable()` path;
- environment placement remains footprint-aware and preserves the Day 1 route/clearings;
- roughly 540 collision-aware trees, wider-variety rocks, interactive grass, reactive ferns, forest-cover shading and distant mountain silhouettes remain the accepted landscape presentation;
- tree trunks, coastline, satellite bounds, steep terrain and solid prop sides remain shared collision rules;
- the native Chromium PWA install flow, PNG-only launcher manifest, simple service worker and deterministic branch-source-first / production-dist-last Pages deployment architecture are established and must not be replaced by gameplay work;
- gameplay, landscape, runtime-asset, production-build and PWA checks remain required before merge.

Current playable sequence:

Gather stick -> gather stone -> craft spear -> hunt animal -> gather meat -> **chop first tree -> gather logs**.

Foundation 0.3.3 adds:

- `log` as a shared resource/inventory definition rather than a tutorial-only counter;
- a data-driven forest-tree harvest definition containing interaction radius, swing count and log yield;
- a dedicated tree-harvest system that references the existing deterministic forest tree colliders and instanced render batches instead of spawning a duplicate harvest-tree population;
- tree targeting only after the Day 1 meat objective is complete;
- desktop E and the existing mobile contextual interaction button for chopping, with the mobile glyph switching from hand to axe when the target is a tree;
- three deliberate swings for the first tree rather than one-hit removal;
- a lightweight Ranger axe presentation that temporarily hides the equipped spear presentation during each chop without consuming or replacing the spear item;
- removal of only the felled tree's collision handle through `WorldCollisionSystem`, leaving the rest of the forest collision set unchanged;
- hiding of only the corresponding instanced tree entry while retaining instancing for the rest of the forest;
- a visible stump at the felled tree position;
- three world Log pickups spawned through the existing `GatherableSystem`;
- post-fell tutorial targeting restricted to those dropped logs until all three are collected;
- a dedicated tree-harvest regression contract beside the existing gameplay and landscape checks.

Foundation 0.3.3 acceptance gate before adding the campfire:

- after Raw Meat is harvested, the objective clearly changes to tree chopping;
- approaching a valid tree exposes the axe interaction on mobile and E interaction on desktop;
- the Ranger visibly performs the axe swing without showing the spear in the same hand;
- the target tree requires three distinct swings and cannot be felled by rapid duplicate input during one swing;
- only the targeted tree disappears from the instanced forest;
- the targeted tree trunk stops blocking movement after it is felled while unrelated tree/rock/cliff collision remains unchanged;
- the stump remains correctly grounded at the original tree position;
- exactly three visible Log pickups appear around the stump and use the normal hand pickup interaction;
- inventory reaches Log 3 after all three are gathered and the objective advances to the campfire step;
- the existing Day 1 gather/craft/hunt/meat sequence still works from a clean page load;
- the landscape and PWA/install architecture remain visually and behaviorally unchanged;
- target mobile performance remains acceptable;
- gameplay, tree-harvest, landscape, runtime-asset, production-build, PWA and Pages deployment checks are green.

Next playable milestone after this gate: **build the first campfire.**

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
