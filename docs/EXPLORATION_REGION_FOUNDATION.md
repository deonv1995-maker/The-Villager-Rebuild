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
- biome-specific ground profiles such as soil strength, meadow suppression and fern-understory bias;
- bounded region-specific tree quotas used by the existing environment scatter system;
- bounded jungle-floor ambient density for vines, mossy stones and fallen logs;
- point-of-interest categories allowed in each region.

The current first regions are:

- `northernHighlands` — a substantially elevated, rugged mountain mass with sparse canopy and cave/pass/lookout eligibility;
- `westernJungle` — a dense forest/jungle core with a strong continuous canopy floor, fertile shaded soil, fern-heavy understory and bounded jungle-floor dressing;
- `easternWilds` — broken woodland/upland exploration space;
- `southernFrontier` — forested outer transition space.

`terrain.regionAt(x, z)` is the shared query. Later systems must consume this query instead of maintaining competing biome coordinates.

## Strong biome presentation

A biome must be more than a small multiplier on generic terrain.

The western jungle uses a minimum forest-cover floor that fades with region strength. This solves the previous failure mode where the jungle multiplied the ordinary grove mask but still produced zero canopy wherever that mask was zero.

`EnvironmentScatterSystem` remains the only production tree-placement authority. Region definitions may request a bounded additional tree quota, but those trees still use the same:

- stable `forest-tree-N` IDs;
- collision registration;
- harvesting path;
- instanced production assets;
- `WorldChunkSystem` splitting and culling;
- tree-occlusion registry.

The jungle therefore becomes visibly denser without adding a second tree renderer or a parallel harvesting system.

The jungle ground now has a matching biome presentation instead of remaining generic green meadow beneath the denser canopy. The regional ground profile drives the established systems:

- `TerrainSurfacePresentation` blends the jungle floor toward dark fertile soil, damp humus and leaf litter, with restrained moss variation;
- `ExpandedIslandTerrainSystem.grassDensityAt()` reduces generic meadow grass under the canopy while preserving the same ecology query path;
- `GroundCoverPresentationSystem` reduces its short meadow carpet in proportion to jungle strength so the soil remains visible instead of being immediately covered by lawn-like micro-grass;
- `ExpandedIslandTerrainSystem.fernDensityAt()` raises the existing reactive fern field through a regional multiplier and minimum floor rather than introducing a second fern renderer;
- `AmbientWorldDetailSystem` owns non-interactive jungle-floor vines, moss-covered stones and fallen logs alongside its existing ambient world details. These props use deterministic bounded populations, instanced low-poly geometry, chunk ownership and the same construction-floor occlusion rule as the existing ambient dressing.

This separation is deliberate: terrain/region data describes what the biome should be, existing ecology systems decide where reactive vegetation belongs, and the ambient-detail system handles cheap non-interactive dressing. There is no separate jungle coordinate map or competing vegetation simulation.

The northern highlands remain part of the authoritative height field. Their stronger height bias, ruggedness and ridge term create a true mountain-scale landform while preserving the existing `WorldCollisionSystem`, slope limit and traversal rules.

## First cave POI

`src/data/ExplorationPoiDefinitions.js` contains the first authored exploration POI: `northern-cave-01` in the northern highlands.

`ExplorationPoiSystem` owns POI presentation. The cave remains a chunk-owned, low-cost overworld entrance/short alcove rather than a new underground world or separate physics system. Cave readability is **negative-space first**: the entrance must read as a hole cut into a landform before any decorative rock detail is considered.

The current presentation and traversal contract is:

- cave-local **-Z is always the exterior/approach side** and cave-local **+Z is tunnel depth**; the first cave is rotated so its mouth faces the southern mainland route players naturally arrive from, rather than presenting the back of the landform to that route;
- broad terrain-conforming rock masses stay beside and behind the entrance, leaving the near-front centre clear instead of stacking boulders across the player's view;
- a continuous low-poly extruded cliff/tunnel shell contains one large irregular mouth opening, so the opening is real geometric negative space rather than a ring of separate rocks;
- the outer rock value remains visibly separated from the darker tunnel surfaces so the mouth keeps a readable silhouette in the game's low-light night range without adding an unexplained cave light source;
- the shell extends several metres inward and uses darker inner surfaces to create immediate wall/ceiling recession from normal gameplay camera distances;
- small entrance-dressing rocks are restricted to the lateral cliff face and must not intrude into the central aperture;
- freestanding dark tunnel ribs begin only behind the continuous entrance shell, where they can reinforce depth without cluttering the mouth silhouette;
- the recessed ribs, dark rear terminus and visible cave floor sample the same authoritative terrain profile, preventing the short alcove from visually floating through or becoming buried by the highland ground surface;
- the rear darkness remains an irregular cave-shaped terminus rather than a circular black patch;
- a terrain-conforming worn approach reaches out in front of the threshold and visually guides the player toward the opening;
- the established POI definition, chunk ownership and side-rock collision contract remain intact, while the centre of the aperture remains clear for traversal.

This first cave establishes the reusable POI boundary. Future cave interiors, ruins and landmarks should extend the POI system and region metadata rather than being hard-coded into terrain rendering.

## World streaming and mobile performance

The mainland remains one mathematical world for gameplay queries and chunked presentation for rendering. Collision and simulation never depend on whether a visual chunk is currently visible.

The base forest budget remains bounded. Additional biome density is expressed as explicit regional quotas rather than scaling every prop count with total island area. This keeps the performance cost measurable and prevents a larger island from silently multiplying all scene content.

The jungle-floor pass follows the same rule. Vines, mossy stones and fallen logs have explicit maximum populations and are rendered as instanced, no-shadow low-poly geometry grouped by render chunk. Fern density is increased through the already-budgeted reactive fern system rather than adding another reactive field. Device verification must still confirm jungle readability and frame-time stability before any later pass raises these budgets.

The first cave root is also registered with `WorldChunkSystem`, so it does not become permanent always-rendered world geometry. The cave readability pass continues to use simple generated low-poly geometry and shared materials rather than introducing a new asset-loading or terrain system.

## Day-1 compatibility

The shipwreck beach, spawn, hunt area, resources and hidden traversal corridor remain protected.

The southern Day-1 coast continues to use the established deep-inlet rule, and the exploration-region activation contract requires zero macro-region terrain influence at protected Day-1 samples.

The dense jungle, jungle-floor ecology, mountain mass and first cave are all outside the opening area.

## Incremental milestone rule

This pass strengthens exploration readability without skipping ahead into later gameplay systems. It adds:

1. a true dense jungle/forest core;
2. a matching fertile jungle floor with reduced meadow grass, broader ferns, ground vines, mossy stones and fallen logs;
3. stronger mountain-scale northern highlands;
4. the first visible cave entrance/alcove, refined into a negative-space cliff opening with a continuous recessed tunnel shell and an approach-facing, terrain-following walk-in presentation;
5. bounded regional scatter and ambient-detail budgets;
6. regression coverage and documentation.

It does **not** add a full cave dungeon, abandoned structures, hostile exploration content, quests or settlement systems.

## Verification

`npm run verify:streaming` protects:

- the 2.25x mainland scale and Day-1 isolation;
- deterministic exploration-region definitions;
- a strong jungle canopy floor and bounded regional tree quota;
- the western jungle ground profile, including fertile soil strength, reduced generic grass/meadow cover, fern floor and bounded vine/moss-rock/fallen-log density;
- fern dominance over generic grass at the jungle centre through the established ecology queries;
- mountain-scale highland elevation and ridge contribution;
- the first authored cave POI being inside its declared region and on playable terrain;
- creation of the named cave root, dark interior and walk-in floor presentation;
- the existing satellite-island, chunk-culling, tree-registry and shallow-water contracts.

`npm run verify:ground-surface` protects the brown jungle-soil palette, the visible colour separation from ordinary forest ground, rock/sand isolation and the reduction of generic meadow micro-cover under the jungle canopy.

`npm run verify:ambient` protects deterministic ambient budgets, instancing, construction-floor occlusion and the bounded jungle-specific vine, moss-rock and fallen-log batches.

The cave-readability regression additionally protects the approach-facing orientation, lateral/behind landform placement, broad clear aperture, low-light rock/tunnel value separation, continuous extruded cliff/tunnel shell, side-only entrance dressing, terrain-conforming floor/depth cues, irregular dark terminus, terrain-conforming worn approach and the unchanged side-rock collision count. This specifically prevents the cave from regressing into a backwards-facing mound, freestanding boulder pile or rock bridge across the mouth.

The full `npm run check` suite remains required before merge, followed by device verification of jungle-floor readability, jungle mobile performance, cave readability and overall exploration performance.
