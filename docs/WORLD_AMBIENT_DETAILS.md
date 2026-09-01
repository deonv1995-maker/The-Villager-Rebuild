# World Ambient Detail Layer

## Status

Introduced on 2026-09-01 as the first world-richness pass after the Wild Pig movement/interaction behavior was accepted.

## Purpose

`AmbientWorldDetailSystem` adds low-cost visual variety without introducing new gameplay rules or a second ecology/collision authority.

The first detail set is deliberately small and readable:

- wildflower clusters in suitable open grass;
- mushroom clusters in damp/wooded fern habitat;
- coarse coastal grass on low non-sandy shoreline ground.

These details are environmental dressing only. They are not resources, harvest targets, interaction targets, obstacles, wildlife food, or progression requirements.

## Ownership and data flow

`TestIslandSystem` remains the world orchestrator. `AmbientWorldDetailSystem` owns only decorative detail placement and presentation.

Placement derives from existing world authorities instead of duplicating environment rules:

- `IslandTerrainSystem` / `ExpandedIslandTerrainSystem` provide playable ground, height, slope, shoreline position, grass density, fern density and forest-cover signals;
- `EnvironmentScatterSystem.isGrassClear()` provides the existing reservation boundary around trees, rocks, cliffs and tutorial clearings;
- `WorldChunkSystem` owns visibility/chunk grouping;
- `GrassFieldSystem.constructionFloorCoversVegetation()` remains the shared rule for deciding when a placed floor covers vegetation;
- `ConstructionTerrainAdaptationSystem` remains authoritative for adapted construction-ground height.

No ambient-detail collision is registered with `WorldCollisionSystem`.

## Mobile performance contract

Ambient details use procedural low-poly geometry and `THREE.InstancedMesh` batches rather than individual meshes. Batches are assigned to the existing world chunks when chunking is available.

Default deterministic budgets are:

- 520 wildflower clusters;
- 180 mushroom clusters;
- 320 coastal-grass clusters;
- 1,020 ambient clusters total before terrain/ecology filtering.

The details do not cast shadows. Placement uses a fixed seed so visual density is reproducible and regressions can be tested.

## Construction behavior

Ambient details must not remain visible through player-built floors. The system listens to the existing collision/construction revisions and hides covered instances using the same floor-coverage rule used by the vegetation layer.

This is presentation cleanup only. It does not alter the floor, terrain, collision, construction snap rules or resource economy.

## Preserved boundaries

This pass intentionally does not change:

- Wild Pig movement, flee behavior, hunting, damage, spear interaction or meat drops;
- Ranger movement/camera controls;
- terrain shape, coastline, satellite islands, sandbars or shallow water;
- tree/rock harvesting or gatherable resources;
- construction topology, roof behavior, wall customization or campfire behavior;
- PWA/install/service-worker/Pages architecture.

## Verification

`scripts/verify-ambient-world-details.mjs` verifies that:

- all three ambient categories populate deterministically under valid habitat;
- decorative categories remain instanced;
- they do not add shadow cost;
- placed construction floors hide covered detail instances through the shared vegetation coverage rule.

The verifier is part of the full `npm run check` suite.

## Device acceptance

After deployment, verify on the target Android device that:

- flowers noticeably break up open grassy spaces without becoming visually noisy;
- mushrooms read as occasional forest-floor detail rather than a repeated grid;
- coastal grass strengthens the transition between inland vegetation and the shore;
- the Day-1 route and hunt clearing remain readable;
- no detail visibly intersects trees, rocks or cliffs at distracting scale;
- newly placed floor panels do not leave flowers/mushrooms/coastal grass poking through them;
- movement, camera response, construction and frame rate feel unchanged.
