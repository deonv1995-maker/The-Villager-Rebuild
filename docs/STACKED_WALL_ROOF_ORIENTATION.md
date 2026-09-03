# Stacked wall and connected-roof orientation

## Wall customization ownership

A `SOLID` / `DOOR` / `WINDOW` wall bay is owned by one physical FRAME pair at one structural elevation. Wall rows that share the same X/Z position and wall axis but belong to different `baseY` levels must never be grouped into one customization bay.

`WallPanelCustomizationSystem` therefore keys candidate wall-row groups by plan position, canonical wall axis and structural base level before resolving the owning FRAME pair. The final panel identity remains the FRAME-pair identity (`wall:<frame ids>`). Changing a downstairs wall variant may hide/replace only the rows and collision belonging to that downstairs pair; an upstairs wall directly above it remains visible, solid and collidable unless the player customizes that upper bay separately.

## Connected square-roof direction

`RoofTopology` remains the single authority for roof direction used by physical ROOF placement, completed-roof queries, thatching and interior detection.

Rectangular and isolated square roofs keep the existing deterministic rules. A `frame-cell` square inside a stepped or L-shaped footprint uses its adjacent occupied roof cells as the tie-break between its two otherwise-valid gable axes:

- an endpoint cell points its ridge along the connected wing;
- a straight run keeps its ridge along that run;
- an L-corner with equally strong perpendicular neighbours keeps the deterministic canonical axis.

This prevents an extension roof from using an arbitrary world-axis direction when the building footprint provides an unambiguous direction.

## Upper-storey wall direction

A lower `frame-cell` roof beside the next storey's completed FRAME + RAW structural edge treats that nearest upper edge as the stronger gable-direction hint. The lower ridge therefore points toward the upper-storey wall line instead of leaving the side roof facing across it.

The physical upper FRAME pair and its RAW top beam remain the source of truth. Roof orientation does not depend on whether the wall bay is currently rendered as `SOLID`, `DOOR` or `WINDOW`, so wall customization cannot create competing roof geometry. Only the nearest upper edge at the immediately supported structural level is considered. A balanced upper ring directly over the same cell remains ambiguous and preserves the existing deterministic direction, while unrelated upper structure outside the local cell span is ignored.

This rule is applied by `RoofTopology`, so the same corrected orientation is consumed by live ROOF placement, completed-roof queries, thatching and interior detection without a second roof-snapping system.

## Existing completed roofs

`StackedRoofReflowSystem` also canonicalizes an already-completed, non-shared `frame-cell` roof whose persisted member keys belong to the same structural region but whose geometry was built under an earlier direction rule. All four rafters and the ridge move together to the corrected targets. Existing thatch for that region moves and rotates with the roof instead of being treated as demolition/refunded grass.

The reflow deliberately skips incomplete assemblies and members currently satisfying another roof region, preserving the existing shared-rafter safety contract.

## Regression coverage

- `verify:stacked-walls` proves a downstairs window conversion cannot hide or remove collision from a directly stacked upstairs wall.
- `verify:roof-orientation` proves a stepped L footprint rotates the unambiguous wing cell, preserves the stable L-corner, turns a side roof toward the nearest completed upper-storey structural wall edge, ignores unrelated upper edges, and reflows a completed stale roof plus thatch onto the corrected orientation.
- The existing wall, roof, stacked-roof, save, traversal, construction and PWA checks remain part of the full CI gate.
