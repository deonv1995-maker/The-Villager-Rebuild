# Panel construction rebuild

## Decision

The Villager construction model uses explicit semantic building modules rather than reconstructing structural identity from placed mesh transforms or individual physical Logs.

The authoritative direction is:

`semantic building state -> placement/rendering/collision -> persistence`

A Floor is one canonical cell. Wall, Door and Window are variants of one semantic wall-family edge. Stairs are one semantic flight between two adjacent cells. Roofs are semantic covered zones over exact connected structural bays. Rendered Logs, thatch courses and roof-wing meshes are presentation only.

Legacy physical FRAME/RAW/ANGLE/ROOF code remains compatibility and regression infrastructure. New player-facing construction must not reconnect semantic state to that inference graph.

## Current live Hammer vocabulary

The live semantic Hammer menu contains:

- **Floor**;
- **Wall**;
- **Door**;
- **Window**;
- **Stairs**;
- **Roof**;
- **Remove**.

Current semantic material costs are:

- Floor: **3 Logs**;
- Wall: **3 Logs**;
- Door: **3 Logs**;
- Window: **3 Logs**;
- Stairs: **3 Logs** per complete flight;
- Roof: **5 Logs per covered roof bay**.

A normal roof bay is backed by a Floor cell. On the second storey, the reserved Stair opening is also a roof-support bay even though it deliberately has no Floor. When the final Roof spans that opening, that covered bay uses the same 5-Log Roof cost.

Successful Hammer demolition refunds the exact semantic module cost. Failed dependency checks do not refund resources or consume Hammer durability.

## Per-structure semantic grid

`PanelStructureRegistry` owns separate local grids for separate buildings. One building therefore has one canonical origin/yaw, while unrelated buildings may face different directions without individual panels competing over rotation.

The canonical cell size and storey height are both derived from the authoritative **2.9-unit Log length**.

Stored structural identity remains integer cell/storey coordinates and canonical shared-edge keys. Fractional grid coordinates may be used only as derived geometry centres for multi-cell Roof presentation; they are never persisted as structural identity.

## Floors and wall family

Floor records are keyed by `(x, z, storey)`.

Wall-family records use canonical shared edges, so the east edge of one cell and the west edge of its neighbour resolve to one structural edge rather than two overlapping wall objects.

Wall, Door and Window share one full-storey presentation height and one semantic support role. Door keeps a traversable opening; Window keeps a bounded non-traversable opening. Their visual differences never create separate structural systems.

## Semantic Stairs

One semantic Stair module is one complete six-tread flight between two adjacent same-storey Floor cells.

A Stair:

- requires both lower cells;
- requires the cells to share the same structural level;
- reserves their shared edge so a Wall cannot occupy it;
- creates six standable `panel-stair` colliders through the common world-collision system;
- keeps every rise within the Ranger step-up contract;
- consumes/refunds exactly 3 Logs;
- round-trips through semantic Save/Continue state.

The target cell also reserves the corresponding cell on the storey above as the **Stair opening**. That upper cell cannot receive a Floor while the Stair exists.

Stairs have passed their current Android traversal/placement acceptance gate.

## Semantic second storey

The first upper-storey slice is now live and is intentionally limited to **one additional storey**:

- ground floor = storey `0`;
- second storey = storey `1`;
- third-storey construction remains deferred.

There is no separate “upper Floor” Hammer button. The existing Floor/Wall/Door/Window modes switch to upper-storey candidates from the Ranger's actual vertical context after the Ranger climbs the semantic Stair.

A connected lower Floor component can support the second storey only when:

- every exposed lower perimeter edge has a semantic Wall-family record;
- the lower component has no Roof (remove the lower Roof before building upward);
- a semantic Stair reaches storey `1`;
- the new upper Floor lies above a real lower Floor cell;
- the Stair target remains open;
- the first upper Floor grows beside that opening, after which the frontier may expand beside existing upper Floors.

This preserves the established closed-perimeter support concept without reusing the legacy FRAME/RAW inference graph or inventing an interior support lattice.

Upper Floors materialize with the same `panel-floor` collision/support type as ground Floors. `WorldCollisionSystem` resolves stacked support relative to the Ranger's current vertical position, preventing a Ranger on the ground from snapping upward while allowing a Ranger who climbed the Stairs to stand on storey `1`.

While the Ranger is upstairs, third-person Hammer Remove prefers storey-one modules so stacked pieces at the same X/Z do not accidentally select the lower module. First-person exact mesh targeting remains unchanged.

Structural dependencies prevent the lower building from being dismantled out from under the second storey:

- the access Stair cannot be removed while upper Floors exist;
- lower perimeter Wall-family support cannot be removed while the connected second storey depends on that closed shell;
- direct lower-Floor/upper-Floor dependencies remain protected by `PanelConstructionGrid`;
- a Stair cannot be removed while an upper Roof spans its reserved opening.

See `docs/SEMANTIC_SECOND_STOREY.md` for the complete player workflow, implementation boundary and Android acceptance contract.

## Semantic Roof

Roof remains explicit semantic state rather than individual angled Logs inferred after placement.

The live Roof planner:

- starts from the highest eligible connected structural footprint;
- supports rectangular, L-, T-, U- and stepped orthogonal footprints;
- partitions exact cells into deterministic gable wings for presentation;
- never fills or charges ordinary empty notches/courtyards merely because they lie inside a bounding rectangle;
- derives larger ridge heights for larger wings;
- trims exterior thatch/eave presentation away from shared internal wing boundaries;
- keeps the raised full-height wall seating and polished thatch finish already device-accepted.

Normal Roof state stores floor-backed `cellKeys`. When a storey-one Roof covers the reserved Stair opening, it additionally stores `openingCellKeys`. This distinction is deliberate:

- the Stair opening remains non-standable and has no Floor collider;
- Roof presentation still treats it as part of the covered footprint;
- Save/Continue can restore that coverage without inventing a fake Floor;
- ordinary L/T/U notches remain genuinely open because only an actual semantic Stair opening qualifies for `openingCellKeys`.

Roof support requires Wall-family support on the exposed perimeter of the exact covered footprint. Internal shared Roof edges do not require dividing Walls.

Roof removal refunds `5 x total covered roof bays`, including any explicit Stair-opening bay.

The semantic Roof still does not provide walkable sloped-roof collision.

## Placement and targeting

The Hammer is the only player-facing construction entry point. Inventory Logs are material, not separately placeable structural authority.

Third person uses Ranger-relative semantic candidate selection. First person scores semantic candidates against the centre-camera aim ray. Green means placement and material requirements are valid; red means support, occupancy, clearance or inventory requirements are not met.

Desktop compatibility controls remain:

- `B` cycles live semantic modes;
- `E` / `V` confirms placement;
- `G` / Escape closes the semantic construction session.

## Persistence

The game save boundary remains schema **2** / world revision **2**. The panel-grid schema remains compatible with prior semantic saves.

Storey-one Floor and Wall-family modules use the existing storey-indexed records. Stair state already stores source/target/storey information. Roof zones already persist semantic cell keys and now optionally persist explicit Stair-opening coverage keys.

Save/Continue recreates visuals and collision from semantic state without re-consuming Logs. Three.js transforms, thatch meshes, roof-wing meshes and preview data are not structural save authority.

Older one-storey semantic saves remain valid.

## Verification

The full `npm run check` suite protects both semantic and established legacy regression boundaries.

Key semantic verification scripts are:

- `verify-panel-construction-grid.mjs` — canonical Floor/edge/Stair/Roof identity and persistence;
- `verify-panel-construction-runtime.mjs` — semantic costs, runtime collision, build/remove/refund and restore;
- `verify-semantic-wall-height.mjs` — shared full-storey Wall/Door/Window height;
- `verify-semantic-roof-polish.mjs` — raised wall seating, thatch finish, ridge scaling and clean interior presentation;
- `verify-complex-semantic-roof.mjs` — exact L/T/U footprints, exterior-only eaves, complex Roof state and restoration;
- `verify-semantic-upper-storey.mjs` — closed-shell upper support, Stair opening, stacked collision, upper wall-family targeting, support dependencies, highest-storey Roof coverage and Save/Continue.

## Current Android acceptance gate

Stairs and the current complex/polished Roof have passed the user's latest device checks. The active construction gate is now the semantic second storey.

Verify on Android:

- build or use a closed ground-floor structure with an interior Stair and no lower Roof;
- climb the Stair and select Floor;
- upper Floor previews appear at storey `1`, not on the ground;
- the Stair target remains open and cannot be filled;
- upper Floors are walkable without level snapping or falling through seams;
- Wall, Door and Window place at the upper level with the established full-storey height;
- third-person Remove while upstairs targets upper modules rather than stacked lower ones;
- the lower Stair and supporting lower perimeter walls reject demolition while upper Floors depend on them;
- a completed upper perimeter can receive the Roof at the highest storey;
- the Roof covers above the Stair opening without creating a Floor there or leaving a courtyard-sized thatch hole;
- save -> close -> Continue restores both storeys, Stair and Roof.

Do not activate third-storey construction until this storey-one gate is physically verified.

## Preserved systems

This milestone intentionally preserves terrain/world generation, ecology, Ranger locomotion/camera, inventory/crafting, tools/durability, combat, campfire behavior, world collision ownership, complex Roof appearance, PWA/install architecture and deployment architecture except where the second-storey semantic path explicitly extends existing construction state.
