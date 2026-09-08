# Panel construction rebuild

## Decision

The Villager construction model is moving from log-for-log structural inference to explicit semantic building modules.

The authoritative direction is:

`semantic building state -> placement/rendering/collision -> persistence`

instead of:

`individual placed Logs -> geometric inference -> guessed structure -> repair on save/restore`

A Floor is one canonical building cell. Wall, Door and Window are semantic wall-family modules on canonical edges. Stairs are one semantic flight between an adjacent canonical cell pair. Roofs are explicit semantic roof zones over exact connected top-floor cells.

Rendered Logs, thatch courses, roof wings and junction trim remain presentation. They never become the source of truth for structural identity.

## Current live slice

The player-facing semantic construction vocabulary includes:

- **Floor Panel**;
- **Solid Wall Panel**;
- **Door Wall Panel**;
- **Window Wall Panel**;
- **Stairs**;
- **Roof**;
- **Remove** through the same Hammer demolition path.

Floor, Wall, Door, Window and Stairs have passed their current device acceptance. Roof has progressed from the initial rectangular gable slice to exact connected irregular footprints so L-, T-, U- and stepped orthogonal buildings can be roofed without filling or charging for empty bounding-box cells.

This milestone does **not** re-enable the legacy individual-Log structural workflow. General upper-storey editing and player-selected mono-pitch roofs remain separate later semantic slices.

## Log resource transition and costs

Trees still create a visibly full-sized Log world pickup. When the Ranger collects it, the Log enters `InventorySystem` and becomes semantic construction material.

The material flow remains:

`tree -> world Log pickup -> inventory Log -> semantic building module`

Current semantic costs are:

- Floor Panel: **3 Logs**;
- Solid Wall Panel: **3 Logs**;
- Door Wall Panel: **3 Logs**;
- Window Wall Panel: **3 Logs**;
- Stairs: **3 Logs** for one complete flight;
- Roof: **5 Logs per actual covered canonical Floor cell**.

The 3-Log Stair cost preserves the established complete stair-flight material budget. The semantic flight is no longer assembled or recognized from separately placed physical Logs.

The 5-Log Roof cell budget preserves the old one-bay gable material meaning of four rafters plus one ridge member while removing the old member-by-member inference graph from structural authority. An irregular five-cell Roof therefore costs 25 Logs even when its rectangular bounds contain more than five cells.

Successful demolition returns the exact semantic cost. Failed dependency checks return nothing and do not consume Hammer durability.

## Per-structure local grids

Each building remains owned by `PanelStructureRegistry` and has its own local grid origin and snapped yaw. Separate buildings can therefore face different directions without individual modules inside one building acquiring competing rotation rules.

The canonical cell size remains `2.9 x 2.9` world units, derived from the authoritative Log length.

Stored Floor and Stair identities remain integer cell coordinates. Aggregate geometry queries may use fractional local coordinates only to find the geometric centre of an explicit multi-cell Roof assembly; those fractional coordinates are never persisted as canonical cell identity.

## Floor and wall-family identity

Floor Panels occupy integer cell coordinates plus storey.

Wall-family Panels occupy canonical shared edges. The east edge of one cell and west edge of its neighbour resolve to the same structural edge key, preventing duplicate wall-family modules by state identity rather than mesh overlap.

Each wall retains semantic owner/interior information, variant and inward/outward normals. Rendering derives world transforms from that data. Ranger facing, camera yaw and saved mesh transforms do not decide structural orientation.

Door and Window remain semantic wall records with `variant: 'door'` or `variant: 'window'`. Door uses a traversable central opening with two side colliders. Window uses lower, side and upper collision sections around a bounded visible opening and remains non-traversable.

## Semantic Stairs

One Stair module is one complete flight between **two adjacent same-level Floor cells**.

`PanelConstructionGrid` owns its canonical pair identity. Reversing the source/target cell pair resolves to the same Stair key, so the same physical flight cannot be duplicated from the opposite side.

A Stair flight:

- requires two adjacent Floor cells on the same storey and structural level;
- reserves their shared edge as a Stair opening, so a Wall cannot compete for that edge;
- prevents either supporting Floor from being demolished while the flight exists;
- creates six deterministic standable tread colliders using the shared Ranger collision system;
- keeps every tread rise within the existing Ranger step-up contract;
- materializes as a complete split-Log stair visual with side stringers;
- consumes and refunds exactly 3 Logs;
- round-trips through semantic save/Continue state without transform inference.

The Stair target cell also reserves the corresponding upper-storey opening. Future upper-storey Floor expansion must respect that opening instead of silently laying a Floor across the top of the stairs.

General upper-storey Floor placement is **not** activated by this milestone.

## Explicit semantic Roof zones

Roof is not built by placing individual angled/ridge Logs and asking topology code to infer what structure they formed.

The live Roof mode creates one explicit semantic Roof zone over an **exact connected set of eligible top-floor cells**. The zone stores:

- the canonical covered Floor cell set;
- storey;
- roof form;
- a deterministic primary ridge-axis tie-break.

The player-facing Roof form remains **gable**. `mono-pitch` remains a recognized schema form for future semantic expansion but is not yet a separate Hammer choice.

### Connected footprint selection

Roof targeting starts from eligible cells on one structural level and resolves the cardinally connected component containing the targeted area. Disconnected Floor islands are not merged into one purchase.

A candidate Floor cell is excluded when:

- it already belongs to another Roof zone;
- a higher Floor exists directly above it;
- it is reserved by the current Stair-opening contract.

The exact connected set may be rectangular, L-shaped, T-shaped, U-shaped, stepped or another orthogonal polyomino.

### Complex roof-wing planning

`SemanticRoofFootprintPlanner` converts the exact semantic cell set into deterministic, non-overlapping rectangular gable wings for presentation.

It compares row-run and column-run partitions and chooses a stable low-complexity plan. Each wing uses the longer dimension for its ridge; square ties use the selected partition axis.

The planner is deliberately **exact-cell**:

- no wing may contain a Floor cell that is absent from the Roof zone;
- an L-shaped Roof does not fill its missing inner corner;
- a U-shaped Roof does not cover its courtyard;
- stepped notches remain open;
- cost is never derived from a bounding rectangle.

The wing plan is presentation derived from semantic state. It is not serialized as a second roof topology.

### Roof support

A Roof preview is valid only when:

- every covered canonical Floor cell exists at the same structural level;
- no covered cell already belongs to another Roof zone;
- no covered cell is reserved by the current Stair opening contract;
- there is no higher Floor directly above the candidate cells;
- every exposed perimeter edge of the exact candidate footprint has a semantic Wall-family support.

Internal edges shared by covered Roof cells do not require Walls. If the Roof surrounds an open notch or courtyard, that inner exposed perimeter also needs Wall-family support. Door and Window count as structural wall-family support.

When extending beside an already-roofed neighbour, the shared Roof-to-Roof edge is treated as internal rather than requiring an artificial dividing Wall.

### Roof presentation

The polished Roof presentation reuses the established semantic thatch finish:

- five overlapping thatch courses per slope;
- irregular straw fringe;
- thick eave/fascia treatment;
- rounded ridge finish;
- wall seating that removes the former floating daylight gap;
- closed exposed gable presentation;
- no loose semantic rafter pieces visibly hanging inside.

Irregular footprints create multiple polished gable wings under one Roof assembly root. Normal thatch overlap plus low-profile presentation-only junction masks hide exposed shared-edge seams. These junction meshes do not own collision or structural identity.

This slice still does not add walkable sloped-roof collision. Roof traversal remains a separate gameplay decision.

### Roof dependencies, removal and cost

Roof support Walls cannot be demolished while the Roof depends on them. The Roof must be removed first.

Roof removal returns `5 x coveredCellCount` Logs exactly.

For large irregular Roofs, Hammer Remove measures interaction reach to the nearest covered semantic Roof cell rather than requiring the Ranger to reach the aggregate bounding-centre point. The whole connected Roof is still removed as one semantic zone.

## Placement and targeting

The Hammer remains the only player-facing entry point for semantic construction. Inventory Logs are material only.

Selecting Hammer opens the compact semantic build dock. The live choices are Floor, Wall, Door, Window, Stairs, Roof and Remove. Choosing any live construction mode collapses the expanded selector so the world preview remains visible.

Third person uses Ranger-relative semantic candidates. First person scores semantic candidates against the centre-camera aim ray. Roof uses the nearest covered cell for large-footprint reach/scoring rather than forcing interaction through the aggregate centre.

Green means the candidate and inventory cost are valid; red means support/occupancy/clearance/material requirements are not satisfied.

The legacy physical-log build tray remains isolated transition infrastructure and is hidden during semantic panel construction.

Desktop `B` cycles all live semantic build modes. `E` / `V` confirms placement and `G` / Escape closes the semantic construction session.

## Demolition

Hammer Remove targets the materialized semantic module ID. First person raycasts exact module meshes; third person resolves the nearest in-range semantic target.

The system removes semantic state first. If dependency rules reject removal, runtime collision, visuals, inventory and Hammer durability remain unchanged.

After successful removal:

- every owned collider is removed;
- Floor supports are removed where applicable;
- the exact semantic material cost is refunded;
- one normal Hammer durability use is recorded.

Roof uses its stored exact covered-cell count when resolving the refund, so irregular and multi-cell Roof zones cannot refund a rectangular estimate or one-cell base price.

## Persistence boundary

The game save boundary remains schema **2** / world revision **2**. The panel-grid schema remains compatible with prior semantic saves. Complex Roof footprints require no new stored mesh fields and no panel-grid schema bump because `roofZones` already store arbitrary canonical cell-key sets.

`PanelConstructionSystem.snapshot()` stores semantic registry/grid state. Save/Continue recreates runtime visuals and collision from that state without re-consuming Logs.

A restored Stair recreates all six walkable tread colliders. A restored Roof re-runs the deterministic footprint planner from its stored cell keys and recreates the gable-wing presentation. No Three.js transforms, wing meshes or junction masks are serialized as structural authority.

Older rectangular semantic Roof saves remain valid: their exact cell set simply re-plans as one rectangular wing.

## Verification

`npm run check` protects the semantic Floor/Wall/Door/Window/Stairs/Roof contracts and complex Roof footprint behavior.

`verify-panel-construction-grid.mjs` covers:

- canonical Floor/edge identity;
- wall ownership and variants;
- canonical two-cell Stair identity;
- Stair shared-edge ownership and Floor dependency rules;
- upper Stair-opening reservation;
- explicit Roof-zone identity and overlap rejection;
- Roof support-Wall demolition dependency;
- semantic snapshot/restore.

`verify-panel-construction-runtime.mjs` covers:

- all semantic material costs;
- six Stair tread colliders using the same Ranger support resolver;
- exact Stair placement/remove/refund and restore;
- wall-supported basic gable Roof preview;
- exact Roof placement/remove/refund and restore;
- Roof support-Wall protection;
- semantic Roof materialization;
- the established single-owner Hammer targeting boundary.

`verify-semantic-roof-polish.mjs` protects the finished thatch appearance, wall seating, closed gables and clean interior shell.

`verify-complex-semantic-roof.mjs` protects:

- exact L/T/U footprint partitioning;
- absence of bounding-box bridging or charging for void cells;
- disconnected Floor-island isolation;
- exact 5-Logs-per-real-cell cost;
- one semantic Roof zone owning the exact irregular cell set;
- multi-wing materialization;
- Save/Continue re-planning from semantic state;
- near-covered-cell demolition targeting and exact refund;
- live Hammer use of the complex Roof specialization.

`verify-tree-harvest.mjs` protects the shared inventory-Log material contract and asserts Stairs/Roof remain inside semantic Hammer construction rather than returning to the legacy physical-log tray.

## Android acceptance gate

Stairs have passed the current physical acceptance gate. The active device gate is now the complex semantic Roof.

Using an irregular building such as an L-, T-, U- or stepped footprint, verify:

- Roof appears as the same live Hammer choice;
- 3P and 1P previews follow the actual connected top-floor footprint;
- the preview does **not** bridge empty/notched/courtyard cells inside the footprint bounds;
- missing outer or inner perimeter support produces an invalid/red preview;
- the HUD total equals exactly **5 Logs x actual covered Floor cells**;
- separate building wings receive sensible deterministic gable directions;
- thatch junctions look coherent without obvious floating gaps or open accidental seams;
- the polished wall seating and external gable finish remain intact;
- support Walls refuse removal while the Roof depends on them;
- Hammer Remove can target the large Roof from a nearby covered edge and refunds the exact total;
- save -> close -> Continue restores the same irregular footprint and wing arrangement.

Do not progress into general upper-storey construction or player-selected mono-pitch roofs until this complex Roof device gate passes.

## Preserved systems

This milestone intentionally preserves terrain/world generation, ecology, Ranger locomotion/camera, general inventory/crafting, tools/durability, combat, campfire behavior, common collision, PWA/install architecture and deployment architecture.

Legacy physical construction code remains transition infrastructure only. Complex semantic Roof gameplay must not reconnect structural authority to it.
