# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.1 — world density, escarpments, hunt-asset and desktop-install test**

This milestone keeps the Day 1 survival loop stable while improving the world presentation before tree chopping is added:

- continuous irregular island terrain with authored large shelves, ravines and multi-metre drops;
- steep terrain is visually exposed as rock while cliff meshes remain dressing rather than the terrain source of truth;
- denser deterministic forest with roughly 440 collision-aware trees, including larger hero-tree variation;
- instanced repeated tree and understory rendering to preserve a mobile-conscious draw-call budget;
- more than ten thousand interactive grass tufts that bend/recover around the Ranger using localized spatial updates;
- wider size/aspect variation for standable rocks and reduced repeated-platform presentation;
- species-neutral Day 1 hunt gameplay with the Qiwii Wild Pig as the current production-asset style test;
- installable Progressive Web App shell so the same verified build can launch from a desktop shortcut/window;
- automated gameplay, runtime-asset, production-build and selected-asset integrity checks.

Tree chopping/log gathering remains intentionally gated until the 0.3.1 world presentation is visually accepted in playtesting.

## Desktop installation

The deployed GitHub Pages build is also the desktop test build; there is no separate gameplay fork.

1. Open the deployed game in a Chromium-based desktop browser such as Chrome or Edge.
2. When the game is installable, use the in-game **INSTALL GAME** button at the lower-left, or the browser's install-app control in the address bar/menu.
3. Accept the install prompt.
4. Launch **The Villager Rebuild** from the desktop/Start menu like a standalone app.

The installed app still receives the same verified production deployment as mobile testing. Its service worker caches visited same-origin assets to make repeat access more convenient; fresh deployments remain network-first when the app is online.

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
