# Underground Cave Presentation

This document records the visual rules for discovered underground pockets.

## Goal

Caves must read as a connected underground landscape rather than smooth empty blobs or round holes, while preserving the existing tunneling architecture, collision authority, save format and mobile performance boundaries.

The visual direction draws from common cave-composition patterns used in exploration and platform games: asymmetrical silhouettes, strong ceiling/floor contrast, perimeter massing, recognizable focal formations, restrained emissive accents and environmental landmarks. The implementation uses those principles rather than copying any specific game's assets or layouts.

## Ownership boundaries

- `UndergroundTunnelingSystem` remains the authoritative density, excavation, support, ceiling and collision source.
- `UndergroundPocketProfile` is the shared geometric source of truth for deterministic chamber floors, walls and ceilings.
- `UndergroundPocketContentSystem` owns presentation and rewards inside discovered deterministic pockets and must read the shared chamber profile rather than reconstructing its own cave shape.
- Cave dressing must not introduce a second collider, terrain height source, mining system or save authority.
- Content is created only when a pocket is discovered and remains deterministic for the same pocket id.
- New presentation should stay lightweight enough for mobile. Avoid per-pocket dynamic lights, particle systems or unbounded procedural mesh counts unless later profiling proves them safe.

## Chamber silhouette rules

A discovered chamber should combine several layers of shape:

- a broad, explicit horizontal cave floor across the usable chamber instead of the lower half of a sphere;
- rotated elliptical chamber lobes and offset side alcoves so walls do not form a circular bowl;
- a higher crown lobe plus lower side ceilings to create an irregular roof silhouette;
- floor detail: boulders, stalagmites, collectible stone and ruins;
- ceiling detail: deterministic stalactites distributed across the chamber rather than only at the perimeter;
- wall detail: broad irregular rock shelves/masses that break up otherwise smooth chamber walls;
- occasional floor-to-ceiling formations near the edge of the traversable area to create stronger landmarks and depth;
- crystal accents used as focal highlights, not as uniform wallpaper.

The cave-density mesh still determines the real walkable void. The deterministic outer pocket radius is only a broad-phase/chunk boundary; it must never be rendered as the visible chamber shape. Presentation geometry is decorative and should stay toward the chamber perimeter so it does not contradict the collision model.

## Readability

The central content footprint must remain readable for Ranger traversal and interactions. Major decorative formations should cluster toward the outer chamber band. Treasure, Sprout shards and collectible stone continue to use their existing interaction rules and deterministic placement.

Crystals may use emissive materials for visual contrast, but the system should avoid adding point lights by default. This gives caves a stronger visual hierarchy without multiplying mobile lighting cost.

## Natural network morphology

The deterministic natural cave network shares the same density/chamber profile rules as player tunneling and hidden pockets. Its surface entrances should read as elongated cave mouths, then transition through descending passages, tight necks, wider galleries, side chambers and larger chambers before joining deeper connectors.

Natural cave morphology is traversal geometry, not a second presentation collider. Decorative pocket content and collectible rewards remain owned by `UndergroundPocketContentSystem`; the natural network does not create a parallel reward economy in this pass. Its primary purpose is exploration scale, connectivity and spatial variety.

The 3D natural cave mesh remains lazy. Only nearby network features are materialized into tunneling chunks, so richer underground topology does not turn the full island into a globally allocated voxel volume.

## Future expansion

Future cave biomes may vary materials, crystal palettes, fungal dressing, water, ruins or resource themes through data-driven presentation profiles. Those variants should continue to reuse the same tunneling density and pocket-discovery systems rather than creating biome-specific cave physics.

## Noise erosion and bounded meshing — 2026-09-21

The natural network previously swept the player-mining arch profile along straight
segments. It therefore retained uniform walls and ceilings even where the topology
connected chambers. Natural segments and chambers now apply deterministic,
world-space, two-scale coherent value noise to erode the side walls and ceiling.
The broad layer creates asymmetric recesses; the finer layer breaks up the rock
silhouette at the existing mesh resolution. This is geometric density variation,
not a random texture or a second decorative/collision shell.

The existing route graph, walkable floors, entrance cuts, minimum clearance,
hidden-pocket reward placement, player excavation profile and save schema remain
unchanged. Noise only enlarges natural voids; it cannot seal an old route or raise
rock through a saved player position. Surface entrance segments retain their
original density to match the terrain's existing mouth openings. Feature bounds
include erosion so adjoining chunk samples agree. This pass does not replace the
network with a full-island random voxel volume or promise winding new routes.

Research references:
- [Minecraft's noise caves](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w06a)
  combine cavern-scale spaces and winding passages with existing cave carvers.
- [GPU Gems: procedural terrain density](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu)
  describes density-field noise at multiple scales. We adapt the principle to the
  existing CPU mesher; we do not introduce a GPU terrain pipeline.

### Performance boundary

A one-chunk-per-frame limit was insufficient: a chunk still completed all work in
one frame. Natural streaming now resumes the same mesher across updates, checking
a 2 ms target between density columns and occupied mesh cells. This is a soft
budget: a cell, geometry finalization or garbage collection can exceed it. Only a
complete geometry is attached. Terrain edits invalidate in-progress sampling;
reset/load discards it. Local player edits still rebuild synchronously through the
same generator, preserving immediate mining and sculpting behavior.

Each chunk samples its 13×13×13 lattice once (2,197 queries rather than 13,824),
reuses terrain height within each vertical sampling column, and skips tetrahedron
work in wholly solid/empty cells. This is about 84% fewer lattice density queries,
not an 84% overall frame-rate claim. Priority sorting happens between chunk jobs.
Existing world-chunk distance/frustum rendering remains responsible for visibility.

Validation: `npm run verify:cave-network` includes deterministic noise, changing
wall widths, preserved floors, conservative bounds, scheduler suspension,
completed-geometry equivalence, edit invalidation and save/reset checks. The full
`npm run check` remains the release gate.

`node scripts/benchmark-cave-streaming.mjs [checkout-path]` measures CPU updates
until 30 chunks finish near the first entrance. On the development runtime,
sequential runs compared main `e3190a5` to this pass: update median ~180 → 2.46 ms,
p95 ~442 → 3.83 ms, max ~489 → 8.08 ms, total CPU ~5.81 → 2.79 s. The new run spans
more updates and samples modified geometry; these are illustrative CPU results,
not identical-work throughput or mobile FPS guarantees. Approach a cave before
judging pop-in: streaming deliberately spreads work over more frames.

Device acceptance remains required: walk into/out of mouths, inspect walls and
ceilings, mine and sculpt during streaming, save/reload underground, and watch for
visible late chunks and sustained lag. This environment's browser cannot create a
WebGL context even on the prior live build, so it cannot certify visual acceptance.


## Noise-steered passage meanders — 2026-09-21

Wall erosion alone was not enough to remove the constructed-tunnel silhouette because
the route centerlines were still straight chords between chambers. Non-entrance
natural passages now cache two low-frequency, world-space noise samples when the
deterministic cave graph is created. Those samples become cubic route controls that
bend passages sideways, introduce gentle downward dips, and add a bounded mid-route
width bulge while preserving the established endpoints and chamber connections.

This is intentionally not per-frame path noise. Runtime collision and meshing evaluate
the cached cubic controls with ordinary arithmetic; the expensive coherent-noise
sampling happens only during cave-network construction. Surface mouth segments remain
unwarped so their 3D density continues to match the existing elliptical terrain cuts.

The route warp is bounded by both passage length and explicit mobile-safe maxima. Feature
bounds include the cached controls and bulge, so chunk activation remains conservative.
The existing resumable 2 ms mesh budget, one shared density/collision authority, save
schema, excavation system and world-chunk rendering boundary remain unchanged.

## Gallery pockets and faster prewarming — 2026-09-21

Device screenshots after the first meander pass showed that rough walls and a curved
centerline were not enough: long sections still read as constructed tunnels, and streamed
geometry remained visibly late. This pass changes the rhythm of the existing routes rather
than adding a second cave generator.

Each non-entrance natural passage now caches two separated width pulses alongside its
cubic controls. The pulses create wider gallery-like pockets with narrower necks between
them, and the cached lateral warp is stronger. Surface mouth alignment, established route
endpoints, chamber ownership, collision/density authority, mining, floor support and save
data remain unchanged. Width and bend noise is still sampled only when the deterministic
network is built; density queries use cached arithmetic.

Performance work targets total useful CPU work as well as frame pacing. Feature bounds
remain conservative for seam safety, but activation now rejects horizontal chunk cells
that do not overlap the sampled curved passage footprint before they enter the mesh queue.
Natural activation starts farther ahead so useful geometry can prewarm before the Ranger
reaches it. The scheduler may complete up to two already-cheap chunks in an update, but
the existing 2 ms soft deadline remains the primary guard.

The marching-tetrahedra hot path also reuses interpolation/corner scratch and writes the
already-known flat face normal while emitting vertices. It no longer allocates edge
vectors repeatedly or calls a second full `computeVertexNormals()` pass after building a
chunk. Player mining and floor edits still use the same geometry generator synchronously,
so there is no alternate render/collision representation.

Acceptance remains device-based: approach a cave from outside, enter without waiting for
walls to appear, traverse several neck/gallery cycles, verify the spaces no longer read as
a continuous man-made tunnel, mine/sculpt, save/Continue underground, and watch for
sustained Android/PWA frame drops or visible chunk pop-in.
