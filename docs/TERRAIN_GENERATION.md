# Terrain Generation — Foundation 0.3.2

This document records the current terrain/landscape contract while the Foundation 0.3.2 world pass is under visual acceptance.

## Source of truth

`IslandTerrainSystem` owns the continuous main-island height field, satellite-island definitions, shallow sandbar surfaces, coastline dimensions, terrain mesh extents, surface classification, vegetation suitability and Day 1 route influence. `TestIslandSystem` orchestrates terrain, environment scatter, reactive grass, reactive ferns, distant mountain presentation and the shared `WorldCollisionSystem`.

Asset-pack cliff and rock meshes remain visual dressing; they do not replace the authoritative terrain surface. Distant mountain silhouettes are presentation-only and never participate in terrain height, collision or playable bounds.

## Organic-layout rule

The coastline may use a centre-relative polar calculation to define an irregular main-island boundary, but interior elevation must not use the island centre as its organizing principle.

Interior elevation is composed from deterministic, independently placed features:

- broad multi-frequency terrain variation;
- separated localized highlands and broken ridges;
- off-centre shelves/mesas with warped outlines;
- localized valleys, saddles and ravine cuts;
- additional outer-island rises/basins so expanded land does not become an empty perimeter;
- a narrow Day 1 traversal blend used only to guarantee tutorial access, not to visually organize the island.

Large positive formations must not overlap into a single raised central mass. The middle of the island remains an irregular lowland/saddle network that can be entered on foot while taller landmarks are distributed asymmetrically elsewhere.

## Main island, satellite islands and sandbars

Foundation 0.3.2 preserves the accepted Foundation 0.3.1 main-island coastline and main-island elevation function. The larger terrain mesh now also contains five smaller irregular satellite islands placed asymmetrically around that coastline.

Satellite-island rules:

- satellite definitions are data owned by `IslandTerrainSystem`, not independent decorative meshes;
- every satellite uses a rotated, warped elliptical footprint so the group does not read as repeated circles;
- satellite height is generated as part of the same continuous terrain surface and therefore works with the existing height/collision path;
- satellite interiors may support grass, ferns, trees and understory through the same ecology methods as the main island;
- satellite beaches remain sand and must return zero vegetation suitability;
- the main island's existing terrain heights and central traversal contract are not rescaled or reorganized to make room for the new land.

Each satellite is linked toward the main island by a terrain-owned narrow sandbar. Sandbars vary around the waterline so sections can read as exposed wet sand or shallow water. They are intentionally low, sandy and vegetation-free. `isPlayable()` includes the protected centre width of these sandbars so the Ranger can traverse them through the existing `WorldCollisionSystem`; no bridge-specific collision path is introduced.

`getScatterBounds()` remains the shared source for vegetation candidate extents. The bounds now include the satellite-island envelope so ecology systems do not maintain a second set of world dimensions.

## Archived-game reference

The archived `deonv1995-maker/The-Villager-` project remains reference material only. Its useful terrain characteristic is the combination of broad non-radial variation, separated regional features, localized knolls/basins, irregular cliff edges and a landscape that continues visually beyond the immediate play area. The rebuild keeps that feel without copying the archived terrain architecture wholesale.

## Vegetation distribution contract

Vegetation placement is terrain-driven rather than renderer-driven. `IslandTerrainSystem` is the single source of truth for surface classification and ecological suitability; vegetation systems only sample those values.

- `isSandAt()` defines main beaches, satellite beaches and sandbars and must return zero vegetation suitability.
- Grass, ferns, trees and understory may never spawn on sand.
- Vegetation thins progressively near coastlines instead of ending in a hard inland wall.
- Slope, regional habitat and broad moisture variation influence the shared vegetation suitability field.
- `forestCoverAt()` owns the deterministic grove-scale canopy field used both by tree density and subtle terrain darkening. This keeps forest shading and forest placement visually related without introducing a second random mask.
- Grass uses a separate deterministic multi-scale patch field so it forms dense irregular clumps with real open ground between them instead of being uniformly sprinkled across land.
- Tree placement uses the slower forest-cover field so woodland forms pockets, edges and clearings instead of a uniform grid or a copy of the grass pattern.
- Understory follows suitable woodland/grass habitat and shares the same sand and slope exclusions.
- `fernDensityAt()` combines suitable soil, forest cover and a damp-patch field, biasing ferns toward sheltered woodland rather than distributing them uniformly.
- The hidden tutorial traversal corridor may reserve enough tree/rock clearance to remain walkable, but it must not produce a wide vegetation trench through the island.
- Visible trail wear only thins grass locally and intermittently. Grass is allowed to grow through and across the route so the path reads as a used landscape feature rather than a road.
- Existing occupancy reservations keep fine vegetation away from spawn, the hunt clearing, trees, rocks and cliff dressing.

## Shared reactive vegetation

Character-reactive ground vegetation now uses one movement/recovery implementation: `ReactiveVegetationFieldSystem` in `GrassFieldSystem.js`.

`GrassFieldSystem` and `FernFieldSystem` configure that shared engine with different geometry, density fields, scale ranges and bend/recovery tuning. Both systems therefore use the same spatial grid, local Ranger velocity, outward/movement-weighted bend, compression and recovery behavior.

This is intentionally one reaction source of truth. Future low vegetation should configure or extend the shared engine instead of reimplementing a second per-frame proximity/bend loop.

The fern geometry is procedural and instanced. It uses broad radial fronds rather than importing another asset dependency, keeping the landscape pass deterministic and avoiding a new runtime asset/CI integrity surface.

## Environmental shading and forest enclosure

Foundation 0.3.2 adds two low-cost enclosure layers without enabling expensive full-scene dynamic shadows:

- terrain vertex colour receives a subtle forest-cover tint, so dense groves visually darken the ground beneath them;
- scene sky/fog/light balance is slightly cooler and less flat, increasing separation between sunlit clearings, wooded ground and distant haze.

The renderer still keeps full shadow maps disabled for mobile-first performance. Tree batches remain instanced and the new fern field is also instanced.

## Distant off-limits mountains

`DistantMountainSystem` creates two deterministic instanced rings of low-poly mountain silhouettes outside the playable terrain envelope.

- mountains exist only to increase perceived world scale and close empty ocean sightlines;
- they are placed beyond all main/satellite playable bounds;
- they have no collision and are not queried by `heightAt()` or `isPlayable()`;
- the farther ring is taller/darker while the nearer haze ridge is lower/lighter;
- both rings use scene fog so they read as distant landforms instead of reachable terrain;
- the camera far plane and water presentation extend far enough to render the silhouettes across the ocean.

## Day 1 trail presentation

The tutorial route and the visible trail remain separate concepts.

- `routeCorridorStrengthAt()` owns the narrow hidden traversal guarantee from the spawn area into the central interior.
- The terrain blend along that corridor remains weak and narrow; it may smooth traversal but must not become a visible stripe or central valley.
- `trailWearAt()` owns only the visible worn-ground cue near the early Day 1 area.
- Visible wear is broken into intermittent patches with substantial gaps instead of a continuous chain.
- Visible trail wear ends before the deep island interior and may not draw a line through the centre of the map.
- Environment scatter keeps only the minimum clearance needed for reliable traversal; it must not reveal the hidden route as a tree-free avenue.

## Traversal and collision invariants

- Coast bounds, satellite bounds, sandbar bounds, steep terrain and prop collision continue through `WorldCollisionSystem`.
- Upright Ranger grounding samples the terrain beneath the full foot/body footprint and uses its highest contact point. A centre-only height sample is not sufficient on hillsides because rising ground inside the Ranger collision radius can intersect the visible body. This presentation correction does not alter the authoritative terrain field, slope limits or horizontal collision ownership.
- Base terrain height and standable support height remain separate concerns: base terrain owns slope classification, while support-adjusted height is only used for standing, stepping, landing and falling from rocks/cliff tops.
- Prop support height must never make nearby flat ground appear steep or make a Ranger standing on a rock fail a terrain-slope test.
- Walkable terrain slope is evaluated along the attempted travel direction. The stylized walk limit remains 58 degrees; steeper terrain remains blocked uphill.
- A Ranger already standing on a valid rock/cliff support must be able to move laterally off the support.
- Intentional drops remain fallable according to the existing collision rules.
- The Day 1 route from the spawn area must remain continuously walkable into the central interior.
- Major terrain-owned drops remain present away from the centre.
- Dense deterministic forest, reactive grass, reactive ferns and occupancy-aware scatter remain separate presentation systems sampling the same terrain surface.
- A visible solid environment mesh may not be reservation-only. Trees and compact rocks may use circular footprints, while broad cliff faces and future wall-like props use geometry-proportional oriented box footprints in the same shared collision service.

## Automated regression checks

`scripts/verify-gameplay.mjs` continues to guard the accepted Foundation 0.3.1 terrain/traversal contracts, including central lowland access, distributed highlands, non-radial elevation, sand exclusions, hidden route access and prop/collision behavior.

`scripts/verify-landscape.mjs` adds Foundation 0.3.2 landscape checks for:

- at least five deterministic satellite islands;
- traversable satellite interiors above the waterline;
- a traversable, sandy, shallow sandbar connection;
- non-zero inland fern habitat and zero fern density on beach sand;
- fern population through the shared reactive vegetation engine;
- actual bend/compression activation when the player moves through nearby ferns;
- deterministic instanced distant mountain rings rather than collision-bearing world geometry.

`npm run check` runs both gameplay and landscape contracts before the production build and the existing runtime-asset/PWA verification.

Tree chopping remains gated until this Foundation 0.3.2 landscape presentation is visually accepted in the deployed build.
