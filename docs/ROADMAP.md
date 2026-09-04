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

Status: **in progress — Day 1 remains the active vertical slice, with the current construction/device acceptance baseline protected by Foundation 0.3.11 regressions and the later scoped building/camera refinements merged through 2026-09-03.**

Accepted foundation carried forward:

- the 0.3.2 terrain, collision, ecology, satellite-island, vegetation, mountain-silhouette and mobile-performance architecture remains authoritative;
- the native Chromium PWA install flow, PNG-only launcher manifest, simple service worker and deterministic branch-source-first / production-dist-last Pages deployment architecture remain unchanged;
- the established tree/log survival loop remains in the shared world rather than being replaced by a second construction inventory model;
- Stick, Stone, Grass and food remain inventory resources while Logs remain physical world resources;
- physical construction continues to extend the same shared collision, persistence, structural-level and placement boundaries rather than adding parallel player-only systems;
- gameplay, camera, construction, terrain-fit, harvesting, survival, save, runtime-asset, production-build and PWA checks remain required before merge.

### Current construction/device acceptance checkpoint — 2026-09-04

The repository has accumulated several player-requested construction refinements ahead of the later settlement phases. These are treated as foundation work and must be device-verified before more structural behavior is layered on top:

- **STAIRS** replaces the player-facing ANGLE build option. A flight occupies two supported upper-floor cells and is built as six split-log treads, bottom-to-top, while those two upper-floor cells remain reserved as the stairwell opening;
- upper-storey split-log floors and traversal use the shared structural-level/support model, including the 0.3.11 continuous floor-support regression;
- top-floor ROOF targeting prefers the highest valid completed FRAME + RAW support ring after preserving any in-progress roof work;
- `RoofTopology` remains the single roof-direction authority for placement, completion, thatching and interior queries;
- stepped/L-shaped roof cells use connected-building structure as their tie-break, and lower side roofs can use the nearest completed upper-storey structural wall edge as the stronger local orientation hint;
- stale completed non-shared roof assemblies and their thatch can reflow together when the authoritative direction changes;
- stacked wall customization is isolated by structural elevation so a lower wall variant cannot remove or hide the upper wall directly above it;
- connected completed buildings can fade as one presentation unit while unrelated nearby buildings remain independent;
- third person remains the default Ranger camera, while optional first person reuses the same movement, look, interaction and construction paths and adds a small non-interactive center reticle;
- the 0.3.11 regression suite additionally protects RAW frame traversal behavior, geometric roof occupancy and near-player tree interaction visibility.

Device acceptance gate before another structural feature is added:

- a six-tread stair flight can be built piece-by-piece from a valid two-cell opening and traversed cleanly to the upper floor;
- the two stairwell cells cannot be refilled while that stair flight exists and become available again after the flight is removed;
- a roof can be started on the highest valid supported top floor even when a lower closed roof topology also exists;
- a stepped side roof turns toward the nearest completed upper-storey structural wall when that wall provides an unambiguous local direction;
- changing a lower wall to DOOR/WINDOW leaves a directly stacked upper wall intact;
- connected-building fade behaves as one building without affecting unrelated nearby structures;
- first-person/third-person switching preserves movement and building behavior, with the reticle visible only in first person;
- the full `npm run check` suite remains green and the production GitHub Pages deployment completes successfully.

Current playable survival sequence:

Gather stick -> gather stone -> craft spear -> hunt animal -> gather meat -> chop first tree -> gather logs -> build first campfire.

The construction foundation now extends beyond what the Day 1 sequence strictly requires, but it does not replace the unfinished Day 1 progression work below.

Next playable milestone after the current acceptance gate: **cook the gathered meat at the campfire.**

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

Existing structural building features developed during Phase 2 foundation work should be reused here. Phase 3 must not introduce a second construction grid, resource economy, collision path or persistence model for villagers.

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
