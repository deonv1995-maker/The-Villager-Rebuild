# Hammer construction menu

## Decision

The Hammer is the player-facing entry point for semantic construction.

The construction responsibility chain is:

`Hammer selection -> structure menu -> semantic panel choice -> PanelConstructionSystem -> inventory Log cost`

Logs remain inventory material. Selecting or tapping the Log inventory row must not open a competing construction workflow.

## Mobile interaction

Selecting an owned **Hammer** activates semantic Floor placement and shows a compact top-right build dock. The compact dock remains present for as long as the Hammer stays equipped, keeping the active semantic construction state reachable without requiring the player to reselect the Hammer. It also keeps the active preview and aiming area visible instead of leaving the full structure chooser over the world while the player is positioning a panel.

Tapping the compact dock expands a narrow vertical structure list. The list is intentionally smaller than the previous house-schematic selector so it uses less of the gameplay view while keeping the existing Villager mobile visual language: dark forest-green surfaces, warm timber/gold accents, compact rounded controls and deliberate touch targets.

The current active choices are:

- **Floor** — complete semantic Floor Panel, 3 Logs;
- **Wall** — complete semantic Solid Wall Panel, 3 Logs;
- **Door** — complete semantic Door Wall Panel, 3 Logs, placed directly on an empty canonical Floor edge;
- **Window** — complete semantic Window Wall Panel, 3 Logs, placed directly on an empty canonical Floor edge;
- **Remove** — leaves placement mode while keeping the Hammer equipped, then uses the exact semantic Hammer demolition target;
- **X / Collapse** — collapses the expanded structure drawer back to the compact Hammer dock without changing the selected construction mode or unequipping the Hammer.

Choosing Floor, Wall, Door, Window or Remove automatically collapses the expanded list back to the compact dock. Pressing the drawer **X** does the same presentation-only collapse. The player can therefore aim, walk, rotate the camera and use the unified Hammer action without a large menu covering the placement target. Tapping the compact dock reopens the list without changing the active construction mode.

The following future structure choices remain visible as compact disabled list rows so the player can understand the eventual building vocabulary without reconnecting unfinished legacy systems:

- Stairs;
- Roof.

Those controls must remain disabled until their semantic runtime slices are implemented.

The construction session publishes the `hammer-construction-open` page state. The expanded list additionally publishes `hammer-construction-expanded`. These are presentation-only coordination states: sibling HUD controls use them to reserve separate screen lanes, but construction gameplay does not read them as structural state.

The normal camera view control remains independently reachable in both compact and expanded states. Beside the compact dock it uses a short offset; while the list is expanded it moves only far enough left to clear the narrower selector footprint. The normal HUD objective is suppressed during the construction session because the build status/dock already communicate the active mode, and the top build status is temporarily hidden while the selector is expanded so the two overlays cannot stack on top of each other.

The player-facing **X / Collapse** and **Remove** controls retain at least 44 CSS-pixel touch targets. Floor, Wall, Door and Window also remain full touch rows. Disabled future rows can be visually denser because they are not interactive. The selector and compact dock remain in the established top-right safe area so the bottom movement/action controls are not displaced.

## Hammer behavior

The Hammer remains equipped while Floor, Wall, Door or Window placement is active. Construction must never silently switch the toolbelt back to Hand.

When a semantic build mode is active:

- the normal semantic panel preview remains authoritative;
- green means the selected panel can be placed and the inventory can pay the cost;
- red means the placement is invalid or there are not enough Logs;
- the unified mobile Action button shows the Hammer and **PLACE**;
- the expanded structure list is collapsed during normal aiming/placement;
- collapsing the drawer must not deactivate the current semantic build mode or hide the compact Hammer dock;
- selecting Hammer is allowed even with fewer than three Logs so the player can see the intended slot and the missing material requirement.

Door and Window both reuse the canonical wall-edge placement query used by Solid Wall. Neither is a legacy customization overlay and neither requires a Solid Wall to be built first. Their semantic records remain walls with `variant: 'door'` or `variant: 'window'`, so Floor dependency rules, persistence, exact Hammer targeting and demolition remain part of the same structural authority.

Door uses two side colliders around a centre opening so the Ranger can walk through it. Window uses a lower sill/body collider, two side colliders through the opening band and an upper head/body collider. The visual opening and collision shape are therefore derived from the same semantic variant while the Ranger remains blocked from walking through a Window.

When Remove is selected:

- semantic placement preview is disabled;
- first person raycasts the exact materialized panel meshes;
- third person uses the nearest valid semantic panel target;
- the unified Hammer action is **REMOVE**;
- dependency-safe demolition, exact Log refunds and normal Hammer durability remain unchanged.

## Architecture boundary

`PanelConstructionSystem` remains the single structural authority for Floor and Wall-family validity, local grids, collision, demolition dependencies and persistence. Door and Window are materialized from wall variants already stored by `PanelConstructionGrid`; they do not reconnect `WallPanelCustomizationSystem` or the physical-log construction path.

`SemanticDoorPanelGeometry` and `SemanticWindowPanelGeometry` own only variant-specific generated presentation/collision geometry. Shared dimensions still come from `PhysicalLogDefinitions`, so Door/Window width and opening heights do not gain duplicate gameplay constants.

`HammerConstructionMenu` owns only presentation and player choice, including whether its selector is expanded or collapsed. The drawer X is handled entirely inside that presentation layer so it cannot accidentally terminate the semantic construction session. `PanelConstructionRuntimeController` owns the translation between Hammer/toolbelt state, selected semantic mode and the semantic construction runtime.

`GameApp` remains the single publisher of the current world interaction target and demolition preview. While the semantic Hammer session is active, it asks `PanelConstructionRuntimeController` whether that session owns Hammer interaction. Floor/Wall/Door/Window placement suppresses unrelated world interaction targets while the external **PLACE** action is active. Remove mode supplies the semantic panel target to `GameApp`, which publishes that target to the HUD and demolition preview. Legacy physical-log/campfire Hammer targeting remains available only when the semantic construction session does not own Hammer interaction.

This target-authority boundary is important on mobile. The panel controller may compute the exact first-person reticle target, but it must not independently race the global target refresh by writing a second HUD interaction target or demolition overlay. Physical Android verification exposed that competing publishers could clear a valid semantic Wall target immediately after the white dot acquired it; PR #166 established the single-owner boundary.

The old `MobileHud` physical-log build tray remains transition infrastructure for deferred legacy systems but is explicitly hidden during semantic panel construction and is not a source of Floor/Wall/Door/Window choices.

The Hammer menu page-state classes are presentation-only coordination boundaries. They exist so sibling HUD controls can avoid the active build control footprint; they must not become sources of gameplay or construction state.

The Window extension does not alter:

- existing Floor, Solid Wall or Door costs;
- schema-2 save format;
- local building grid orientation;
- terrain/support rules for Floor;
- Hammer durability rules;
- first-person exact-ray or third-person proximity targeting rules;
- PWA/install architecture;
- deployment architecture.

## Desktop compatibility

`B` remains a construction shortcut. If the Hammer is not equipped, the shortcut routes through normal Hammer selection; while semantic placement is active, `B` cycles the live Floor / Wall / Door / Window choices. `E` / `V` confirms placement, while `G` / Escape closes the construction session. In Remove mode, `E` / `V` removes the exact semantic panel target when one is selected.

The compact/expanded menu behavior is a mobile presentation layer only and does not replace those keyboard controls.

## Verification

`verify-panel-construction-runtime.mjs` protects these UI/runtime boundaries:

- Hammer selection is the build-menu entry contract;
- inventory Logs are not a build-menu trigger;
- the Hammer stays equipped during semantic placement;
- the structure menu exposes Floor, Wall, Door, Window, Remove and X/Collapse;
- Stairs and Roof remain visibly disabled;
- RAW, FRAME and physical-log DROP are not exposed in the semantic structure menu;
- active Floor/Wall/Door/Window/Remove choices collapse to the compact build dock;
- Door and Window each cost three Logs and record their wall variant in semantic state;
- Door materialization uses a traversable centre with two side collision boxes;
- Window materialization uses lower/side/upper collision sections around a bounded visual opening;
- Door/Window save/restore recreates visual variant and collision without consuming inventory;
- Door/Window demolition removes every owned collider and refunds three Logs;
- the compact and expanded HUD footprints have separate layout rules;
- the panel controller exposes semantic Hammer ownership/target resolution without publishing a competing HUD target;
- `GameApp` defers to semantic Hammer target authority while the panel session is active and keeps legacy demolition targeting isolated to the closed-session path;
- the production shell loads the dedicated structure-menu styling.

`verify-hammer-menu-persistence.mjs` protects the mobile drawer-specific persistence contract:

- the drawer X is a presentation-only collapse control;
- collapsing the drawer returns to the compact Hammer dock before any gameplay mode callback can run;
- switching away from Hammer remains the runtime path that hides semantic construction UI.

`verify-device-regressions-0.3.11.mjs` additionally protects the established mobile Hammer layout contract.

## Physical-device status

As of 2026-09-08, the installed Android PWA has physically verified:

- compact/expanded Hammer list readability and persistent compact dock behavior;
- third-person Floor and Wall placement;
- vegetation masking beneath Floor Panels;
- 3P/1P switching with the Hammer session open;
- first-person Remove acquisition/release on semantic walls;
- exact Wall removal/refund;
- Door preview/snap in 3P and 1P;
- exact three-Log Door placement and refund;
- Ranger traversal through the Door opening;
- Door Remove targeting;
- Door save/Continue restoration.

Window is the current device-acceptance gate. Before Stairs or Roof is enabled, Android must verify Window preview/snap in 3P and 1P, exact three-Log placement, visible opening/sill/head geometry, Ranger collision against the lower wall, exact Remove/refund and save/Continue restoration.
