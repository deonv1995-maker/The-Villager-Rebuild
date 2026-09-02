# Roof and upper-storey placement

## Shared structural authority

Roofing and upper floors use the same bounded closed-perimeter query. Four compatible
upright `FRAME` posts are not sufficient by themselves: the physical `RAW` top beams
must close the supported perimeter. This remains the single structural source of truth
for simple rooms, rectangular multi-bay buildings and stepped/L-shaped footprints.

## Upper floors and seamless structural joints

Once a perimeter is closed, `FLOOR` may project the occupied floor strips below onto
the top surface of the RAW beams. Projection is footprint-preserving: an intentionally
open strip or absent bay below is not silently filled above. The first upper strip uses
the closed-perimeter support; subsequent strips continue through normal same-level
floor-edge snapping.

An upper storey has two intentionally different vertical references:

- the **walking surface** sits on the physical top of the supporting RAW beam;
- the next **FRAME structural seat** is the centreline of that same beam.

This distinction is required for natural timber framing. If FRAME posts start on the
walking surface, they sit one full beam radius above the lower posts and the building
reads as two disconnected frames. `frameSeatYForFloor()` is therefore the authority for
FRAME placement: storey zero seats on its floor surface, while higher storeys interlock
into the supporting beam by one physical Log radius. The floor remains correctly walkable
above the beam while consecutive vertical posts visually meet through the horizontal joint.

Upper floors carry an explicit zero-based `storey` value through runtime state and save
data. Only storey zero participates in terrain adaptation and terrain-to-floor foundation
visuals. Higher floors are supported by the completed structure below and expose perimeter
corners for the next FRAME level. No centre post or duplicate upstairs building system is
introduced.

In player terms, a "fully built frame" means the upright perimeter plus its closed RAW
top-beam ring. With `FLOOR` selected, that completed support becomes the upper-floor snap
target. The resulting floor can carry the next perimeter of FRAME posts and RAW top beams
using the same rules again.

## Multistorey walkable support

World geometry may contain several standable surfaces at the same X/Z. Generic world
queries are still allowed to ask for the highest physical support, but Ranger locomotion
must not use that global answer. Doing so makes an upstairs floor become "ground" while
the Ranger is walking underneath it and causes both the character and camera to jump to
the upper storey.

`WorldCollisionSystem` therefore tracks the actor's current vertical support context.
`TestIslandSystem.walkableHeightAt()` resolves only standable surfaces reachable from that
level; an upper floor several metres above the Ranger is ignored until the actor actually
reaches that level through valid movement. `RangerGrounding` uses this walkable query for
its footprint samples while generic placement/world queries keep their existing highest-
support semantics. The collision move resolver uses the same level-aware support rule so
movement and visual grounding cannot disagree.

## Roof targeting and reflow

A roof destination is created only by physical RAW top-beam support; upright FRAME posts
alone never create a roof region. Roof build sequencing is local to each support region:
a ridge becomes eligible after the rafters for **that region** are complete, and missing
rafters on a different room or storey do not suppress it.

When lower and upper candidates occupy the same plan position, the established lower/
outer closed support wins the exact tie instead of automatically jumping to the highest
FRAME level. This keeps the player's current roof build anchored to the completed structure
being worked on. Outer closed-loop/bounded support also wins an exact topology tie over a
smaller frame-cell candidate. Normal player-to-candidate distance still selects distinct
nearby roof wings.

An existing **complete** roof is treated as a reusable physical assembly. When a matching
higher storey reaches a closed RAW top-beam support state, `StackedRoofReflowSystem` may
move the complete rafters + ridge assembly to that matching higher footprint. In-progress
roofs do not move mid-build. This prevents individual rafters from appearing to jump between
storeys while the player is still constructing the lower roof. Existing thatch migrates
with a completed roof instead of being deleted, refunded or requiring another Grass cost.

Reflow remains footprint-scoped and height-independent. Matching lower and upper regions
must describe the same X/Z plan geometry and compatible roof-member lengths/orientation.
Adjacent multi-bay roofs may share physical boundary rafters; those connected bays may
change elevation only when every completed region sharing a moved member has a compatible
destination at the same elevation. A lower side wing therefore remains lower when no
matching upper support exists.

FRAME and RAW support members inherit storey metadata from the structural floor seat that
supports them. Roof members inherit the target storey when a complete assembly reflows.

## Roof interaction reach

The unified `ROOF` flow still exposes angled rafters before the ridge for each individual
roof region. Its interaction range spans one physical Log bay plus the standard forward
placement reach so far rafters remain selectable from outside the structure. Bounded local
topology limits prevent selection from searching unrelated distant buildings.

## Regression coverage

`scripts/verify-upper-storey-building.mjs` locks:

- upper floors require a physically closed RAW top-beam perimeter;
- projected floors mirror occupied strips below and preserve openings;
- the upstairs walking surface remains on the RAW beam top;
- the next FRAME posts interlock at the RAW beam centreline instead of floating above it;
- upper floors do not create terrain foundation posts;
- reconstructed storey metadata recovers the same structural FRAME seat.

`scripts/verify-ranger-grounding.mjs` locks:

- existing footprint-based hillside grounding;
- a Ranger on the lower storey remains on that support while directly beneath an upper floor;
- generic world height queries may still see the highest support;
- once the Ranger's vertical context is actually the upper storey, that support is retained;
- horizontal movement under an upper floor does not change vertical support context.

`scripts/verify-stacked-roof-reflow.mjs` locks:

- stacked roof regions match by plan geometry rather than frame IDs or height;
- exact stacked-plan ties remain on the established lower closed support;
- roof sequence eligibility is region-local rather than global across nearby roofs;
- partial roofs do not relocate mid-build;
- complete roofs move to a matching completed higher support as one assembly;
- a raised multi-bay roof cannot steal a shared rafter from a lower neighbour;
- connected bays with shared members may rise together only to one compatible elevation;
- migrated roof members inherit the upper storey identity;
- existing thatch migrates without a Grass refund/rebuild cycle;
- reflow invalidates structure/roof caches and is idempotent until structure changes.
