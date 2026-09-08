# Panel construction rebuild

## Decision

The Villager construction model is moving from log-for-log structural inference to explicit semantic building modules.

The authoritative direction is:

`semantic building state -> placement/rendering/collision -> persistence`

instead of:

`individual placed Logs -> geometric inference -> guessed structure -> repair on save/restore`

A Floor is one canonical building cell. Wall, Door and Window are semantic wall-family modules on canonical edges. Stairs are one semantic flight between an adjacent canonical cell pair. Roofs are explicit semantic roof zones over canonical top-floor cells.

Rendered Logs remain presentation. They never become the source of truth for structural identity.

## Current live slice

The player-facing semantic construction vocabulary now includes:

- **Floor Panel**;
- **Solid Wall Panel**;
- **Door Wall Panel**;
- **Window Wall Panel**;
- **Stairs**;
- **Roof**;
- **Remove** through the same Hammer demolition path.

Floor, Wall, Door and Window were physically accepted on the installed Android PWA before this Stairs/Roof milestone. Stairs and Roof are the current device-acceptance gate.

This milestone does **not** re-enable the legacy individual-Log structural workflow. It also does not skip ahead to general upper-storey editing, mono-pitch player selection or complex roof-junction authoring. Those remain later semantic slices.

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
- Roof: **5 Logs per covered canonical Floor cell**.

The 3-Log Stair cost preserves the established complete stair-flight material budget. The semantic flight is no longer assembled or recognized from separately placed physical Logs.

The 5-Log Roof cell budget preserves the old one-bay gable material meaning of four rafters plus one ridge member while removing the old member-by-member inference graph from structural authority. A two-cell explicit Roof zone therefore costs 10 Logs, a three-cell zone 15 Logs, and so on.

Successful demolition returns the exact semantic cost. Failed dependency checks return nothing and do not consume Hammer durability.

## Per-structure local grids

Each building remains owned by `PanelStructureRegistry` and has its own local grid origin and snapped yaw. Separate buildings can therefore face different directions without individual modules inside one building acquiring competing rotation rules.

The canonical cell size remains `2.9 x 2.9` world units, derived from the authoritative Log length.

Stored Floor and Stair identities remain integer cell coordinates. Aggregate geometry queries may use fractional local coordinates only to find the geometric centre of an explicit multi-cell module such as an even-width Roof zone; those fractional coordinates are never persisted as canonical cell identity.

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

General upper-storey Floor placement is **not** activated by this milestone. That system will be introduced separately once the current Stairs/Roof slice is physically accepted.

## Explicit semantic Roof zones

Roof is no longer built by placing individual angled/ridge Logs and asking topology code to infer what structure they formed.

The live Roof mode creates an explicit **gable Roof zone** over a deterministic rectangular set of eligible top-floor cells. The semantic zone stores:

- its canonical covered Floor cell set;
- storey;
- roof form;
- ridge axis.

The initial player-facing Roof slice deliberately activates **gable** only. `mono-pitch` remains a recognized schema form for future semantic expansion but is not yet a separate Hammer choice.

A Roof preview is valid only when:

- every covered canonical Floor cell exists at the same structural level;
- no covered cell already belongs to another Roof zone;
- no covered cell is reserved by the current Stair opening contract;
- there is no higher Floor directly above the candidate cells;
- every external perimeter edge of the candidate footprint has a semantic Wall-family support.

Internal shared edges inside a multi-cell rectangular zone do not require Walls. Door and Window count as wall-family perimeter support because they are structural wall records.

The live Roof visual contains opaque exterior slopes plus visible timber ridge/rafter framing. The cover is intentionally the interior-facing barrier so roof framing does not present as loose exposed roof pieces inside the building.

This first semantic Roof slice does not add walkable sloped roof collision. Roof placement/removal, support dependencies, persistence and presentation are the milestone; roof-surface traversal is a separate gameplay decision.

Roof support Walls cannot be demolished while the Roof depends on them. The Roof must be removed first. Roof removal returns `5 x coveredCellCount` Logs exactly.

L/T/cross building roofs must eventually be represented as relationships between multiple explicit Roof zones. They must not be reconstructed by reviving the legacy physical-member inference graph.

## Placement and targeting

The Hammer remains the only player-facing entry point for semantic construction. Inventory Logs are material only.

Selecting Hammer opens the compact semantic build dock. The live choices are Floor, Wall, Door, Window, Stairs, Roof and Remove. Choosing any live construction mode collapses the expanded selector so the world preview remains visible.

Third person uses Ranger-relative structural candidates. First person scores semantic candidates against the centre-camera aim ray. Green means the candidate and inventory cost are valid; red means support/occupancy/clearance/material requirements are not satisfied.

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

Roof uses its stored covered-cell count when resolving the refund, so multi-cell Roof zones cannot incorrectly refund only the one-cell base price.

## Persistence boundary

The game save boundary remains schema **2** / world revision **2**. The panel-grid schema remains backward-compatible with prior semantic Door/Window saves: the new `stairs` collection is optional on restore, so existing device saves do not require another destructive save cutover.

`PanelConstructionSystem.snapshot()` stores semantic registry/grid state. Save/Continue recreates runtime visuals and collision from that state without re-consuming Logs.

A restored Stair recreates all six walkable tread colliders. A restored Roof recreates its explicit zone geometry and dynamic cell-count cost identity. No Three.js transforms are serialized as structural authority.

## Verification

`npm run check` now protects the semantic Stairs/Roof milestone in addition to the established Floor/Wall/Door/Window contracts.

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
- wall-supported gable Roof preview;
- exact Roof placement/remove/refund and restore;
- Roof support-Wall protection;
- opaque Roof slopes and semantic Roof materialization;
- the established single-owner Hammer targeting boundary.

`verify-tree-harvest.mjs` protects the shared inventory-Log material contract and asserts Stairs/Roof remain inside semantic Hammer construction rather than returning to the legacy physical-log tray.

## Android acceptance gate

After the branch is green and deployed, physically verify Stairs on Android:

- Stairs appears as a live Hammer choice;
- 3P preview chooses a sensible adjacent Floor pair and orientation;
- 1P reticle can select the intended Stair pair;
- placement consumes exactly 3 Logs;
- Ranger can walk the full six-tread flight both up and down without invisible blocking or teleporting;
- a Wall cannot occupy the Stair shared opening edge;
- Hammer Remove targets the whole flight and refunds exactly 3 Logs;
- save -> close -> Continue restores the same Stair orientation and walkable collision.

Then physically verify Roof on Android:

- Roof appears as a live Hammer choice;
- 3P and 1P previews select the intended supported footprint;
- missing perimeter support produces an invalid/red preview;
- one-cell and multi-cell Roof totals match 5 Logs per covered cell;
- ridge direction follows the longer rectangular footprint axis deterministically;
- roof cover/framing looks coherent from outside and does not leave loose roof pieces visibly hanging inside;
- support Walls refuse removal while the Roof exists;
- Hammer Remove targets the complete Roof zone and refunds the exact dynamic total;
- save -> close -> Continue restores the same Roof footprint, ridge orientation and removal/refund identity.

Do not progress into general upper-storey construction, player-selected mono-pitch roofs or complex roof-junction authoring until this Stairs/Roof milestone is device-verified.

## Preserved systems

This milestone intentionally preserves terrain/world generation, ecology, Ranger locomotion/camera, general inventory/crafting, tools/durability, combat, campfire behavior, common collision, PWA/install architecture and deployment architecture.

Legacy physical construction code remains transition infrastructure only. New Stairs/Roof gameplay must not reconnect structural authority to it.
