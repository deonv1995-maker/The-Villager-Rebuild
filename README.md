# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.5 — survival inventory, physical logs and basic tools**

Foundation 0.3.5 replaces the temporary linear Day-1 interaction shortcuts with the shared survival interaction model that later building, harvesting and combat systems must extend:

- Stick, Stone, Grass and food are inventory resources used by the existing crafting economy;
- Logs are physical world resources and are deliberately excluded from `InventorySystem`;
- chopped trees drop physical Logs that the Ranger lifts one at a time rather than collecting as an inventory counter;
- while a Log is carried, the mobile build tray expands with Lay Log, Post and Drop choices; placed Logs use shared world collision and the laid variant is standable;
- the campfire costs three Sticks plus three Stones and no longer consumes Logs, reserving Logs for physical construction;
- the persistent bottom toolbelt contains Spear, Axe, Hammer, Pickaxe and Sword. Selecting an unowned but craftable tool crafts it through the shared `CraftingSystem`; selecting an owned tool equips it;
- the Axe enables tree chopping, the Pickaxe mines registered large Rocks into loose Stone pickups, and the Hammer demolishes supported player-built objects such as placed Logs and the current campfire;
- the Sword establishes the shared short-range combat-tool role without introducing a second combat system;
- the Spear is a thrown projectile rather than a stabbing attack. A valid hunt target auto-locks inside spear range and damage is applied only when the moving projectile reaches that target;
- a dedicated survival-interaction regression contract runs alongside gameplay, physical tree/log harvesting, campfire, landscape, world-streaming, runtime-asset, production-build and PWA checks.

The expanded-world rules from the prior acceptance pass remain authoritative:

- forest canopy may create limited sightlines, but any tree directly between the active camera and Ranger must temporarily render as a low-opacity version of that same tree; tree placement and trunk collision remain unchanged;
- the mainland is approximately 2x the previous linear coast scale, while the existing Day-1 beach remains a deep southern inlet so the proven opening route is not moved inland;
- the larger world keeps one authoritative procedural terrain/collision surface, while terrain meshes, shallow-water overlays, forest batches, grass, ferns and numerous static dressing are owned by shared render chunks so distant/off-screen areas do not remain active render batches;
- satellite islands are deterministic but procedurally varied in position, size, proportions, rotation, edge warp, elevation and shoal geometry;
- water remains a lightweight in-house Three.js presentation over the authoritative terrain. Deep water stays inexpensive, while chunked turquoise shallows follow terrain depth substantially inland across low coastal shelves, satellite edges and sandbars;
- walking through traversable shallow water emits pooled expanding ripples around the Ranger without creating a second water-physics system or unbounded particles.

Foundation 0.3.5 remains under device/gameplay acceptance. Later cooking, hostile-enemy behaviour and more advanced structures should extend the interaction boundaries established here rather than bypassing them.

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
