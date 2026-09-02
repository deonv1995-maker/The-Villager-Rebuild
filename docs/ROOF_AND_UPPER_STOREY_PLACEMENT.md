# Roof and upper-storey placement

## Shared structural authority

Roofing and upper floors use the same bounded closed-perimeter query. Four compatible
upright `FRAME` posts are not sufficient by themselves: the physical `RAW` top beams
must close the supported perimeter. This remains the single structural source of truth
for simple rooms, rectangular multi-bay buildings and stepped/L-shaped footprints.

## Upper floors

Once a perimeter is closed, `FLOOR` may project the occupied floor strips below onto
the top surface of the RAW beams. Projection is footprint-preserving: an intentionally
open strip or absent bay below is not silently filled above. The first upper strip uses
the closed-perimeter support; subsequent strips continue through normal same-level
floor-edge snapping.

Upper floors carry an explicit zero-based `storey` value through runtime state and save
data. Only storey zero participates in terrain adaptation and terrain-to-floor foundation
visuals. Higher floors are supported by the completed structure below, remain standable
through the shared collision system, and expose perimeter corners for the next level of
`FRAME` posts. No centre post or duplicate building system is introduced.

In player terms, a "fully built frame" means the upright perimeter plus its closed RAW
top-beam ring. With `FLOOR` selected, that completed support becomes the preferred upper
floor snap target. The resulting floor can then carry the next perimeter of FRAME posts
and RAW top beams using the same rules again, allowing the structure to grow storey by
storey without a separate upstairs building mode.

## Highest-storey roof reflow

An existing finished roof is treated as a reusable physical assembly rather than a
permanent attachment to the first storey. When a matching higher storey reaches the same
closed RAW top-beam support state, `StackedRoofReflowSystem` moves the already-built
rafters and ridge to that highest supported footprint. Existing thatch panels migrate with
the roof instead of being deleted, refunded or requiring the player to spend Grass again.

Reflow is footprint-scoped and height-independent. Matching lower and upper roof regions
must describe the same X/Z plan geometry and compatible roof-member lengths/orientation.
This lets individual bays of stepped or multi-bay structures rise independently while
preventing a roof from jumping to an unrelated nearby frame. The roof does not move while
a new storey is only partially framed; it waits for the higher closed support ring so the
result remains structurally readable.

FRAME and RAW support members inherit storey metadata from the floor level that supports
them. Roof members inherit the target storey when they reflow. Save capture therefore
persists the final elevated roof/member transforms and the migrated thatch panel IDs as
the authoritative state.

## Roof interaction reach

The ordered `ROOF` flow still places every angled rafter before exposing RAW ridge
segments. Its candidate interaction range spans one physical Log bay plus the standard
forward placement reach so the far rafter remains selectable from outside the structure.
The bounded local topology limits remain unchanged, preventing roof selection from
searching unrelated distant buildings.

## Regression coverage

`scripts/verify-upper-storey-building.mjs` locks the following contracts:

- upper floors require a physically closed RAW top-beam perimeter;
- projected floors mirror occupied strips below and preserve openings;
- upper floors seat on the top-beam surface without terrain foundation posts;
- completed upper floors expose correctly elevated FRAME corners.

`scripts/verify-stacked-roof-reflow.mjs` additionally locks:

- stacked roof regions match by plan geometry rather than frame IDs or height;
- a complete lower roof moves to the highest matching supported storey;
- all four rafters and the ridge move as one existing physical assembly;
- migrated roof members inherit the upper storey identity;
- existing thatch migrates to the new panel IDs without a Grass refund/rebuild cycle;
- reflow invalidates structure/roof caches and is idempotent until the structure changes.
