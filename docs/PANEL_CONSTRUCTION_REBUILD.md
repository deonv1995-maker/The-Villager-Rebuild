# Panel construction rebuild

## Decision

The Villager construction model is moving from log-for-log structural inference to explicit semantic building modules.

The authoritative direction is:

`semantic building state -> placement/rendering/collision -> persistence`

instead of:

`individual placed Logs -> geometric inference -> guessed structure -> repair on save/restore`

A wall is therefore a wall in structural data before it is rendered. A floor is one square building cell rather than a set of independently placed strips. Roofs will follow the same rule in a later slice through explicit roof zones.

## Current live slice

The player-facing semantic construction slice now activates:

- inventory-backed `Log` construction material;
- complete **Floor Panels**;
- complete **Solid Wall Panels**;
- complete **Door Wall Panels**;
- per-structure local construction grids;
- deterministic cell/edge orientation;
- mobile and first-person panel targeting;
- generated Log/split-Log presentation;
- panel collision and automatic floor supports;
- reactive vegetation exclusion beneath built Floor Panels;
- Hammer demolition and exact material refunds;
- semantic save/Continue reconstruction.

The Floor/Wall/Remove baseline was physically accepted on the installed Android PWA on 2026-09-08, including 3P/1P switching and exact first-person Remove acquisition/release. Door is the next incremental semantic module and must be physically accepted before another construction type is enabled.

Window variants, Stairs, upper-storey panel placement and live roof-zone construction remain outside the current live slice. They are not to be reintroduced through the old individual-Log inference path while the new system is being proven.

## Log resource transition

Trees still create a visibly full-sized Log world pickup. The world presentation is not the storage model.

When the Ranger picks that Log up, it enters `InventorySystem` as `Log x1`. Logs no longer enter the old shoulder-carry construction workflow during normal gameplay.

This gives the construction loop one material boundary:

`tree -> world Log pickup -> inventory Log -> semantic panel`

The current costs preserve the material amount of the replaced physical construction:

- Floor Panel: **3 Logs**;
- Solid Wall Panel: **3 Logs**;
- Door Wall Panel: **3 Logs**.

Door is not purchased as a second customization on top of a Solid Wall. It is a complete wall-family module placed directly into an empty semantic wall edge and therefore has one three-Log structural cost.

Demolition returns the same three Logs only after the semantic module is successfully removed. A floor with dependent wall-family modules refuses demolition until those dependants are removed.

## Per-structure local grids

One global world-aligned grid would make every building share the same rotation. The replacement therefore uses `PanelStructureRegistry` to give each building its own local grid origin and snapped yaw.

A new first Floor Panel establishes a structure. Adjacent floors join that structure and inherit its grid orientation. A sufficiently separate first floor may establish another structure at another snapped yaw.

The current cell size remains `2.9 x 2.9` world units, using the established authoritative Log length as the construction scale.

This allows two separate cabins, for example, to face different directions without allowing individual walls inside one cabin to acquire competing orientation rules.

## Canonical floor and wall identity

Floor Panels occupy integer cell coordinates plus storey.

Wall-family Panels occupy canonical cell edges. The east edge of one cell and west edge of its neighbour resolve to the same structural edge key, so duplicate Wall or Door modules are rejected by state identity instead of discovered later from overlapping meshes.

Each wall retains semantic owner/interior information, variant and inward/outward normals. Rendering converts that structural orientation into world transforms; Ranger facing, camera yaw and saved mesh quaternions do not decide which side is inside.

The generated split-wall visual exposes its flat cut face along local `+Z`. `PanelStructureRegistry.edgePlacementWorld()` therefore derives each wall root yaw from the semantic **inward normal**, not merely from whether the edge lies on the X or Z axis. Opposite edges on the same axis consequently rotate 180 degrees relative to one another where required, keeping the flat split face toward the room and bark toward the exterior on all four sides.

Door uses the same directed wall transform. Its semantic record remains `kind: wall` with `variant: door`; the opening is presentation/collision derived from that structural state, not a separate overlay or inferred legacy customization.

This is the architectural replacement for the previous wall-facing recovery chain.

## Presentation, collision and vegetation

Panel visuals preserve the established timber language without making rendered Logs authoritative:

- one Floor Panel is generated from three former split-log floor strips;
- one Solid Wall Panel is generated from three former stacked wall sections;
- one Door Wall Panel uses the same split-log wall language with a clear centre opening, side segments, jambs and a top closure row.

`PanelConstructionSystem` owns the semantic-to-runtime materialization boundary. `WorldCollisionSystem` remains the shared collision authority.

Floor Panels create one full-cell standable `panel-floor` collider and reuse `FloorSupportVisual` for uneven-ground supports/fill. The island terrain remains authoritative and is not permanently flattened or mutated for construction.

Reactive grass already listens to construction/collision revisions so physical floors can suppress vegetation beneath them. Semantic `panel-floor` colliders are now part of the same vegetation-occlusion boundary. This keeps grass from rendering through a newly placed or restored Floor Panel without mutating world generation, deleting vegetation data, or creating a second construction-specific grass system.

Solid Wall Panels create one deterministic collider along their canonical edge. Door Wall Panels create two side colliders around the clear centre opening. The semantic wall edge remains one structural object even when its runtime collision is composite; demolition removes all collider handles owned by that one panel entry.

## Placement and targeting

`PanelConstructionRuntimeController` owns the player-facing build-mode integration while `PanelConstructionSystem` owns structural validity.

The **Hammer** is the only player-facing entry point for semantic Floor/Wall/Door construction. Inventory Logs are material only and do not open a competing build workflow.

Selecting an owned Hammer activates Floor placement and presents a compact top-right build dock. Tapping that dock expands the narrow vertical structure list with Floor, Wall, Door, Remove and Close. Choosing Floor, Wall, Door or Remove collapses the selector again so the active world preview and aiming area remain visible during actual placement/removal work.

Door reuses the canonical wall-edge placement query. A Door preview can occupy an empty supported Floor edge; it cannot overlap a Solid Wall or another Door because the semantic edge key is already occupied.

The legacy physical-log build tray remains isolated transition infrastructure and is hidden while semantic panel construction is active.

Desktop `B` remains the construction shortcut and cycles the live Floor / Wall / Door modes. `E` / `V` confirms a valid preview and `G` / Escape closes the construction session.

Third person uses Ranger-relative placement. First person scores semantic slots against the centre-camera aim ray so the white reticle selects a structural target rather than relying on Ranger body facing.

Green means the semantic slot, terrain/collision conditions and material cost are all valid. Red means the position is invalid or the inventory does not contain enough Logs.

## Demolition

Hammer demolition targets the materialized semantic panel ID. First person raycasts the exact panel meshes; third person uses the nearest in-range panel target.

`GameApp` is the single HUD/demolition-preview publisher while the semantic Hammer session is open. This prevents legacy physical-log/campfire Hammer targeting from racing the panel target and clearing a correct first-person selection.

The system removes semantic state first. If dependency rules reject that removal, no collision, visual, refund or Hammer durability is changed.

After a successful demolition:

- the panel visual and every collision handle owned by that panel are removed;
- floor supports are removed when applicable;
- three Logs are refunded;
- one normal Hammer durability use is recorded.

## Persistence boundary

The live panel slice deliberately changes the save compatibility boundary:

- game save schema: **2**;
- world revision: **2**.

Schema-1 placed-Log saves are not silently interpreted as panel buildings and therefore are not offered as Continue saves after this cutover.

`PanelConstructionSystem.snapshot()` stores semantic registry/grid state, including wall variants. `SaveGameController` restores panel construction before the shared gameplay restore places the Ranger, ensuring floor/support collision already exists if the saved Ranger position is on player construction.

A restored Door is reconstructed directly from `variant: door` and recreates the open two-side collision shape without spending inventory Logs. The panel snapshot does not serialize Three.js objects and does not reconstruct wall orientation from mesh transforms.

Legacy physical construction persistence code remains temporarily isolated while deferred stairs/roof presentation systems are still being replaced, but it is no longer the normal player-facing Log construction authority and schema 1 is not loaded.

## Roof direction

The semantic grid already defines explicit roof-zone identities as an order-independent set of top-level cells plus storey and roof form.

Initial roof forms remain:

- `gable`;
- `mono-pitch`.

The live roof slice must consume those explicit zones instead of recreating the current rafter/beam inference graph. L/T/cross buildings must be represented as relationships between explicit zones, not inferred from dozens of independently placed roof Logs.

## Verification

The replacement has two core layers of regression coverage:

1. `verify-panel-construction-grid.mjs` protects canonical cells/edges, wall ownership, wall variants, roof-zone identity and semantic snapshot/restore.
2. `verify-panel-construction-runtime.mjs` protects the live Floor/Wall/Door loop: material costs, preview validity, collision, Door opening traversal, per-building orientation, inward-facing wall visuals, semantic floor vegetation masking, compact Hammer UI boundaries, dependency-safe demolition/refunds and runtime restore.

Both are part of `npm run check`.

Door acceptance additionally requires physical Android verification of:

- Door selection and compact-list collapse;
- green/red Door preview behavior in 3P and 1P;
- three-Log placement;
- Ranger traversal through the opening without clipping the side wall;
- exact 1P Remove acquisition and three-Log refund;
- save/Continue reconstruction with the opening still traversable.

## Preserved systems

This slice intentionally preserves terrain/world generation, ecology generation rules, Ranger locomotion/camera, general inventory/crafting, tools and durability, combat, campfire behavior, common collision, PWA/install architecture and deployment architecture.

The old physical Log construction implementation remains present only as transition code for deferred systems. New Floor/Wall/Door gameplay must not add features back to it. Window, Stairs and Roof remain locked until the Door slice is green in CI and physically verified on Android.
