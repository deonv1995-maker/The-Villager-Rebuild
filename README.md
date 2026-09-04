# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation construction/device acceptance — 0.3.11 regression baseline plus current stacked-building refinements**

The current `main` branch has moved beyond the original 0.3.8 construction pass while preserving the same physical-material, terrain, survival and deployment boundaries. The active acceptance focus is the combined construction/camera state now protected by the full regression suite:

- physical Logs remain the authoritative structural material for RAW, FLOOR, FRAME, WALL and ROOF construction;
- the player-facing ANGLE option has been replaced by **STAIRS**, while legacy/internal `angle` remains available for persisted roof rafters and save compatibility;
- one stair flight occupies two adjacent supported upper-floor cells and is built piece-by-piece as six split-log treads, with those two upper-floor cells automatically reserved as the stairwell opening;
- adjacent upper-storey construction keeps one structural level model, and split-log floors own a continuous walking support surface across snapped panel boundaries;
- top-floor ROOF targeting prefers the highest valid completed FRAME + RAW support ring while preserving in-progress work first;
- `RoofTopology` remains the single roof-direction authority for live placement, completed-roof queries, thatching and interior detection;
- stepped/L-shaped side roofs use connected structure and the nearest completed upper-storey structural wall edge as orientation hints, and completed stale roof assemblies plus thatch reflow together when the corrected direction becomes authoritative;
- stacked wall customization is isolated by structural level so changing a lower wall to a door/window cannot remove the wall directly above it;
- connected completed building shells share one occlusion/fade unit while unrelated nearby buildings remain independent;
- third person remains the default Ranger camera, with optional first person reusing the same movement, interaction and construction systems rather than creating a parallel controller;
- first person has a small non-interactive center reticle, hides third-person Ranger/tool presentation to prevent clipping and disables the third-person building-occlusion presentation while active;
- the 0.3.11 device-regression contract locks RAW-frame traversal, continuous floor support, geometric roof occupancy and near-player tree interaction visibility;
- `npm run check` includes camera, construction, terrain-fit, upper-storey, stairs, stacked placement/roof/wall, roof topology/orientation/runtime/sequence, platform traversal, save, survival, PWA and production-build verification.

The established 0.3.8 physical-construction rules still remain intact:

- Stick, Stone, Grass and food remain inventory resources; Logs remain physical world resources;
- the bottom toolbelt starts with permanent **Hand**, followed by Spear, Axe, Hammer, Pickaxe and Sword;
- all handheld tools continue to use the shared authored right-hand attachment boundary;
- Spear still uses the authored KayKit `Throw` animation, timed hand release and live-target ballistic arc;
- campfire construction still uses the established survival/crafting path rather than creating a second economy;
- physical Logs remain 2.90 units long;
- the expanded mainland, procedural terrain, chunk streaming, water, tree transparency, PWA install architecture and deterministic Pages deployment ordering remain unchanged by the current construction/camera refinements.

The expanded-world rules from prior acceptance passes remain authoritative:

- forest canopy may create limited sightlines, but any tree directly between the active camera and Ranger must temporarily render as a low-opacity version of that same tree; tree placement and trunk collision remain unchanged;
- the mainland is approximately 2x the previous linear coast scale, while the existing Day-1 beach remains a deep southern inlet so the proven opening route is not moved inland;
- the larger world keeps one authoritative procedural terrain/collision surface, while terrain meshes, shallow-water overlays, forest batches, grass, ferns and numerous static dressing are owned by shared render chunks so distant/off-screen areas do not remain active render batches;
- satellite islands are deterministic but procedurally varied in position, size, proportions, rotation, edge warp, elevation and shoal geometry;
- water remains a lightweight in-house Three.js presentation over the authoritative terrain. Deep water stays inexpensive, while chunked turquoise shallows follow terrain depth substantially inland across low coastal shelves, satellite edges and sandbars;
- walking through traversable shallow water emits pooled expanding ripples around the Ranger without creating a second water-physics system or unbounded particles.

Current device acceptance should verify the merged construction/camera behavior before another structural rule is layered on top: six-step stair traversal and stairwell reservation, top-floor roof placement, stepped side-roof orientation toward the upper structural wall, stacked wall independence, connected-building fade, and first-person/third-person switching with the center reticle. New building work should extend the existing `UpperStoreyFloorRules`, `StairPlacementRules`, `RoofTopology`, shared collision and persistence boundaries rather than bypassing them.

## Installation

The deployed GitHub Pages build is the shared mobile/desktop production test build; there is no separate gameplay fork.

On Android Chrome or a Chromium desktop browser, use the browser-owned **Install app** flow. The manifest, launcher PNGs and simple service worker intentionally avoid custom install interception. The deterministic Pages workflow waits for GitHub's branch-source Pages run for the same commit and then deploys the verified production `dist` artifact last.

## Project principles

- `main` must remain a playable/stable build once gameplay development begins.
- The repository documentation is the source of truth for agreed design and architecture.
- Gameplay, UI, assets, AI, persistence and deployment must remain modular.
- Shared gameplay data should be data-driven rather than duplicated in feature code.
- Mobile performance and readable touch controls are first-class requirements.
- New systems should expand existing world rules rather than creating separate player/NPC versions of the same mechanic.
- Asset packs must be audited before integration.

## Design documents

- `docs/GAME_VISION.md` — overall game identity and design pillars.
- `docs/GAME_LOOP.md` — opening tutorial and long-term gameplay loop.
- `docs/NPC_VILLAGER_DESIGN.md` — recruitment, homes, jobs and routines.
- `docs/WORLD_AND_PROGRESSION.md` — island design and settlement progression.
- `docs/WORLD_STREAMING.md` — expanded mainland, render chunks, shallow water and tree-instance ownership.
- `docs/SURVIVAL_INTERACTION_MODEL.md` — inventory resources, physical Logs, toolbelt roles, building and combat boundaries.
- `docs/TECHNICAL_ARCHITECTURE.md` — intended technical foundation.
- `docs/DEVELOPMENT_RULES.md` — implementation and stability rules.
- `docs/ROADMAP.md` — staged development plan.
- `docs/DECISIONS.md` — important agreed design/technical decisions.
- `docs/ASSET_REGISTRY.md` — asset-pack audit and selection record.
- `docs/STAIR_SYSTEM.md` — split-log stair placement, stairwell reservation, traversal and persistence rules.
- `docs/STACKED_WALL_ROOF_ORIENTATION.md` — stacked wall ownership and connected/upper-wall roof orientation rules.
- `docs/CAMERA_MODES.md` — shared third-person/first-person Ranger camera contract.
