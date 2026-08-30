# The Villager Rebuild

A mobile-first 3D survival and settlement-building game.

The player always controls one main Ranger. The game begins with a shipwreck and hands-on survival, then gradually develops into a small living settlement where recruited villagers automate gathering, hunting, construction and production while the player continues to explore, build and manage the village.

## Core fantasy

Survive alone -> establish a home base -> recruit survivors -> give them homes and permanent jobs -> automate repetitive work -> develop food and production -> grow a camp into a village, town and eventually a fantasy island city.

## Current milestone

**Foundation 0.3.4 — build the first campfire**

The Foundation 0.3.3 tree/log loop has passed device verification and remains authoritative. This milestone advances only the next Day 1 step:

- the first campfire is a world structure, not an inventory item or a second crafting economy;
- its data definition requires exactly three Logs and owns its placement radius/distance/slope limits;
- the existing contextual craft button switches from the spear glyph to a campfire glyph when the Day 1 log requirement is complete; desktop continues to use C;
- building validates playable terrain, slope and shared world-collision clearance before consuming materials;
- the campfire searches a small set of nearby placements around the Ranger so a valid build is not tied to one hard-coded tutorial coordinate;
- a successful build consumes the three Logs once, creates a grounded stone/log/fire presentation, and registers one normal world collision handle;
- the fire uses lightweight emissive geometry plus one non-shadow-casting point light so it can later become the shared cooking/sleep proximity anchor without introducing a separate visual system;
- the Ranger exposes facing direction through its controller boundary for placement instead of world systems reading controller internals;
- a dedicated campfire regression contract runs alongside the existing gameplay, tree-harvest, landscape, runtime-asset, production-build and PWA checks.

Foundation 0.3.4 remains under device/gameplay acceptance before cooking is added. The next playable milestone after this gate is **cook the gathered meat at the campfire**.

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
