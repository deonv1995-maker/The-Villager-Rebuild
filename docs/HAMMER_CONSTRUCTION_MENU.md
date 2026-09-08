# Hammer construction menu

## Decision

The Hammer is the player-facing entry point for semantic construction.

The responsibility chain is:

`Hammer selection -> structure menu -> semantic choice -> PanelConstructionSystem -> inventory Log cost`

Logs remain inventory material. Selecting or tapping the Log inventory row must not open a competing construction workflow.

## Mobile interaction

Selecting an owned **Hammer** activates semantic Floor placement and shows a compact top-right build dock. The dock remains present for as long as the Hammer stays equipped, so closing the expanded drawer never forces the player to reselect the Hammer.

Tapping the dock expands a narrow vertical structure list. The live choices are:

- **Floor** — complete semantic Floor Panel, 3 Logs;
- **Wall** — complete semantic Solid Wall Panel, 3 Logs;
- **Door** — complete semantic Door Wall Panel, 3 Logs;
- **Window** — complete semantic Window Wall Panel, 3 Logs;
- **Stairs** — complete six-tread semantic Stair Flight, 3 Logs;
- **Remove** — exact semantic Hammer demolition target;
- **X / Collapse** — presentation-only collapse back to the compact dock.

Choosing Floor, Wall, Door, Window, Stairs or Remove collapses the expanded list to the compact dock. Pressing X does the same without changing the active construction mode or unequipping the Hammer. Tapping the compact dock reopens the list.

**Roof** remains visible as the one disabled future row. It must remain disabled until the semantic roof-zone runtime exists.

The construction session publishes `hammer-construction-open`; the expanded list additionally publishes `hammer-construction-expanded`. These are presentation-only page states used to keep sibling HUD controls out of the build-menu footprint.

The normal camera toggle remains independently reachable in compact and expanded states. X/Collapse and Remove retain at least 44 CSS-pixel touch targets; every live build choice remains a full touch row.

## Hammer behavior

The Hammer remains equipped during all semantic placement modes.

When a build mode is active:

- the semantic preview is authoritative;
- green means structural/collision/material rules allow placement;
- red means the slot is invalid or the inventory cannot pay the cost;
- the unified Action button shows Hammer **PLACE**;
- the expanded list stays collapsed while aiming/placing;
- collapsing the drawer does not deactivate the mode or hide the compact dock;
- selecting Hammer with fewer than three Logs is still allowed so a red preview/material requirement can be shown.

Door and Window reuse canonical wall edges and are stored as wall variants. Neither reconnects legacy physical-log wall customization.

Stairs reuse the same semantic structure grid. A valid flight requires two adjacent lower Floor Panels at the same level, an unoccupied two-cell stair pair and an open shared edge. The selected direction records the low Floor and ascent direction. A complete six-tread ghost is shown before placement, and one placement spends three Logs for the full flight.

After the Ranger climbs high enough on a semantic Stair Flight, **Floor** mode can expose the Stair destination cell on the next storey. Upper Floors keep the normal three-Log cost and use the normal `panel-floor` standable collision, but they do not create terrain-to-floor foundation supports.

When Remove is selected:

- semantic placement preview is disabled;
- first person raycasts exact materialized semantic meshes;
- third person uses the nearest valid semantic target;
- the unified Hammer action becomes **REMOVE**;
- dependency-safe demolition, exact Log refunds and normal Hammer durability remain unchanged.

## Architecture boundary

`PanelConstructionSystem` remains the single structural authority. The proven Floor/Wall-family implementation lives in `PanelConstructionSystemCore`; the public system extends that same registry/entry/inventory/collision authority with semantic Stairs and stair-seeded upper-storey Floors. There is no second stair grid or competing construction state.

`SemanticDoorPanelGeometry`, `SemanticWindowPanelGeometry` and `SemanticStairGeometry` own generated presentation/collision only. Shared dimensions continue to come from the established construction definitions.

`HammerConstructionMenu` owns only presentation and player choice. The drawer X is handled entirely inside the menu so it cannot terminate semantic construction state.

`PanelConstructionRuntimeController` keeps the existing Hammer/toolbelt/HUD/action/Remove behavior and admits the vertical Stairs mode through the same runtime boundary. `GameApp` remains the single publisher of world interaction targets and demolition previews.

The legacy physical-log build tray remains transition infrastructure. Inventory Logs cannot enter it during normal semantic construction, and it is not a source of Floor/Wall/Door/Window/Stairs choices.

## Desktop compatibility

`B` remains the construction shortcut. If the Hammer is not equipped it routes through normal Hammer selection; while placement is active, `B` cycles Floor / Wall / Door / Window / Stairs. `E` / `V` confirms placement, while `G` / Escape closes the construction session. In Remove mode, `E` / `V` removes the exact semantic target when one is selected.

The compact/expanded behavior remains a mobile presentation layer only.

## Verification

`verify-panel-construction-runtime.mjs` protects the shared Hammer/runtime/UI boundaries, including:

- Hammer selection as the construction entry contract;
- inventory Logs staying material-only;
- Hammer remaining equipped;
- live Floor/Wall/Door/Window/Stairs rows plus Remove and X/Collapse;
- Roof remaining disabled;
- RAW, FRAME and physical-log DROP remaining absent;
- live choices collapsing to the compact dock;
- Door/Window semantic variants and composite collision;
- one-owner Hammer targeting through `GameApp`;
- compact/expanded HUD layout coordination.

`verify-semantic-stairs.mjs` protects the new vertical contracts:

- six walkable treads over exactly one semantic storey;
- three-Log Stair placement and refund;
- two-cell Stair identity and reverse-duplicate rejection;
- lower-Floor dependency safety;
- six `panel-stair` collision supports;
- stair-seeded next-storey Floor placement;
- no terrain foundation supports on upper Floors;
- semantic save/Continue reconstruction;
- panel snapshot schema-1 compatibility after the internal schema advances to 2.

`verify-hammer-menu-persistence.mjs` continues to protect the drawer-specific persistence contract.

## Physical-device status

As of 2026-09-08, Android has physically verified the established Floor/Wall, Hammer dock, Door flow and the live Window presentation/selection path. The Window screenshot shows the bounded opening and persistent compact Window dock; after that device check the user explicitly approved continuing.

The next physical Android gate is **Stairs + first upper-storey Floor**. Verify:

- Stairs is selectable and the drawer collapses to a persistent `STAIRS` dock;
- two adjacent Floors produce the intended complete flight preview in 3P and 1P;
- the white reticle chooses the intended low end rather than reversing the flight;
- one placement consumes exactly three Logs;
- Ranger walks continuously up/down all six treads;
- Floor at the top exposes a valid next-storey slot and places without ground support posts;
- Remove targets/refunds the exact Stair flight;
- save/Continue restores the Stair and upper Floor collision.

Roof stays locked until this device gate is accepted.
