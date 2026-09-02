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

The upper floor's walking surface is seated exactly on the physical top of the supporting
RAW beam ring. The split-log floor body embeds downward into that beam instead of adding
an extra vertical lift. The next storey's FRAME posts therefore begin directly at the
beam/floor support surface, removing the visible floating seam between lower and upper
frame levels while keeping the physical support relationship intact.

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

## Highest-storey roof priority and reflow

When lower and upper roof candidates occupy the same X/Z footprint, the unified `ROOF`
workflow orders the higher candidate first. A completed upper support ring can therefore
never lose to the lower storey merely because the lower topology happened to be enumerated
first. Independent lower wings remain available because normal player-to-candidate distance
still selects the locally relevant roof section; the height priority resolves coincident
stacked candidates, not unrelated nearby roofs.

An existing roof is treated as a reusable physical assembly rather than a permanent
attachment to the first storey. When a matching higher storey reaches the same closed RAW
top-beam support state, `StackedRoofReflowSystem` moves any already-built compatible roof
members to that highest supported footprint. This applies to an in-progress roof as well
as a finished one, so rafters placed before the second storey was completed do not remain
stranded on the lower frame. Existing thatch panels migrate with a completed roof instead
of being deleted, refunded or requiring the player to spend Grass again.

Reflow is footprint-scoped and height-independent. Matching lower and upper roof regions
must describe the same X/Z plan geometry and compatible roof-member lengths/orientation.
This lets individual independent roof sections rise while preventing a roof from jumping
to an unrelated nearby frame. The higher destination itself still requires the closed RAW
support ring; FRAME posts alone do not create a roof support region.

Adjacent multi-bay roofs can share physical boundary rafters. Those connected bays are
therefore treated as one roof assembly for elevation changes: a bay cannot rise if doing
so would steal a shared rafter from another occupied lower neighbour. Every occupied bay
that uses a shared member must have a compatible upper destination at the same elevation
before that shared member moves. This preserves one physical member per structural edge
and avoids duplicate or disappearing rafters on stepped and expanding buildings.

FRAME and RAW support members inherit storey metadata from the floor level that supports
them during stacked-structure synchronization. Roof members inherit the target storey when
they reflow. Save capture therefore persists the final elevated roof/member transforms and
the migrated thatch panel IDs as the authoritative state.

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
- the upper walking surface is flush with the supporting RAW beam top;
- the split-log floor body embeds downward instead of lifting the next FRAME level;
- upper floors do not create terrain foundation posts;
- completed upper floors expose FRAME corners directly on the support surface.

`scripts/verify-stacked-roof-reflow.mjs` additionally locks:

- stacked roof regions match by plan geometry rather than frame IDs or height;
- coincident upper ROOF candidates sort ahead of lower-storey candidates;
- both complete and in-progress lower roofs move to the highest matching supported storey;
- only roof members that already physically exist are moved during partial reflow;
- a partially raised multi-bay roof cannot steal a shared rafter from a lower neighbour;
- connected bays with shared members may rise together only to one compatible elevation;
- migrated roof members inherit the upper storey identity;
- existing thatch migrates to the new panel IDs without a Grass refund/rebuild cycle;
- reflow invalidates structure/roof caches and is idempotent until the structure changes.
