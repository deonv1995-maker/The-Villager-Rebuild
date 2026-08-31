# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.7 — work-tool animation and physical log construction refinement**

Foundation 0.3.7 responds to Android visual verification of Foundation 0.3.6 and deliberately reuses the archived original game as a behavioural reference without copying its old technical architecture wholesale:

- Axe, Hammer and Pickaxe remain mounted to the Ranger's authored `handslot.r`, but their work motion is now driven by Ranger skeleton one-shot actions instead of independently rotating the held prop around the wrist;
- Sword and Spear keep their established combat paths; the Spear still uses the authored KayKit `Throw` animation with timed release and a live-target ballistic arc;
- the Pickaxe toolbelt glyph is replaced with a clearer white 48x48 silhouette so the tool remains visible at mobile HUD scale;
- physical Logs use one authoritative original-reference size of 2.90 units long with bark, visible cut ends and a terrain-aware resting pose instead of the previous short generic cylinder;
- lifting a Log shoulder-carries that same physical object; Logs still never enter `InventorySystem`;
- holding a Log exposes the original-reference construction modes **RAW, FLOOR, FRAME, WALL and ANGLE**, plus **DROP**;
- the selected construction mode shows a live green/red world ghost which follows Ranger position/facing; the normal Hand interaction confirms only a valid green placement;
- floor pieces snap on a 0.25 grid, construction yaw snaps in 45-degree increments, frames snap to floor corners, walls require a supported frame pair, and raw beams can snap across supported frame pairs;
- placed floor/raw pieces use the shared standable collision path, frame/wall/angle pieces register shared construction collision, and Hammer demolition returns construction back to a physical Log pickup;
- regression checks lock the original-reference log dimensions/modes, mobile build tray, live construction ghost, shared collision boundaries, skeletal work-tool actions and Pickaxe icon asset.

Foundation 0.3.6 rules remain intact:

- Stick, Stone, Grass and food remain inventory resources; Logs remain physical world resources;
- the bottom toolbelt starts with permanent **Hand**, followed by Spear, Axe, Hammer, Pickaxe and Sword;
- all handheld tools continue to use the shared authored right-hand attachment boundary;
- campfire construction still previews before consuming exactly three Sticks plus three Stones;
- the expanded mainland, procedural terrain, chunk streaming, water, tree transparency, PWA install architecture and deterministic Pages deployment ordering are unchanged by this pass.

The expanded-world rules from prior acceptance passes remain authoritative:

- forest canopy may create limited sightlines, but any tree directly between the active camera and Ranger must temporarily render as a low-opacity version of that same tree; tree placement and trunk collision remain unchanged;
- the mainland is approximately 2x the previous linear coast scale, while the existing Day-1 beach remains a deep southern inlet so the proven opening route is not moved inland;
- the larger world keeps one authoritative procedural terrain/collision surface, while terrain meshes, shallow-water overlays, forest batches, grass, ferns and numerous static dressing are owned by shared render chunks so distant/off-screen areas do not remain active render batches;
- satellite islands are deterministic but procedurally varied in position, size, proportions, rotation, edge warp, elevation and shoal geometry;
- water remains a lightweight in-house Three.js presentation over the authoritative terrain. Deep water stays inexpensive, while chunked turquoise shallows follow terrain depth substantially inland across low coastal shelves, satellite edges and sandbars;
- walking through traversable shallow water emits pooled expanding ripples around the Ranger without creating a second water-physics system or unbounded particles.

Foundation 0.3.7 remains under device/gameplay acceptance. Later hauling capacity, upper-floor construction, roofing and other advanced building behaviour should extend these physical-material and snapping boundaries rather than bypassing them.

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
