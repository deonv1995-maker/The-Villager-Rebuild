# Terrain Generation — Foundation 0.3.1

This document records the current terrain-generation contract while the Foundation 0.3.1 world pass is under visual acceptance.

## Source of truth

`IslandTerrainSystem` owns the continuous island height field, coastline dimensions, terrain mesh extents, surface classification, vegetation suitability and Day 1 route influence. `TestIslandSystem` only orchestrates terrain, environment scatter, interactive grass and the shared `WorldCollisionSystem`. Asset-pack cliff and rock meshes remain visual dressing; they do not replace the authoritative terrain surface.

## Organic-layout rule

The coastline may use a centre-relative polar calculation to define an irregular island boundary, but interior elevation must not use the island centre as its organizing principle.

Interior elevation is therefore composed from deterministic, independently placed features:

- broad multi-frequency terrain variation;
- separated localized highlands and broken ridges;
- off-centre shelves/mesas with warped outlines;
- localized valleys, saddles and ravine cuts;
- additional outer-island rises/basins so expanded land does not become an empty perimeter;
- a narrow Day 1 traversal blend used only to guarantee tutorial access, not to visually organize the island.

Large positive formations must not overlap into a single raised central mass. The middle of the island is intentionally an irregular lowland/saddle network that can be entered on foot while taller landmarks are distributed asymmetrically elsewhere.

## Island scale and coastline contract

Foundation 0.3.1 intentionally uses a larger, more elongated island than the earlier pass. The terrain mesh currently spans 390 × 304 world units, while the irregular playable coastline is derived from a 172 × 132 base ellipse before deterministic coastline distortion.

The island must remain visibly non-round. Increasing world size must not be implemented by scaling the same circular/radial composition outward. New land must receive the same terrain noise, ecological classification and scatter systems as the existing interior.

`getScatterBounds()` is the shared source for vegetation sampling extents. Trees, rocks, understory and interactive grass must derive their candidate area from those terrain-owned bounds rather than maintaining independent hard-coded island dimensions.

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
- The hidden tutorial traversal corridor may reserve enough tree/rock clearance to remain walkable, but it must not produce a wide vegetation trench through the island.
- Visible trail wear only thins grass locally and intermittently. Grass is allowed to grow through and across the route so the path reads as a used landscape feature rather than a road.
- Existing occupancy reservations still keep vegetation away from spawn, the hunt clearing, trees, rocks and cliff dressing.

## Day 1 trail presentation

The tutorial route and the visible trail are deliberately separate concepts.

- `routeCorridorStrengthAt()` owns the narrow hidden traversal guarantee from the spawn area into the central interior.
- The terrain blend along that corridor is intentionally weak and narrow; it may smooth traversal but must not become a visible stripe or central valley.
- `trailWearAt()` owns only the visible worn-ground cue near the early Day 1 area.
- Visible wear is broken into intermittent patches with substantial gaps instead of a continuous chain.
- Visible trail wear ends before the deep island interior and may not draw a line through the centre of the map.
- Trail patches use low-contrast translucent earth/olive colouring close to the surrounding ground, small irregular footprints and slight lateral jitter.
- Environment scatter keeps only the minimum clearance needed for reliable traversal; it must not reveal the hidden route as a tree-free avenue.

## Traversal and collision invariants

- Coast bounds, steep terrain and prop collision continue through `WorldCollisionSystem`.
- Base terrain height and standable support height are separate concerns: base terrain owns slope classification, while support-adjusted height is only used for standing, stepping, landing and falling from rocks/cliff tops.
- Prop support height must never make nearby flat ground appear steep or make a Ranger standing on a rock fail a terrain-slope test.
- Walkable terrain slope is evaluated along the attempted travel direction rather than by unrelated cardinal samples around the destination. The current stylized walk limit is 58 degrees; steeper terrain remains blocked uphill.
- A Ranger already standing on a valid rock/cliff support must be able to move laterally off the support. Once the support disappears beneath the Ranger, the existing drop/fall logic owns the transition back to terrain.
- Intentional drops remain fallable according to the existing collision rules.
- The Day 1 route from the spawn area must remain continuously walkable into the central interior even though the route is no longer visually continuous.
- Major terrain-owned drops remain present away from the centre.
- Dense deterministic forest, interactive grass and occupancy-aware scatter remain separate systems and must continue sampling this same terrain surface.
- A visible solid environment mesh may not be reservation-only. Trees and compact rocks may use circular footprints, while broad cliff faces and future wall-like props use geometry-proportional oriented box footprints in the same shared collision service.
- Broad cliff dressing keeps an inset standable support footprint so the Ranger can land on a plausible top surface without the collider expanding into large invisible corner walls.

## Automated regression checks

`scripts/verify-gameplay.mjs` guards the terrain pass by checking that:

- the playable coastline remains irregular and materially larger than the previous island pass;
- vegetation scatter bounds expand with terrain dimensions rather than staying at the old hard-coded limits;
- the central sample area stays below the raised-mass threshold;
- several major highlands exist away from the centre;
- a terrain-owned escarpment still produces a multi-metre height change;
- equal-radius samples have substantial height variation instead of a radial pattern;
- shared collision can walk the Day 1 route from spawn into the middle without a steep-terrain block;
- sand returns zero grass, tree and understory density;
- the grass field contains both dense patch samples and open gaps;
- visible trail wear contains both readable worn sections and multiple true gaps;
- visible trail wear is zero in the deep interior;
- the hidden tutorial corridor remains active far enough into the island to protect traversal;
- broad oriented environment colliders block traversal through visible cliff faces without behaving like oversized circular invisible walls;
- standable oriented supports still expose a valid top surface for traversal;
- support height does not contaminate base-terrain slope checks beside rocks;
- a Ranger already standing on a rock can walk off its support without being trapped by the side collider;
- stylized hills below the configured walkable slope limit do not require repeated jumping;
- very steep terrain remains non-walkable uphill.

Tree chopping remains gated until this terrain presentation is visually accepted in the deployed build.
