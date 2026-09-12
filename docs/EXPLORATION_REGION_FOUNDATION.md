# Exploration Region Foundation

## Purpose

The exploration foundation now has two layers: the larger chunk-streamed mainland and visibly distinct macro regions that are strong enough to read during normal play.

The mainland remains **2.25x the original linear coast scale**. The established Day-1 area is preserved, while outer land is divided into deterministic exploration regions that future wildlife, resources, ruins and additional cave entrances can consume through one shared world model.

## Source of truth

`ExpandedIslandTerrainSystem` remains the authoritative terrain surface for height, slope, coastline, playability, sand, shallow water and ecology queries.

`ExplorationRegionSystem` adds deterministic macro-region evaluation on top of that same terrain. It does not create a second terrain mesh, collision surface or biome map.

`src/data/ExplorationRegionDefinitions.js` is the data source for:

- mainland exploration scale;
- macro-region centers, footprint radii and orientation;
- biome identity;
- broad elevation, ruggedness and ridge influence;
- vegetation/canopy multipliers and minimum biome floors;
- bounded region-specific tree quotas used by the existing environment scatter system;
- point-of-interest categories allowed in each region.

The current first regions are:

- `northernHighlands` — a substantially elevated, rugged mountain mass with sparse canopy and cave/pass/lookout eligibility;
- `westernJungle` — a dense forest/jungle core with a strong continuous canopy floor and an additional bounded tree quota;
- `easternWilds` — broken woodland/upland exploration space;
- `southernFrontier` — forested outer transition space.

`terrain.regionAt(x, z)` is the shared query. Later systems must consume this query instead of maintaining competing biome coordinates.

## Strong biome presentation

A biome must be more than a small multiplier on generic terrain.

The western jungle now uses a minimum forest-cover floor that fades with region strength. This solves the previous failure mode where the jungle multiplied the ordinary grove mask but still produced zero canopy wherever that mask was zero.

`EnvironmentScatterSystem` remains the only production tree-placement authority. Region definitions may request a bounded additional tree quota, but those trees still use the same:

- stable `forest-tree-N` IDs;
- collision registration;
- harvesting path;
- instanced production assets;
- `WorldChunkSystem` splitting and culling;
- tree-occlusion registry.

The jungle therefore becomes visibly denser without adding a second tree renderer or a parallel harvesting system.

The northern highlands remain part of the authoritative height field. Their stronger height bias, ruggedness and ridge term create a true mountain-scale landform while preserving the existing `WorldCollisionSystem`, slope limit and traversal rules.

## First cave POI

`src/data/ExplorationPoiDefinitions.js` now contains the first authored exploration POI: `northern-cave-01` in the northern highlands.

`ExplorationPoiSystem` owns POI presentation. The first cave is a chunk-owned, low-cost rock entrance/short alcove with a readable dark interior and side-rock collision. It is deliberately an overworld cave entrance rather than a new underground world or separate physics system.

This first cave establishes the reusable POI boundary. Future cave interiors, ruins and landmarks should extend the POI system and region metadata rather than being hard-coded into terrain rendering.

## World streaming and mobile performance

The mainland remains one mathematical world for gameplay queries and chunked presentation for rendering. Collision and simulation never depend on whether a visual chunk is currently visible.

The base forest budget remains bounded. Additional biome density is expressed as explicit regional quotas rather than scaling every prop count with total island area. This keeps the performance cost measurable and prevents a larger island from silently multiplying all scene content.

The first cave root is also registered with `WorldChunkSystem`, so it does not become permanent always-rendered world geometry.

## Day-1 compatibility

The shipwreck beach, spawn, hunt area, resources and hidden traversal corridor remain protected.

The southern Day-1 coast continues to use the established deep-inlet rule, and the exploration-region activation contract requires zero macro-region terrain influence at protected Day-1 samples.

The dense jungle, mountain mass and first cave are all outside the opening area.

## Incremental milestone rule

This pass strengthens exploration readability without skipping ahead into later gameplay systems. It adds:

1. a true dense jungle/forest core;
2. stronger mountain-scale northern highlands;
3. the first visible cave entrance/alcove;
4. bounded regional scatter budgets;
5. regression coverage and documentation.

It does **not** add a full cave dungeon, abandoned structures, hostile exploration content, quests or settlement systems.

## Verification

`npm run verify:streaming` protects:

- the 2.25x mainland scale and Day-1 isolation;
- deterministic exploration-region definitions;
- a strong jungle canopy floor and bounded regional tree quota;
- mountain-scale highland elevation and ridge contribution;
- the first authored cave POI being inside its declared region and on playable terrain;
- creation of the named cave root, dark interior and walk-in floor presentation;
- the existing satellite-island, chunk-culling, tree-registry and shallow-water contracts.

The full `npm run check` suite remains required before merge, followed by device verification of biome readability, cave readability and mobile performance.
