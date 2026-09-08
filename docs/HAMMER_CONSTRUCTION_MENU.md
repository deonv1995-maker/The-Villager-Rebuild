# Hammer construction menu

## Decision

The Hammer is the player-facing entry point for semantic construction.

The responsibility chain remains:

`Hammer selection -> structure menu -> semantic module choice -> PanelConstructionSystem -> inventory Log cost`

Logs are inventory material only. Tapping the Log inventory row must not open a competing construction workflow.

## Mobile interaction

Selecting an owned **Hammer** activates semantic Floor placement and shows the compact top-right build dock. The dock remains present while the Hammer stays equipped. Tapping it expands the narrow structure list; choosing a live mode collapses the list again so aiming and preview placement retain the gameplay view.

The live choices are:

- **Floor** — complete Floor Panel, 3 Logs;
- **Wall** — complete Solid Wall Panel, 3 Logs;
- **Door** — semantic Door Wall Panel, 3 Logs;
- **Window** — semantic Window Wall Panel, 3 Logs;
- **Stairs** — complete six-tread semantic Stair flight, 3 Logs;
- **Roof** — explicit semantic gable Roof zone, 5 Logs per covered canonical Floor cell;
- **Remove** — exact semantic Hammer demolition target;
- **X / Collapse** — presentation-only collapse back to the compact Hammer dock.

There are no longer disabled Stairs/Roof placeholder rows in this milestone. RAW, FRAME and physical-log DROP remain absent from the semantic menu.

The construction session publishes `hammer-construction-open`; the expanded drawer additionally publishes `hammer-construction-expanded`. These are presentation-only page-state classes used to keep sibling HUD controls out of the construction footprint. Gameplay does not read them as structural state.

The normal camera-view control remains independently reachable in compact and expanded states. The bottom movement/action controls are not displaced.

## Hammer behavior

The Hammer remains equipped while any semantic placement mode is active.

When Floor, Wall, Door, Window, Stairs or Roof is selected:

- the semantic world preview is authoritative;
- green means structural validity and material affordability both pass;
- red means the placement/support/occupancy requirement fails or the inventory cannot pay the cost;
- the unified mobile Action button shows the Hammer and **PLACE**;
- selecting the mode collapses the expanded drawer to the compact dock;
- selecting Hammer remains allowed even when the current inventory cannot afford the active module, so the intended structural slot can still be inspected.

Door and Window use canonical wall edges and remain semantic wall variants rather than physical-log customization overlays.

Stairs require two adjacent same-level Floor cells with an open shared edge. One placement creates the complete flight, consumes 3 Logs and reserves that shared edge from competing Walls.

Roof creates an explicit gable Roof zone. The candidate footprint is a deterministic rectangular group of eligible top-floor cells. Every external perimeter edge must have semantic wall-family support. The total shown by the runtime is dynamic: `5 x covered Floor cells` Logs.

When Remove is selected:

- semantic placement preview is disabled;
- first person raycasts exact materialized semantic meshes;
- third person uses the nearest valid semantic module target;
- the unified Hammer action is **REMOVE**;
- structural dependency rules run before visual/collision removal or refunds;
- dynamic Roof refunds use the stored covered-cell count rather than the one-cell base price.

## Architecture boundary

`PanelConstructionSystem` remains the single runtime authority for semantic placement validity, materialization, collision ownership, dependency-safe removal and persistence integration.

`PanelConstructionGrid` remains structural state authority. It owns canonical Floor cells, Wall edges, Stair cell pairs and Roof zones.

Presentation-specific helpers own generated geometry only:

- `SemanticDoorPanelGeometry` — Door opening presentation/collision;
- `SemanticWindowPanelGeometry` — Window opening presentation/collision;
- `SemanticStairPanelGeometry` — six-tread Stair presentation and tread collider specifications;
- `SemanticRoofZoneGeometry` — gable Roof cover/framing presentation.

Shared physical dimensions and movement limits remain sourced from the existing data/collision authorities. No new geometry helper decides structural identity.

`HammerConstructionMenu` owns presentation and player choice only. `PanelConstructionRuntimeController` translates Hammer/toolbelt state and semantic mode selection into the construction system. `GameApp` remains the single world-interaction/HUD target publisher.

The legacy `MobileHud` physical-log tray remains transition infrastructure but is hidden during semantic construction and is not a source of Floor/Wall/Door/Window/Stairs/Roof choices.

## Desktop compatibility

`B` remains the construction shortcut. If Hammer is not equipped it routes through normal Hammer selection; while semantic placement is active, `B` cycles Floor / Wall / Door / Window / Stairs / Roof.

`E` / `V` confirms placement. `G` / Escape closes the semantic construction session. In Remove mode, `E` / `V` removes the exact semantic module target when available.

## Verification

`verify-panel-construction-runtime.mjs` protects the live menu/runtime boundary:

- Hammer remains the construction entry point;
- inventory Logs remain material-only;
- Floor, Wall, Door, Window, Stairs, Roof and Remove are live semantic choices;
- RAW, FRAME and physical-log DROP are not exposed;
- active choices collapse to the compact dock;
- dynamic Roof cost reaches the menu/HUD from semantic runtime state;
- Stairs use the shared Ranger support resolver for six walkable tread colliders;
- Stairs and Roof restore/remove/refund through semantic state;
- GameApp remains the single Hammer interaction-target publisher.

`verify-hammer-menu-persistence.mjs` continues to protect the presentation-only drawer-collapse contract and Hammer-session persistence.

## Physical-device status

As of 2026-09-08, Floor, Wall, Door and Window have been physically accepted on the installed Android PWA.

Stairs and Roof are the current device-acceptance gate. Required checks are documented in `PANEL_CONSTRUCTION_REBUILD.md`. General upper-storey construction, player-selected mono-pitch Roof and complex roof-junction authoring remain deferred until this milestone is physically verified.
