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

## Multi-strata cave topology and darkness — 2026-09-21

Device feedback showed that lateral bends and gallery-width pulses still left the network
reading as one mostly horizontal tunnel plane. Natural topology now spans roughly the upper,
middle and deep underground bands inside the same deterministic density authority. Each
entrance branch has an entry room, side room, a large lower drop room, a deep room and a
sealed side room before the deep network converges on a much larger central chamber.

Connections deliberately use different vertical roles: moderate slopes, a steep plunge into
the drop room, a substantial return incline, wider gallery routes and signed vertical
meanders between connector endpoints. The generator is therefore allowed to rise as well as
descend instead of applying only small downward offsets. The configured maximum cave depth
is larger, but geometry remains lazily chunked; the island is not globally voxelized.

A sealed room is connected only by a sub-Ranger fissure. The fissure remains genuinely empty
density so the player can see light/space through it, but its vertical clearance is far below
Ranger height and gallery bulges/strong erosion are disabled there. Mining the surrounding
rock uses the existing excavation authority and is the intended way to enlarge the opening.
This creates mine-through discoveries without a scripted door or second collision system.

Global sun, hemisphere, sky-fill and ambient light are depth-attenuated only while Ranger is
actually occupying cave air. The surface/day-night curve remains unchanged. Deep caves are
therefore dark enough to require local illumination; Sprout supplies one bounded cyan
navigation light while allied, and persistent crafted torches provide warm local light.

Streaming now filters activation by both horizontal and vertical feature distance so deeper
strata do not fill the queue while Ranger is still near the entrance. The normal 2 ms/2-chunk
budget remains. Only missing geometry within the configured near-player critical radius may
use the bounded 4 ms/3-chunk recovery budget. This is specifically to reduce visible
background/sky holes without reverting to synchronous cave generation.

Device acceptance must cover: the entrance transition, a steep drop into a wide room, an
uphill route back toward another stratum, a gentler slope, a sealed room visible through its
non-traversable fissure, mining through that fissure, deep darkness with Sprout illumination,
ground/cave-wall torch placement, and visible-chunk pop-in while moving quickly between levels.


## Local cave render prewarming and stale-job pruning — 2026-09-21

Device feedback continued to show slow cave appearance even after vertical-aware activation.
The remaining issue was queue scope: activating one nearby long gallery, drop or chamber could
enqueue every render chunk touched by that feature's full conservative bounds. Those distant
jobs then remained pending after the Ranger moved, competing with geometry that had become
immediately visible.

Natural-cave density remains global and deterministic inside the existing chunk buckets, so
collision, mining, support queries and saves still read the same cave topology. Rendering now
uses a separate cached list of feature-overlap chunk keys and admits only keys inside a local
3D prewarm window around the Ranger. The filtered feature key lists are built once when the
network is initialized; update frames do not repeatedly enumerate full feature bounds.

Pending natural render jobs also have a larger retention window. A job outside that window is
discarded, including a partially sampled natural-streaming job, and can be requested again if
the Ranger later returns. The retention window is deliberately larger than the prewarm window
so ordinary walking does not churn work. Completed chunks, player excavation rebuilds and the
shared density authority are not canceled by this rule.

The normal 2 ms / two-completion budget and the bounded near-player 4 ms / three-completion
recovery budget are unchanged. The optimization reduces irrelevant work rather than raising
the mobile frame-time allowance. Regression coverage verifies the initial prewarm window,
post-travel queue retention and the cached render-key architecture. Physical Android/PWA
acceptance still needs to confirm that walls/rooms appear sooner during fast cave traversal.

## Visible-first cave meshing — 2026-09-21

Android/PWA feedback after local prewarming still showed cave sections materializing too slowly,
including large background/sky gaps while the Ranger was already beside missing geometry. The
queue was smaller, but a partially sampled background chunk could still monopolize the active
mesher until it completed.

Natural cave streaming now classifies critical work against the chunk volume rather than only
its center, with an 18 m near-player safety radius plus half of the chunk diagonal. A newly
critical queued chunk may preempt a farther in-flight chunk. The interrupted generator and its
density revision are stored back in the queue so previous sampling work resumes later instead of
being discarded.

The mesher keeps the same cell size, topology and shared density authority. For each chunk it
pre-resolves the eight possible excavation/natural-feature/floor-edit buckets touched by the
sample lattice, resolves hidden-pocket candidates once per x/z sample column rather than once
per y sample, and avoids constructing corner Vector3 positions for fully solid or fully empty
cells. These are hot-path reductions only; cave shape, collision, mining, floor edits and save
data remain under the existing UndergroundTunnelingSystem.

The normal 2 ms and critical 4 ms frame-time ceilings remain unchanged. Device acceptance should
specifically test walking and fast vertical descent through an entrance branch while watching
for missing cave walls/floors, then verify sustained frame pacing after nearby geometry has
finished streaming.


## Deep distance blackout and lava floors — 2026-09-22

Visible cave streaming remains bounded by the existing local prewarm, 2 ms normal mesh budget
and 4 ms near-player recovery budget. Deep cave presentation now hides any remaining distant
streaming gaps instead of spending more CPU on remote geometry. The authoritative
underground-depth value blends both the scene background and exponential fog toward black;
at full cave darkness the fog uses `UNDERGROUND_LIGHTING.distanceFogDensity`. Surface and
shallow-cave day/night colours remain unchanged because the transition is depth weighted.

Lava is deterministic natural-cave data, not a second terrain or collision system.
`buildNaturalCaveNetwork` derives lava pools from actual chamber floor depth and only allows
deep chamber roles. Pools sit slightly above the existing flat cave floor, so the density
mesh remains the support/collision authority. `UndergroundTunnelingSystem` renders the pools
with one shared emissive material and uses a single non-shadow point light that moves to the
nearest qualifying pool inside a bounded activation radius. This avoids one dynamic light per
chamber on mobile.

Lava contact is exposed through the exploration-POI boundary and applies data-driven survival
damage in `GameApp`; it does not alter mining, cave density, support scans, save schema or
streaming. Device acceptance should verify that distant unbuilt cave geometry reads as black
rather than sky-coloured, lava appears only in genuinely deep rooms, the nearest pool provides
a restrained orange glow, and stepping onto lava drains health and recovers the Ranger at the
shore on defeat.

## Surface-entry streaming priority — 2026-09-22

Android/PWA feedback still showed occasional late cave-mouth geometry even after local
prewarming and visible-first preemption. The remaining case is approach speed: the generic
nearest-chunk queue can spend its first bounded slices on nearby non-entry chunks while the
Ranger is rapidly closing the final distance to the surface opening.

The existing cave density, collision, mining and meshing authority is unchanged. During
network initialization, render chunks touched by the established **entrance** and immediate
**descent** segments are tagged in one cached set. Queued work from that set sorts ahead of
ordinary prewarm work, and its critical recovery distance begins at 30 m instead of 18 m.
Both lanes still use the same resumable generator, the same local prewarm/retention windows,
and the same 4 ms / three-completion hard critical caps. No synchronous entrance build or
second geometry representation is introduced.

The intent is specifically to have the mouth and first descent already materializing during
a fast surface approach. Once underground and away from the entry corridor, the normal
visible-first distance policy continues to control streaming. Device acceptance should test
walking, sprinting and Sprout-assisted fast approaches from several angles and confirm that
the surface opening and first descent no longer appear several beats late while sustained
frame pacing remains acceptable.

