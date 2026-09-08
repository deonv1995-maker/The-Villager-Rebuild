# Panel construction rebuild

## Decision

The Villager construction model is moving from log-for-log structural inference to explicit semantic building modules.

The authoritative direction is:

`semantic building state -> placement/rendering/collision -> persistence`

instead of:

`individual placed Logs -> geometric inference -> guessed structure -> repair on save/restore`

A wall is therefore a wall in structural data before it is rendered. A floor is one square building cell rather than a set of independently placed strips. Door and Window are wall-family semantic variants placed directly on canonical edges. Stairs are a directed semantic relationship between two adjacent Floor cells. Roofs will follow the same rule in a later slice through explicit roof zones.

## Current live slice

The player-facing semantic construction slice activates:

- inventory-backed `Log` construction material;
- complete **Floor Panels**;
- complete **Solid Wall Panels**;
- complete **Door Wall Panels**;
- complete **Window Wall Panels**;
- complete **Stair Flights**;
- stair-seeded **upper-storey Floor Panels**;
- per-structure local construction grids;
- deterministic cell/edge/stair orientation;
- mobile and first-person semantic targeting;
- generated Log/split-Log presentation;
- standable panel/stair collision and ground-floor supports;
- reactive vegetation exclusion beneath built Floor Panels;
- Hammer demolition and exact material refunds;
- semantic save/Continue reconstruction.

The Floor/Wall baseline, Door slice and persistent Hammer compact-dock behavior were physically accepted on the installed Android PWA on 2026-09-08. A subsequent Android screenshot physically confirmed the live Window selection/presentation path, including the bounded opening and persistent compact Window dock, and the user explicitly approved continuing to the next milestone. Exact Window cost, collision, Remove/refund and persistence remain protected by automated runtime regression and can still be rechecked during the next device pass.

Live roof-zone construction remains outside the current slice. Roof must not be reintroduced through the old individual-Log inference path while the new system is being proven.

## Log resource transition

Trees still create a visibly full-sized Log world pickup. The world presentation is not the storage model.

When the Ranger picks that Log up, it enters `InventorySystem` as `Log x1`. Logs no longer enter the old shoulder-carry construction workflow during normal gameplay.

This gives the construction loop one material boundary:

`tree -> world Log pickup -> inventory Log -> semantic construction`

Current costs preserve the material amount of the replaced physical construction:

- Floor Panel: **3 Logs**;
- Solid Wall Panel: **3 Logs**;
- Door Wall Panel: **3 Logs**;
- Window Wall Panel: **3 Logs**;
- complete six-tread Stair Flight: **3 Logs**.

Door and Window are complete semantic modules, not second-stage customizations purchased on top of a Solid Wall. Stairs preserve the proven three-Log material meaning of the replaced six-tread physical stair workflow.

Demolition returns the exact semantic module cost only after its structural state is successfully removed.

## Per-structure local grids

One global world-aligned grid would make every building share the same rotation. `PanelStructureRegistry` therefore gives each building its own local grid origin and snapped yaw.

A new first ground Floor Panel establishes a structure. Adjacent ground floors join that structure and inherit its grid orientation. A sufficiently separate first floor may establish another structure at another snapped yaw.

The cell size remains `2.9 x 2.9` world units, using the established authoritative Log length as the construction scale. Storey height is also one Log length.

This allows separate cabins to face different directions without allowing individual modules inside one cabin to acquire competing orientation rules.

## Canonical floor, wall and stair identity

Floor Panels occupy integer cell coordinates plus storey.

Wall-family Panels occupy canonical cell edges. The east edge of one cell and west edge of its neighbour resolve to the same structural edge key, so duplicate Solid Wall, Door or Window modules are rejected by state identity instead of discovered later from overlapping meshes.

Stairs use a directed stair key plus an order-independent two-cell `pairKey`. The direction records which lower Floor is the foot of the flight and which adjacent Floor is the upper destination. The pair identity prevents the same two-cell bay from acquiring a second competing reverse flight.

A Stair Flight requires both lower-storey Floor cells to exist at the same structural level and rejects placement if a wall-family module occupies their shared edge. Both lower Floors become stair dependencies and cannot be demolished out from under the flight.

A lower Floor also cannot be removed while a Floor exists directly above it. These rules keep upper construction tied to semantic support rather than allowing floating state after demolition.

## Presentation, collision and vegetation

Panel visuals preserve the established timber language without making rendered Logs authoritative:

- one Floor Panel is generated from three former split-log floor strips;
- one Solid Wall Panel is generated from three former stacked wall sections;
- one Door Wall Panel uses a clear centre opening, side segments, jambs and top closure;
- one Window Wall Panel uses a bounded centre opening between the shared sill/head heights and two jambs;
- one Stair Flight is generated as six split-log treads plus two continuous sloped side supports.

`PanelConstructionSystem` remains the semantic-to-runtime materialization authority. The proven Floor/Wall-family implementation is isolated in `PanelConstructionSystemCore`; the vertical extension at the public `PanelConstructionSystem` boundary adds Stairs and upper-storey Floor behavior while sharing the same registry, entry map, inventory, collision and demolition authority. This is one construction system, not a second stair subsystem.

`WorldCollisionSystem` remains the shared movement/collision authority.

Ground Floor Panels create one full-cell standable `panel-floor` collider and reuse `FloorSupportVisual` for uneven-ground supports/fill. Upper-storey Floor Panels use the same standable panel collider but deliberately do **not** create terrain-to-floor foundation posts.

A semantic Stair Flight creates six standable `panel-stair` tread colliders. The rise is exactly one semantic storey divided across six treads and stays below the established Ranger maximum step rise. Tread six terminates at the next-storey walking height; no ladder, teleport or duplicate locomotion state is introduced.

Reactive grass continues to observe semantic `panel-floor` colliders through the shared vegetation-occlusion boundary. The island terrain remains authoritative and is not permanently flattened or mutated for construction.

Solid Wall Panels create one full wall collider. Door uses two side colliders around its traversable centre. Window uses lower full-width, two opening-side and upper full-width collision sections. Composite collision remains owned by one semantic module entry and is removed atomically during demolition.

## Stairs and upper-storey Floor placement

Stairs are now the controlled entry into vertical semantic construction.

The player selects **Stairs** with the Hammer and aims from one Floor Panel toward an adjacent Floor Panel. The selected direction becomes the stair ascent direction. A complete six-tread preview is shown before the three Logs are committed.

The first-person selection score uses the centre-camera aim ray and the intended low end of the flight, allowing the white reticle to distinguish the two possible directions of one adjacent Floor pair. Third person uses player proximity/facing to prefer the intended foot of the flight.

After a Stair Flight exists, climbing high enough on that flight and selecting **Floor** exposes the stair destination cell on the next storey as the first upper-storey Floor slot. This prevents arbitrary floating upper Floors from appearing from ground level.

Once that upper Floor exists, Floor placement can expand horizontally to adjacent upper cells only where a lower-storey Floor exists directly underneath. Upper-storey panels therefore remain supported by the established building footprint while avoiding terrain foundation visuals.

The current Stair slice does not enable semantic Roof. Roof remains the next separately gated structural milestone.

## Placement and targeting

`PanelConstructionRuntimeController` owns Hammer/toolbelt/UI integration while `PanelConstructionSystem` owns structural validity.

The **Hammer** is the only player-facing entry point for semantic Floor/Wall/Door/Window/Stairs construction. Inventory Logs are material only and do not open a competing build workflow.

Selecting an owned Hammer activates Floor placement and presents a compact top-right build dock. The dock remains present while the Hammer stays equipped. Tapping it expands the narrow list with Floor, Wall, Door, Window, Stairs, Remove and the presentation-only X/Collapse control. Choosing a live mode or pressing X collapses the selector again so aiming remains visible.

Door and Window reuse canonical wall-edge placement. Stairs reuse canonical Floor-cell identity and require an open shared edge. The legacy physical-log build tray remains isolated transition infrastructure and is hidden while semantic panel construction is active.

Desktop `B` cycles the live Floor / Wall / Door / Window / Stairs modes. `E` / `V` confirms a valid preview and `G` / Escape closes the construction session.

Third person remains Ranger-relative. First person scores semantic slots against the centre-camera aim ray so the white reticle selects structural targets rather than Ranger body facing.

Green means the semantic slot, dependency/collision rules and material cost are valid. Red means the position is invalid or there are not enough Logs.

## Demolition

Hammer demolition targets the materialized semantic entry ID. First person raycasts exact materialized meshes; third person uses the nearest in-range semantic target.

`GameApp` remains the single HUD/demolition-preview publisher while the semantic Hammer session is open. The vertical extension adds Stair entries to the same entry map, so it does not create a second target publisher.

The system removes semantic state first. If dependency rules reject removal, no visual, collision, refund or Hammer durability changes.

After successful demolition:

- the module visual and every collision handle it owns are removed;
- ground Floor supports are removed when applicable;
- the exact semantic build cost is refunded;
- one normal Hammer durability use is recorded.

Door/Window refund resolution maps their wall variant back to the matching semantic build cost. Stairs refund the three-Log Stair cost.

## Persistence boundary

The overall game save compatibility boundary remains:

- game save schema: **2**;
- world revision: **2**.

The internal **panel construction snapshot schema advances from 1 to 2** to add explicit Stair records. `PanelConstructionGrid.restore()` deliberately accepts both panel schema 1 and 2; an existing semantic Floor/Wall/Door/Window save restores with an empty Stair set instead of being invalidated by this incremental module.

This internal panel-schema compatibility is separate from the older overall game schema-1 placed-Log cutover. Legacy game schema-1 placed-Log saves are still not silently interpreted as panel buildings.

`PanelConstructionSystem.snapshot()` stores the semantic registry/grid, including wall variants, stair direction/pair identity and upper-storey Floors. `SaveGameController` restores panel construction before shared gameplay restore places the Ranger so standable Floor/Stair collision exists before the saved player position is applied.

Restored Door and Window variants recreate their composite collision without spending Logs. Restored Stairs recreate six tread colliders without spending Logs. Restored upper-storey Floors recreate standable Floor collision without terrain foundation supports.

The panel snapshot does not serialize Three.js objects and does not infer structural identity from rendered transforms.

Legacy physical construction persistence remains isolated transition code for deferred old systems, but it is not the normal player-facing inventory-Log construction authority.

## Roof direction

The semantic grid already defines explicit roof-zone identities as an order-independent set of top-level cells plus storey and roof form.

Initial roof forms remain:

- `gable`;
- `mono-pitch`.

The future live roof slice must consume those explicit zones instead of recreating the old rafter/beam inference graph. L/T/cross buildings must be represented as relationships between explicit zones, not inferred from independently placed roof Logs.

## Verification

The semantic construction regression stack now includes:

1. `verify-panel-construction-grid.mjs` — canonical cells/edges, wall ownership/variants, roof-zone identity and semantic snapshot/restore.
2. `verify-panel-construction-runtime.mjs` — live Floor/Wall/Door/Window behavior, compact Hammer UI, collision, targeting authority, demolition/refunds and restore boundaries.
3. `verify-semantic-stairs.mjs` — panel schema compatibility, two-cell Stair identity, six-tread geometry/collision, three-Log placement/refund, lower-Floor dependency safety, stair-seeded upper Floor placement, no upper-floor terrain supports and save/Continue reconstruction.

All are part of `npm run check`.

The next Android acceptance pass for Stairs should verify:

- Stairs appears as a live 3-Log Hammer row and collapses to the persistent compact dock;
- two adjacent Floors expose one complete green/red flight preview;
- 3P direction selection follows the intended low Floor;
- 1P white-reticle aiming can select the intended low end and releases when aimed away;
- one placement creates the complete six-tread flight and consumes exactly three Logs;
- Ranger walks up/down all six treads without clipping or teleporting;
- at the top, Floor mode exposes the first next-storey Floor slot;
- the upper Floor is walkable and has no terrain support posts extending to ground;
- exact Remove targets/refunds the Stair flight;
- save/Continue restores Stair collision and any upper Floor correctly.

## Preserved systems

This slice intentionally preserves terrain/world generation, ecology generation rules, Ranger locomotion/camera, general inventory/crafting, tools/durability, combat, campfire behavior, common collision, PWA/install architecture and deployment architecture.

The old physical Log construction implementation remains transition code only. New Floor/Wall/Door/Window/Stairs gameplay must not add player-facing behavior back to it. Roof remains locked until this Stair/upper-storey slice is green in CI and physically verified on Android.
