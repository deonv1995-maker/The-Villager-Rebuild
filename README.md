# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.8 — mobile construction, carry and tool-action refinement**

Foundation 0.3.8 responds to Android verification of Foundation 0.3.7 while preserving the existing world, survival and deployment foundations:

- shoulder-carried Logs use a higher/rearward attachment plus an explicit post-animation Ranger arm posture, so the same physical Log reads as supported on the shoulder instead of clipping through the torso;
- adjacent FLOOR pieces inherit the exact construction level of the floor they snap to instead of recomputing their height from local terrain;
- uneven terrain beneath a floor is handled by construction-owned automatic fill piers for shallow gaps and vertical physical-Log support posts for larger gaps; the continuous island terrain is never cut, flattened or rewritten by building placement;
- **ROOF** is restored as a physical-Log construction mode. A roof Log snaps as a pitched rafter from a supported frame pair and consumes the same carried whole Log used by the rest of physical construction;
- the carried-Log construction tray now runs horizontally across the top of the mobile view so the build preview and Ranger remain unobstructed;
- Axe, Hammer and Pickaxe keep their authored Ranger skeleton work actions but receive a stronger hand-mounted strike accent so impacts read more clearly on a phone;
- an equipped tool gets a dedicated right-side action button using that tool's own icon; contextual Hand pickup/build interaction stays separate;
- Sword uses a dedicated lateral slash presentation instead of sharing the generic vertical work-tool arc;
- tree and rock strikes emit a short shared impact ring/chip effect on every successful hit;
- collision clearance gained one backwards-compatible scoped ignore predicate so floor snapping can ignore the specific neighbouring floor contact without globally weakening world collision;
- regression checks now lock ROOF, same-level floor snapping, support/fill ownership, carry posture, mobile action controls, stronger tool motion, lateral Sword motion, hit feedback and the existing authored Spear throw/ballistic arc.

Foundation 0.3.7/0.3.6 rules remain intact:

- Stick, Stone, Grass and food remain inventory resources; Logs remain physical world resources;
- the bottom toolbelt starts with permanent **Hand**, followed by Spear, Axe, Hammer, Pickaxe and Sword;
- all handheld tools continue to use the shared authored right-hand attachment boundary;
- Spear still uses the authored KayKit `Throw` animation, timed hand release and live-target ballistic arc;
- campfire construction still previews before consuming exactly three Sticks plus three Stones;
- physical Logs remain 2.90 units long and still use RAW, FLOOR, FRAME, WALL and ANGLE in addition to the restored ROOF mode and DROP;
- the expanded mainland, procedural terrain, chunk streaming, water, tree transparency, PWA install architecture and deterministic Pages deployment ordering are unchanged by this pass.

The expanded-world rules from prior acceptance passes remain authoritative:

- forest canopy may create limited sightlines, but any tree directly between the active camera and Ranger must temporarily render as a low-opacity version of that same tree; tree placement and trunk collision remain unchanged;
- the mainland is approximately 2x the previous linear coast scale, while the existing Day-1 beach remains a deep southern inlet so the proven opening route is not moved inland;
- the larger world keeps one authoritative procedural terrain/collision surface, while terrain meshes, shallow-water overlays, forest batches, grass, ferns and numerous static dressing are owned by shared render chunks so distant/off-screen areas do not remain active render batches;
- satellite islands are deterministic but procedurally varied in position, size, proportions, rotation, edge warp, elevation and shoal geometry;
- water remains a lightweight in-house Three.js presentation over the authoritative terrain. Deep water stays inexpensive, while chunked turquoise shallows follow terrain depth substantially inland across low coastal shelves, satellite edges and sandbars;
- walking through traversable shallow water emits pooled expanding ripples around the Ranger without creating a second water-physics system or unbounded particles.

Foundation 0.3.8 remains under device/gameplay acceptance. Later multi-log hauling, upper-floor support networks, roof cladding and advanced building behaviour should extend these physical-material, level/snap and construction-owned support boundaries rather than bypassing them.

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
