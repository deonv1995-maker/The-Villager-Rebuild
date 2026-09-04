# Stacked wall and connected-roof orientation

## Wall customization ownership

A `SOLID` / `DOOR` / `WINDOW` wall bay is owned by one physical FRAME pair at one structural elevation. Wall rows that share the same X/Z position and wall axis but belong to different `baseY` levels must never be grouped into one customization bay.

`WallPanelCustomizationSystem` therefore keys candidate wall-row groups by plan position, canonical wall axis and structural base level before resolving the owning FRAME pair. The final panel identity remains the FRAME-pair identity (`wall:<frame ids>`). Changing a downstairs wall variant may hide/replace only the rows and collision belonging to that downstairs pair; an upstairs wall directly above it remains visible, solid and collidable unless the player customizes that upper bay separately.

## Wall interior-side authority

A completed closed FRAME + RAW beam footprint is the primary authority for which side of a wall faces the building interior. `WallPanelCustomizationSystem` reuses the same enclosed structural support-cell topology that owns upper-storey floors and stairs, and derives stable interior reference points at both structural levels.

Physical split-log floor strips remain a fallback for incomplete or legacy construction that does not yet expose a closed structural support cell. They are not allowed to override a completed structural footprint. This matters at stairwells: stairs intentionally remove the two upper-floor cells in their opening, but that removal is circulation state rather than a change to the building envelope. The adjacent walls therefore retain their original inward-facing orientation instead of flipping 180 degrees when the stair opening is created or another upper-storey piece increments the structure revision.

## Connected square-roof direction

`RoofTopology` remains the single authority for roof direction used by physical ROOF placement, completed-roof queries, thatching and interior detection.

Rectangular and isolated square roofs keep the existing deterministic rules. A `frame-cell` square inside a stepped or L-shaped footprint uses its adjacent occupied roof cells as the tie-break between its two otherwise-valid gable axes:

- an endpoint cell points its ridge along the connected wing;
- a straight run keeps its ridge along that run;
- an L-corner with equally strong perpendicular neighbours keeps the deterministic canonical axis.

This prevents an extension roof from using an arbitrary world-axis direction when the building footprint provides an unambiguous direction.

## Upper-storey wall direction

A lower `frame-cell` roof beside the next storey's completed FRAME + RAW structural edge treats that nearest upper edge as the stronger gable-direction hint. For an isolated upper edge, the lower ridge therefore points toward the upper-storey wall line instead of leaving the side roof facing across it.

The physical upper FRAME pair and its RAW top beam remain the source of truth. Roof orientation does not depend on whether the wall bay is currently rendered as `SOLID`, `DOOR` or `WINDOW`, so wall customization cannot create competing roof geometry. Only the nearest upper edge at the immediately supported structural level is considered. A balanced upper ring directly over the same cell remains ambiguous and preserves the existing deterministic direction, while unrelated upper structure outside the local cell span is ignored.

This rule is applied by `RoofTopology`, so the same corrected orientation is consumed by live ROOF placement, completed-roof queries, thatching and interior detection without a second roof-snapping system.

## Continuous lower roofs against upper wall runs

When two or more connected lower `frame-cell` bays sit on the same side of a continuous next-storey FRAME + RAW wall run, that longer structural relationship is more important than the isolated-edge rule. Those lower roof bays keep one continuous ridge direction **parallel to the upper wall run**. Physical roof construction is still segmented one Log bay at a time, but adjacent completed slopes share their finished thatch edge so the result reads as one larger lower roof mass that terminates cleanly against the upper-storey wall instead of a row of small competing gables.

The rule is deliberately structural and local. The continuous run must be made from connected upper FRAME pairs with their physical RAW top beams, the lower bays must be connected at the same roof level, and they must lie on the same side of that upper run. A lower bay on the opposite side remains independent, and a single isolated upper edge retains the existing gable-facing behavior. This preserves the established multi-bay physical-Log segmentation rather than introducing a stretched ridge member or a second roof topology.

Each canonical lower roof bay that participates in this polished junction records the exact upper FRAME-pair identity it terminates against. `RoofWallPolishSystem` uses that structural identity only after the lower roof bay is physically complete. If the matching upper wall bay is currently customized as a `DOOR` or `WINDOW`, that opening is reset once to the wall system's normal `SOLID` state so an opening cannot hang visibly through the completed lower roof. The wall customization system remains the owner of wall visuals and collision; the roof system only supplies the structural coverage relationship.

The solid reset is a placement default rather than a permanent lock. After the completed lower roof has applied the default once, a later deliberate player wall customization is left alone. If that roof coverage is actually demolished and later rebuilt, the solid default becomes eligible again. This avoids a hidden frame-by-frame override while still ensuring that newly completed roof/wall intersections start in a polished state.

## Existing completed roofs

`StackedRoofReflowSystem` also canonicalizes an already-completed, non-shared `frame-cell` roof whose persisted member keys belong to the same structural region but whose geometry was built under an earlier direction rule. All four rafters and the ridge move together to the corrected targets. Existing thatch for that region moves and rotates with the roof instead of being treated as demolition/refunded grass.

The reflow deliberately skips incomplete assemblies and members currently satisfying another roof region, preserving the existing shared-rafter safety contract.

When that safety rule preserves a complete perpendicular primary gable at a side-wing/upper-storey intersection, the physical frame is no longer treated as an orphan. `StructureRoofQuery` recognizes the perpendicular five-member assembly as a **completion-only retained roof region** whenever all four rafters and its ridge still physically exist. It does not add another ROOF placement path or compete with `RoofTopology`; it only keeps the already-built primary frame eligible for roof completion, interior coverage and its two thatch panels. If the newly canonical side roof is also complete, both gables expose their own two panels so the intersection can be fully thatched instead of leaving the primary frame bare.

This retained-completion rule is geometry-first and requires the complete perpendicular five-member assembly. Partial stray members do not become a roof, and ordinary live placement continues to follow only the canonical roof direction.

Finished thatch follows the same physical-lifetime rule. A structure revision or temporary local topology-query miss is not demolition by itself. Each thatched panel retains the footprint, eave and ridge geometry needed to verify its original four rafters plus ridge directly against the active physical roof members. While that five-member frame remains complete, the thatch stays in place and Grass is not refunded. Once a required physical roof member is actually removed, the existing removal/refund behavior still applies.

## Regression coverage

- `verify:stacked-walls` proves a downstairs window conversion cannot hide or remove collision from a directly stacked upstairs wall.
- `verify:construction-stability` proves a stairwell can remove its floor strips without flipping the adjacent wall and proves topology-query churn cannot delete/refund thatch while its physical five-member roof frame remains complete.
- `verify:roof-orientation` proves a stepped L footprint rotates the unambiguous wing cell, preserves the stable L-corner, turns a side roof toward the nearest completed upper-storey structural wall edge, ignores unrelated upper edges, keeps a complete retained perpendicular primary gable thatchable as a completion-only roof, and reflows a completed stale roof plus thatch onto the corrected orientation when reflow is safe.
- `verify:roof-wall-polish` proves adjacent lower bays beside a continuous upper wall run share one canonical ridge direction and joined thatch edges, while exact covered upper `DOOR` / `WINDOW` bays default to `SOLID` once per completed roof placement and become eligible again after roof demolition/rebuild.
- The existing wall, roof, stacked-roof, save, traversal, construction and PWA checks remain part of the full CI gate.
