# Roof footprint plan authority

## Decision

Roof direction for connected construction is resolved from the completed physical `FRAME` + `RAW` roof-support footprint before any upper-storey wall or main-roof hint is applied.

A roof is therefore interpreted in two layers:

1. **roof shape / mass** — which connected bays belong to one continuous ridge direction and where perpendicular masses meet;
2. **physical construction segmentation** — the individual one-Log rafters and ridge segments the player must place.

The first layer owns shape. The second layer must never be allowed to reinterpret each square bay as an independent little roof.

`RoofTopology` remains the single roof authority used by placement, completion, thatch, interior detection and persistence. `RoofFootprintPlan` is a pure topology helper used by `RoofTopology`; it is not a second construction system.

## Continuous roof masses

Connected `frame-cell` bays are traced along both valid square-cell axes. A straight connected run receives one deterministic `roofMassKey` and one ridge axis across all of its bays.

The run is still physically segmented one construction bay at a time:

- each bay keeps its own ridge Log descriptor;
- shared boundary rafters remain geometry-first shared members;
- a two-bay run still uses two physical ridge Logs rather than one stretched Log;
- finished adjacent panels retain their shared edge so the result reads as one continuous pitch.

The mass identity exists to stop later orientation heuristics from turning that continuous run into repeated side-by-side gables.

## Perpendicular junctions

When a structural cell belongs to connected runs on both perpendicular axes, it exposes the established stable primary region plus the deterministic live `:cross` region.

The two live regions now record the two different footprint `roofMassKey` values. The shared cell is also classified as a `corner`, `tee` or `cross` junction from the connected footprint. This classification is structural metadata for diagnostics and future junction finishing; the player still uses the normal unified `ROOF` workflow and does not select a special junction tool.

The longer connected run is the primary mass when the two axes have different run lengths. Equal runs use the existing deterministic canonical axis tie-break. This keeps the primary identity stable while making the chosen direction reflect the actual building footprint rather than frame iteration order.

## Orientation authority hierarchy

For connected `frame-cell` roofing, the authority order is now:

1. **connected roof footprint mass**;
2. upper-storey host/wall metadata for coverage relationships only;
3. isolated/canonical square-cell tie-breaks where no connected mass exists.

Once `footprintOrientationLocked` is set, an upper wall or resolved main roof may record `upperWallPairKey`, `upperWallRun` or `hostRoofRegionKey`, but it may not rotate that lower roof mass.

This specifically prevents a later upper storey from changing an already correct two-bay lower pitch into two sideways gables. It also prevents completed lower roof work from becoming invalid merely because a structurally related upper roof appears later.

## Wall polish boundary

`RoofWallPolishSystem` continues to use exact upper FRAME-pair identity to default a covered upper `DOOR` or `WINDOW` back to `SOLID` once when the lower roof is completed.

That metadata relationship does not own roof geometry. Wall presentation/collision remains owned by the wall system, while connected roof direction remains owned by the footprint plan.

## Existing cross-gable contract

The physical junction still uses the existing two live perpendicular five-member gable assemblies for the current construction milestone. This pass changes **which roof mass owns each direction** and prevents incorrect host-driven rotation; it does not introduce a second junction item or alter resource costs.

Junction classification is now explicit so a later visual-finishing pass can trim valley/intersection thatch from the same structural source of truth without re-deriving the building shape from rendered meshes.

## Invariants

- A connected straight run is one logical roof mass.
- Physical ridge members remain one Log per bay.
- Adjacent bays in one mass use the same ridge axis.
- A perpendicular connected branch receives a different roof mass identity.
- Junction primary and `:cross` regions remain deterministic and perpendicular.
- Connected footprint orientation outranks upper-wall and host-roof orientation hints.
- Host/wall ownership metadata remains available for wall polish.
- Existing geometry-first roof-member occupancy remains authoritative.
- No terrain, collision, controls, ecology, world-generation, PWA or unrelated building behavior is changed.

## Regression coverage

`scripts/verify-roof-orientation-reflow.mjs` now proves that:

- the horizontal and vertical arms of the representative stepped footprint receive stable mass identities;
- the junction exposes both perpendicular masses;
- a later upper structural edge cannot rotate the connected lower branch;
- a synthetic main-roof host can annotate ownership without changing the footprint-owned ridge.

`scripts/verify-roof-wall-polish.mjs` reproduces the reported two-bay lower run against an upper structure and proves that both bays remain one pitch even when a perpendicular main-roof host exists, while the junction cross and exact wall-polish metadata remain intact.
