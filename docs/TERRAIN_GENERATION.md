# Terrain Generation — Foundation 0.3.1

This document records the current terrain-generation contract while the Foundation 0.3.1 world pass is under visual acceptance.

## Source of truth

`IslandTerrainSystem` owns the continuous island height field. `TestIslandSystem` only orchestrates terrain, environment scatter, interactive grass and the shared `WorldCollisionSystem`. Asset-pack cliff and rock meshes remain visual dressing; they do not replace the authoritative terrain surface.

## Organic-layout rule

The coastline may use a centre-relative polar calculation to define an irregular island boundary, but interior elevation must not use the island centre as its organizing principle.

Interior elevation is therefore composed from deterministic, independently placed features:

- broad multi-frequency terrain variation;
- separated localized highlands and broken ridges;
- off-centre shelves/mesas with warped outlines;
- localized valleys, saddles and ravine cuts;
- a narrow Day 1 route blend used only to guarantee tutorial traversal.

Large positive formations must not overlap into a single raised central mass. The middle of the island is intentionally an irregular lowland/saddle network that can be entered on foot while taller landmarks are distributed asymmetrically elsewhere.

## Archived-game reference

The archived `deonv1995-maker/The-Villager-` project is reference material only. Its useful terrain characteristic is the combination of broad non-radial variation, separated regional features, localized knolls/basins and irregular cliff edges. The rebuild keeps that *feel* without copying the archived terrain architecture wholesale.

## Vegetation distribution contract

Vegetation placement is terrain-driven rather than renderer-driven. `IslandTerrainSystem` is the single source of truth for surface classification and ecological suitability; the grass and environment-scatter systems only sample those values.

- `isSandAt()` defines the dry beach/low sand surface and must return zero vegetation suitability.
- Grass, trees and understory may never spawn on sand.
- Vegetation thins progressively as it approaches the beach instead of ending in a hard inland wall.
- Slope, regional habitat and broad moisture variation influence the shared vegetation suitability field.
- Grass uses a separate deterministic multi-scale patch field so it forms dense irregular clumps with real open ground between them instead of being uniformly sprinkled across the island.
- Tree placement uses a slower independent grove field so woodland forms pockets, edges and clearings instead of a uniform grid or a copy of the grass pattern.
- Understory follows suitable woodland/grass habitat and shares the same sand and slope exclusions.
- The worn Day 1 path core remains free of grass, with a soft transition back into vegetation at its edges.
- Existing occupancy reservations still keep vegetation away from spawn, the hunt clearing, trees, rocks and cliff dressing.

## Traversal and collision invariants

- The larger Foundation 0.3 island dimensions remain unchanged.
- Coast bounds, steep terrain and prop collision continue through `WorldCollisionSystem`.
- Intentional drops remain fallable according to the existing collision rules.
- The Day 1 route from the beach must remain continuously walkable into the central interior.
- Major terrain-owned drops remain present away from the centre.
- Dense deterministic forest, interactive grass and occupancy-aware scatter remain separate systems and must continue sampling this same terrain surface.
- A visible solid environment mesh may not be reservation-only. Trees and compact rocks may use circular footprints, while broad cliff faces and future wall-like props use geometry-proportional oriented box footprints in the same shared collision service.
- Broad cliff dressing keeps an inset standable support footprint so the Ranger can land on a plausible top surface without the collider expanding into large invisible corner walls.

## Automated regression checks

`scripts/verify-gameplay.mjs` guards the terrain pass by checking that:

- the playable coastline remains irregular;
- the central sample area stays below the raised-mass threshold;
- several major highlands exist away from the centre;
- a terrain-owned escarpment still produces a multi-metre height change;
- equal-radius samples have substantial height variation instead of a radial pattern;
- shared collision can walk the Day 1 route from spawn into the middle without a steep-terrain block;
- sand returns zero grass, tree and understory density;
- the grass field contains both dense patch samples and open gaps;
- the Day 1 path core remains grass-free;
- broad oriented environment colliders block traversal through visible cliff faces without behaving like oversized circular invisible walls;
- standable oriented supports still expose a valid top surface for traversal.

Tree chopping remains gated until this terrain presentation is visually accepted in the deployed build.
