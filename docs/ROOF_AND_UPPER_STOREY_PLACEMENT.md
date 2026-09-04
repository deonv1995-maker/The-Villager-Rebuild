# Roof and upper-storey placement

## Shared physical structure, separate topology interpretation

Roofing and upper floors read the same physical FRAME + RAW top-beam construction state,
but they intentionally do **not** interpret that state through the same topology query.
Four compatible upright `FRAME` posts are not sufficient by themselves: the physical
`RAW` top beams must close the supported perimeter.

A completed perimeter is deliberately a **ring**, not an interior support lattice. The
player should never have to fill the room below with extra FRAME posts or RAW cross-beams
just to unlock the storey above. Interior members may still be built for appearance or
later gameplay, but they are not a prerequisite for the upper floor.

Upper-floor support is a construction-enclosure problem. Completed FRAME-pair RAW beams
are projected onto the canonical physical-Log grid. The beam edges block movement between
one-third-Log construction cells, exterior air is flood-filled around the structure, and
each full-Log cell sealed from that exterior becomes a supported upper-floor bay. This
works for a single room, large rectangles, and concave/stepped or L-shaped footprints
without inventing an interior support grid.

Roofing remains a roof-shape problem. `collectRoofRegions()` continues to identify the
bounded rectangular/cell regions needed for rafters, ridges and roof reflow, and live ROOF
interaction remains locally bounded around the player for mobile responsiveness. The two
queries therefore share one physical construction source of truth while keeping their
separate gameplay responsibilities. Upper-floor enclosure results are cached by
construction revision so the flood-fill is not recomputed every preview frame.

## Upper floors and seamless structural joints

Once a FRAME + RAW beam perimeter is closed, `FLOOR` exposes the canonical split-log floor
slots inside the enclosed structural cells. One physical Log bay is subdivided into the
same three one-third-Log floor strips used on the ground level. The lower storey's occupied
floor strips are not copied and do not gate upstairs placement.

This means the structural ring defines **where an upper floor may exist**, while the
player still decides **which of those slots to build**. A stairwell, ladder opening or
other deliberate hole is preserved simply by leaving that upstairs slot unbuilt; the
system does not auto-fill the floor. Concave and stepped footprints preserve their actual
outline because cells connected to exterior air are not exposed as supported upstairs
floor space. No duplicate upstairs building system or interior post grid is introduced.

A completed structural roof changes the role of that support ring. Once all four rafters
and the ridge for a roof region are physically present, that covered region is treated as
roof-occupied and no longer exposes coincident upper `FLOOR` snap slots. This prevents a
finished roof from stealing replacement floor Logs toward its top frame. Partial roofs do
not lock the region, and neighbouring uncovered support regions remain valid. Because roof
completion is derived from the existing geometry-first roof-member authority and cached by
construction revision, demolishing a roof member automatically reopens the support region
without introducing a second roof-completion flag.

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
top-beam ring. With `FLOOR` selected, that completed enclosure becomes the upper-floor
snap target until that same region is committed to a completed roof. The resulting floor
can carry the next perimeter of FRAME posts and RAW top beams using the same rules again.

Floor targeting must cover the entire physical split-log slot, not only the long-axis
half-length. The shared floor snap range therefore covers the half-cell diagonal plus a
small construction-grid allowance. This removes dead aiming seams at bay/strip boundaries:
when the placement point is still inside a completed support ring, `FLOOR` stays attached
to an upstairs slot instead of silently falling back to a ground-level placement.

In first-person view, the centre reticle contributes vertical targeting intent to that same
`FLOOR` resolver. If a ground-floor repair slot and an upper support slot occupy the same
X/Z, valid candidates are ranked by their distance to the reticle ray height at the normal
construction reach. Looking down at the lower hole therefore selects the lower lattice;
looking up can still select an uncovered upper support. Third-person ordering and all
support, collision, terrain and stair-opening validation remain unchanged.

## Stacked wall selection

A multi-storey building can have lower and upper FRAME pairs at the same X/Z footprint.
`WALL` therefore resolves all nearby compatible frame pairs instead of treating horizontal
proximity as the complete identity of a wall bay. Existing wall rows are matched to a
specific pair by plan position, yaw and structural base height.

An unfinished wall bay retains priority so repeated wall placement finishes the storey the
player has already started. Once that bay has no room for another wall row, it is removed
from the valid placement choices and the coincident upper FRAME pair becomes eligible. If
both coincident levels are empty, the lower bay starts first. This preserves normal
first-storey construction while allowing a completed lower wall to hand placement cleanly
to the upper storey instead of producing a red fourth-row preview.

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

A low split-log platform must also behave like a walking surface rather than a vertical
wall at its outer edge. Horizontal collision therefore allows a grounded actor to enter a
standable collider as soon as the actor footprint reaches a support that is within that
collider's configured step height. This aligns movement with Ranger footprint grounding:
normal foundation floors can be walked onto without pressing Jump, while genuinely high
platforms remain blocking and still require another traversal solution.

## Roof targeting and reflow

A roof destination is created only by physical RAW top-beam support; upright FRAME posts
alone never create a roof region. Roof build sequencing is local to each support region:
a ridge becomes eligible after the rafters for **that region** are complete, and missing
rafters on a different room or storey do not suppress it.

When untouched lower and upper roof candidates occupy the same plan position, runtime
`ROOF` placement starts on the **highest completed support ring**. This is the natural
continuation after the player has built an upper floor, upper FRAME posts and the upper RAW
perimeter. Once any rafter work has started on a lower coincident roof, that region's build
progress takes priority so the remaining members stay on the active storey instead of
jumping upward mid-build. Outer closed-loop/bounded support still wins topology ties over
a smaller frame-cell candidate. Static topology ordering remains deterministic and lower-
first for callers that are not resolving live placement state.

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
- one closed Log bay exposes its full three-strip upstairs floor lattice even when matching lower strips are absent;
- interior FRAME posts or RAW cross-beams are not required to unlock those floor slots;
- unbuilt upstairs slots remain under player control rather than being auto-filled;
- targeting at the diagonal seam between canonical floor slots still resolves to the supported upper storey;
- a completed multi-bay outer ring remains valid even when its far side lies beyond the live roof-preview locality radius;
- a closed concave/stepped outer ring unlocks its enclosed upper-floor space without interior support beams;
- upper-floor support is derived independently from roof-region shape recognition;
- the upstairs walking surface remains on the RAW beam top;
- the next FRAME posts interlock at the RAW beam centreline instead of floating above it;
- upper floors do not create terrain foundation posts;
- reconstructed storey metadata recovers the same structural FRAME seat.

`scripts/verify-first-person-floor-targeting.mjs` locks:

- the first-person centre reticle disambiguates vertically coincident lower and upper `FLOOR` snaps without replacing the shared construction system;
- a demolished ground-floor strip remains repairable while a completed support ring exists above it;
- a complete four-rafter-plus-ridge roof suppresses upper-floor candidates inside that occupied roof region;
- an incomplete roof does not prematurely lock an upper support region.

`scripts/verify-stacked-storey-placement.mjs` locks:

- an untouched coincident roof stack starts on the highest completed FRAME + RAW support ring;
- a partially built lower roof keeps receiving its remaining roof members on that active storey;
- a completed lower wall bay yields to the coincident upper FRAME pair;
- an unfinished lower wall remains active until that bay is complete.

`scripts/verify-platform-traversal.mjs` locks:

- the Ranger can walk from natural terrain onto a normal low split-log platform without Jump;
- movement and Ranger footprint grounding agree at the platform edge;
- a platform above its configured step height still blocks ordinary grounded movement.

`scripts/verify-ranger-grounding.mjs` locks:

- existing footprint-based hillside grounding;
- a Ranger on the lower storey remains on that support while directly beneath an upper floor;
- generic world height queries may still see the highest support;
- once the Ranger's vertical context is actually the upper storey, that support is retained;
- horizontal movement under an upper floor does not change vertical support context.

`scripts/verify-stacked-roof-reflow.mjs` locks:

- stacked roof regions match by plan geometry rather than frame IDs or height;
- static exact stacked-plan topology ordering remains deterministic on the established lower closed support;
- roof sequence eligibility is region-local rather than global across nearby roofs;
- partial roofs do not relocate mid-build;
- complete roofs move to a matching completed higher support as one assembly;
- a raised multi-bay roof cannot steal a shared rafter from a lower neighbour;
- connected bays with shared members may rise together only to one compatible elevation;
- migrated roof members inherit the upper storey identity;
- existing thatch migrates without a Grass refund/rebuild cycle;
- reflow invalidates structure/roof caches and is idempotent until structure changes.
