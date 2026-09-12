# Exploration Region Foundation

## Purpose

This pass begins the larger exploration direction without skipping ahead into cave interiors, abandoned-structure gameplay, enemies or later settlement systems.

The island already had a chunk-streamed mainland at roughly twice the original linear scale. The exploration foundation extends that mainland modestly to **2.25x the original linear coast scale** and gives the added land explicit macro-region identity so future caves, ruins, landmarks, wildlife and resources can be placed through one shared world model rather than independent random systems.

## Source of truth

`ExpandedIslandTerrainSystem` remains the authoritative terrain surface for height, slope, coastline, playability, sand, shallow water and ecology queries.

`ExplorationRegionSystem` adds deterministic macro-region evaluation on top of that same terrain. It does not create terrain meshes, collision surfaces or a second biome map.

`src/data/ExplorationRegionDefinitions.js` is the data source for:

- mainland exploration scale;
- macro-region centers, footprint radii and orientation;
- biome identity;
- broad elevation/ruggedness influence;
- vegetation/canopy bias;
- future point-of-interest categories allowed in each region.

The current first regions are:

- `northernHighlands` — reachable mountain/highland terrain, thinner canopy, future caves/passes/lookouts;
- `westernJungle` — denser jungle ecology, future caves/ruins/hidden clearings;
- `easternWilds` — broken woodland/upland exploration space, future ruins/caves/lookouts;
- `southernFrontier` — forested transition space, future ruins/clearings/trail remnants.

`terrain.regionAt(x, z)` is the shared query. Systems added later should consume this query instead of maintaining their own competing biome coordinates.

## Terrain and ecology rules

The new mountain/highland mass is part of the authoritative height field. It is therefore reachable terrain governed by the existing `WorldCollisionSystem`; it is not another presentation-only `DistantMountainSystem` silhouette.

Macro regions may bias the established vegetation suitability and forest-cover fields, but they do not own tree placement themselves. Existing grass, fern, tree, ground-cover and environment-scatter systems continue to sample the terrain-owned ecology functions.

This distinction is important for the western jungle: jungle density is a terrain/ecology characteristic, not a second jungle renderer or a hard-coded prop collection.

## World streaming and mobile performance

The mainland remains one mathematical world for gameplay queries and chunked presentation for rendering. Increasing world size must not make collision or simulation depend on chunk visibility.

The current tree and rock scatter budgets remain bounded. This pass intentionally does not multiply object counts with world area. Visual density and mobile performance must be device-tested before later passes increase jungle prop counts, add vines/canopy layers or introduce numerous POIs.

Any future high-volume exploration dressing must register with `WorldChunkSystem` rather than attaching permanently to the world root.

## Day-1 compatibility

The established shipwreck beach, spawn, hunt area, resources and hidden traversal corridor remain protected.

The southern Day-1 coast continues to use the existing deep-inlet rule, so increasing mainland scale expands the world around the opening rather than moving the opening inland.

The new deep-exploration mountain and jungle regions are deliberately outside the Day-1 spawn area.

## Future POI boundary

The `poiTypes` stored on macro-region definitions are **placement eligibility metadata only** in this pass. They do not spawn content yet.

The later POI system should use these region tags plus terrain constraints such as slope, coastline distance, spacing and safe-zone exclusions to place caves, abandoned structures, lookouts and other discoveries deterministically.

Caves should remain entrance/overworld POIs with separately managed interiors unless a later verified architecture decision explicitly changes that model. Abandoned structures should use reusable modular definitions rather than one-off world code.

## Incremental milestone rule

This pass is limited to the exploration foundation:

1. modest mainland expansion;
2. deterministic macro regions;
3. first real reachable highland/mountain terrain;
4. jungle ecology bias;
5. future POI eligibility metadata;
6. regression coverage and documentation.

It does **not** add cave interiors, abandoned structures, hostile exploration content, quests or later-phase settlement systems. Those are separate verified passes after the current playable milestone remains stable.

## Verification

`npm run verify:streaming` protects:

- the 2.25x mainland scale;
- the preserved Day-1 southern inlet and spawn;
- deterministic unique exploration-region definitions;
- authoritative region/biome resolution at each region center;
- reachable region centers;
- real elevated northern highland terrain;
- denser jungle canopy bias and thinner mountain canopy bias;
- future cave/ruin eligibility metadata;
- the existing satellite-island, chunk-culling, tree-registry and shallow-water streaming contracts.

The full `npm run check` suite remains required before merge.
