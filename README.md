# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.6 — survival interaction presentation refinement**

Foundation 0.3.5 established the authoritative resource/tool/building model and passed device verification. Foundation 0.3.6 keeps those rules intact and fixes the presentation issues exposed on Android:

- Stick, Stone, Grass and food remain inventory resources; Logs remain physical world resources that never enter `InventorySystem`;
- the bottom toolbelt now begins with a permanent **Hand** slot representing the default Ranger state with no tool equipped, followed by Spear, Axe, Hammer, Pickaxe and Sword;
- Axe, Hammer, Pickaxe and Sword use the Ranger's authored right-hand attachment slot instead of fixed root-relative offsets, so held tools follow the hand rather than floating beside the shoulder;
- the Spear remains the auto-lock projectile weapon, but the Ranger now uses the authored KayKit `Throw` animation and releases the held spear during that motion instead of visually stabbing or instantly launching it;
- the thrown Spear follows a visible ballistic-style arc while continuing to track the live locked target, and damage still resolves only when the projectile arrives;
- campfire construction is now two-stage: first show a translucent green placement template on valid ground, then confirm that template to consume three Sticks plus three Stones and create the real campfire;
- the campfire template has no collision, consumes no materials and follows the existing Ranger-facing terrain/slope/collision placement rules until confirmed;
- dedicated survival and campfire regression checks lock the Hand slot, authored Throw clip, shared hand attachment, arcing projectile and preview-before-consumption rules.

The expanded-world rules from the prior acceptance passes remain authoritative:

- forest canopy may create limited sightlines, but any tree directly between the active camera and Ranger must temporarily render as a low-opacity version of that same tree; tree placement and trunk collision remain unchanged;
- the mainland is approximately 2x the previous linear coast scale, while the existing Day-1 beach remains a deep southern inlet so the proven opening route is not moved inland;
- the larger world keeps one authoritative procedural terrain/collision surface, while terrain meshes, shallow-water overlays, forest batches, grass, ferns and numerous static dressing are owned by shared render chunks so distant/off-screen areas do not remain active render batches;
- satellite islands are deterministic but procedurally varied in position, size, proportions, rotation, edge warp, elevation and shoal geometry;
- water remains a lightweight in-house Three.js presentation over the authoritative terrain. Deep water stays inexpensive, while chunked turquoise shallows follow terrain depth substantially inland across low coastal shelves, satellite edges and sandbars;
- walking through traversable shallow water emits pooled expanding ripples around the Ranger without creating a second water-physics system or unbounded particles.

Foundation 0.3.6 remains under device/gameplay acceptance. Later cooking, hostile-enemy behaviour and more advanced structures should extend the interaction boundaries established here rather than bypassing them.

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
