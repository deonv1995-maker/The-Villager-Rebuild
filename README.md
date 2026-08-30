# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.3 — first tree chopping and log gathering**

This milestone advances the accepted Foundation 0.3.2 landscape/install foundation without replacing its terrain, collision, ecology or PWA architecture:

- the Day 1 sequence now advances from harvested meat to the first tree-chopping objective;
- existing deterministic forest trees remain the authoritative tree population rather than spawning a second harvest-only tree set;
- a dedicated tree-harvest system references the existing tree collision handles and instanced render batches;
- the first tutorial tree requires three deliberate swings, driven by a data definition rather than a hard-coded one-hit removal;
- desktop continues to use the shared E interaction while mobile keeps one contextual interaction button and switches its glyph from the hand to an axe only when a tree is targeted;
- a lightweight Ranger axe presentation temporarily replaces the equipped spear presentation during each chop without changing spear inventory state;
- when the tree is felled, only that tree instance is hidden, its trunk collider is removed through the shared collision system and a stump remains at the same terrain position;
- the felled tree spawns three normal Log pickups through the existing `GatherableSystem`, so logs enter the same inventory/resource path used by sticks, stones and later shared player/NPC resource handling;
- after the first tree falls, tutorial targeting prioritizes the dropped logs until all three are gathered;
- tree/log regression checks run beside the existing gameplay, landscape, runtime-asset, production-build and PWA contracts.

Foundation 0.3.3 remains under device/gameplay acceptance before the next Day 1 step is added. The next playable milestone is **build the first campfire**.

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
- `docs/TECHNICAL_ARCHITECTURE.md` — intended technical foundation.
- `docs/DEVELOPMENT_RULES.md` — implementation and stability rules.
- `docs/ROADMAP.md` — staged development plan.
- `docs/DECISIONS.md` — important agreed design/technical decisions.
- `docs/ASSET_REGISTRY.md` — asset-pack audit and selection record.
