# Technical Architecture

## Objective

Build a stable mobile-first browser game foundation that can expand from a Day 1 survival slice into a living settlement without repeating the dependency, boot, UI-coupling and system-duplication problems of the legacy project.

## Recommended stack

- Three.js installed as a project dependency, not loaded through browser import maps.
- A standard bundler/dev server such as Vite for local development and production builds.
- ES modules authored in source code, bundled into deployment output.
- GitHub Pages or itch.io deployment from generated production files rather than directly relying on a fragile CDN module graph.
- Automated build/smoke checks before stable deployment.

The exact package versions should be pinned when implementation starts.

## Critical boot rule

The startup path must remain small and boring.

Boot responsibilities should be limited to environment checks, dependency initialization, game creation, asset/loading state and transition into gameplay. Optional UI or gameplay experiments must not become static critical boot dependencies unless they are required to start the game.

## Proposed source boundaries

The exact folder names may evolve, but the responsibilities should remain separated:

- `core/` — game loop, time, events, shared state and lifecycle.
- `rendering/` — scene, camera, lighting, LOD and rendering concerns.
- `world/` — island, terrain, environment population and interactable world resources.
- `player/` — Ranger movement, health/hunger/stamina, interaction and equipment.
- `items/` — data-driven resource/item definitions and inventory rules.
- `crafting/` — recipes, crafting actions, cooking and future production recipes.
- `building/` — custom structural building, blueprints and building designation.
- `settlement/` — Town Centre, storage, settlement state and progression.
- `villagers/` — recruitment, jobs, navigation intent, homes and routines.
- `animals/` — wildlife, hunting targets and later domesticated/farm animals.
- `combat/` — damage, simple hostile AI and player combat.
- `tutorial/` — data-driven objectives and first-discovery system.
- `ui/` — HUD, mobile controls, discovery cards and menus.
- `data/` — declarative definitions for items, jobs, buildings, animals and progression.
- `assets/` — selected game-ready source assets with documented provenance.

## Foundation 0.3 world boundaries

The Day 1 island keeps one continuous terrain but no longer relies on one monolithic island implementation:

- `TestIslandSystem` — world composition/orchestration only;
- `IslandTerrainSystem` — authoritative coastline, regional height, slope, terrain mesh, water and Day 1 path surface;
- `EnvironmentScatterSystem` — production environment asset loading, deterministic placement, exclusion/reservation footprints and environment collision registration;
- `GrassFieldSystem` — instanced fine-grass geometry and localized player interaction/recovery;
- `WorldCollisionSystem` — shared coastline/slope/obstacle/support traversal policy;
- `WorldLayout` — shared Day 1 spatial anchors such as spawn, tutorial pickups, boar clearing and path center function.

These boundaries are deliberately usable by future villagers/animals. An NPC controller may make different movement decisions than the Ranger, but it should query the same terrain/collision world rather than inventing a second obstacle model.

## Shared systems over duplicated systems

The same world concepts should be used by the player and villagers.

Examples:

- one resource definition for logs;
- one tree-harvest rule;
- one settlement storage API;
- one building-resource requirement model;
- one day/night clock;
- one item registry;
- one world collision/traversal service;
- one accepted environment-placement footprint map during world generation.

Player input and NPC decision-making can differ, but they should invoke shared domain actions rather than maintain separate copies of game logic.

## Data-driven definitions

Items, resources, recipes, jobs, NPC house types, production buildings, animals and discovery text should be defined in data/configuration wherever practical.

Adding a new resource should usually mean registering its data and assets, not adding another special-purpose subsystem.

## Event boundaries

Systems should communicate through explicit APIs/events rather than directly reaching into unrelated UI or implementation details.

Examples of meaningful domain events:

- item discovered;
- resource harvested;
- item stored;
- day started / night started;
- building designated;
- villager recruited;
- job assigned;
- house completed.

## Mobile performance

The architecture must assume mobile hardware from the beginning.

Key strategies include:

- instanced repeated vegetation where appropriate;
- localized grass interaction: spatially index instances and update only grass near/recovering from the player rather than every blade every frame;
- deterministic scatter with reserved footprints so density can increase without creating costly overlap-repair passes;
- LOD/culling for environment assets;
- limited active AI updates based on distance/relevance;
- bounded villager population;
- pooled/reused effects where useful;
- conservative shadow and lighting budgets;
- texture and mesh optimization during asset import;
- touch-first UI and control sizing.

## Save-game design

Persistence should be designed around stable IDs and data state rather than serialized scene objects.

Likely persistent state includes player survival state, discoveries, inventory/storage, world resource changes where necessary, settlement buildings/designations, recruited villagers, villager homes/jobs, time/day and progression stage.

A formal save schema should be created before permanent progression is implemented.

## Deployment rule

Production builds must be generated and verified. No critical runtime dependency should rely on an Android browser correctly interpreting import maps or resolving package-style bare imports from arbitrary CDN scripts.
