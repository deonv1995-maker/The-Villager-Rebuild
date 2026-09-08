# Hammer construction menu

## Decision

The Hammer is the player-facing entry point for semantic construction.

The construction responsibility chain is:

`Hammer selection -> structure menu -> semantic panel choice -> PanelConstructionSystem -> inventory Log cost`

Logs remain inventory material. Selecting or tapping the Log inventory row must not open a competing construction workflow.

## Mobile interaction

Selecting an owned **Hammer** activates semantic Floor placement and shows a compact top-right build dock. The compact dock keeps the active preview and aiming area visible instead of leaving the full structure chooser over the world while the player is positioning a panel.

Tapping the compact dock expands a narrow vertical structure list. The list is intentionally smaller than the previous house-schematic selector so it uses less of the gameplay view while keeping the existing Villager mobile visual language: dark forest-green surfaces, warm timber/gold accents, compact rounded controls and deliberate touch targets.

The current active choices are:

- **Floor** — complete semantic Floor Panel, 3 Logs;
- **Wall** — complete semantic Solid Wall Panel, 3 Logs;
- **Door** — complete semantic Door Wall Panel, 3 Logs, placed directly on an empty canonical Floor edge;
- **Remove** — leaves placement mode while keeping the Hammer equipped, then uses the exact semantic Hammer demolition target;
- **Close** — closes the construction session while leaving the Hammer equipped.

Choosing Floor, Wall, Door or Remove automatically collapses the expanded list back to the compact dock. The player can therefore aim, walk, rotate the camera and use the unified Hammer action without a large menu covering the placement target. Tapping the compact dock reopens the list without changing the active construction mode.

The following future structure choices remain visible as compact disabled list rows so the player can understand the eventual building vocabulary without reconnecting unfinished legacy systems:

- Window;
- Stairs;
- Roof.

Those controls must remain disabled until their semantic runtime slices are implemented.

The construction session publishes the `hammer-construction-open` page state. The expanded list additionally publishes `hammer-construction-expanded`. These are presentation-only coordination states: sibling HUD controls use them to reserve separate screen lanes, but construction gameplay does not read them as structural state.

The normal camera view control remains independently reachable in both compact and expanded states. Beside the compact dock it uses a short offset; while the list is expanded it moves only far enough left to clear the narrower selector footprint. The normal HUD objective is suppressed during the construction session because the build status/dock already communicate the active mode, and the top build status is temporarily hidden while the selector is expanded so the two overlays cannot stack on top of each other.

The player-facing **Close** and **Remove** controls retain at least 44 CSS-pixel touch targets. Floor, Wall and Door also remain full touch rows. Disabled future rows can be visually denser because they are not interactive. The selector and compact dock remain in the established top-right safe area so the bottom movement/action controls are not displaced.

## Hammer behavior

The Hammer remains equipped while Floor, Wall or Door placement is active. Construction must never silently switch the toolbelt back to Hand.

When Floor, Wall or Door is active:

- the normal semantic panel preview remains authoritative;
- green means the selected panel can be placed and the inventory can pay the cost;
- red means the placement is invalid or there are not enough Logs;
- the unified mobile Action button shows the Hammer and **PLACE**;
- the expanded structure list is collapsed during normal aiming/placement;
- selecting Hammer is allowed even with fewer than three Logs so the player can see the intended slot and the missing material requirement.

Door uses the same canonical wall-edge placement query as Solid Wall. It is not a legacy customization overlay and does not require a Solid Wall to be built first. Its semantic record remains a wall with `variant: 'door'`, so Floor dependency rules, persistence, exact Hammer targeting and demolition remain part of the same structural authority. The committed runtime uses two side colliders around the centre opening instead of a full-width wall collider, keeping the doorway traversable while preserving collision on the remaining wall structure.

When Remove is selected:

- semantic placement preview is disabled;
- first person raycasts the exact materialized panel meshes;
- third person uses the nearest valid semantic panel target;
- the unified Hammer action is **REMOVE**;
- dependency-safe demolition, exact Log refunds and normal Hammer durability remain unchanged.

## Architecture boundary

`PanelConstructionSystem` remains the single structural authority for Floor and Wall-family validity, local grids, collision, demolition dependencies and persistence. Door is materialized from the wall variant already stored by `PanelConstructionGrid`; it does not reconnect `WallPanelCustomizationSystem` or the physical-log construction path.

`HammerConstructionMenu` owns only presentation and player choice, including whether its selector is expanded or collapsed. `PanelConstructionRuntimeController` owns the translation between Hammer/toolbelt state, selected semantic mode and the existing semantic construction runtime.

`GameApp` remains the single publisher of the current world interaction target and demolition preview. While the semantic Hammer session is active, it asks `PanelConstructionRuntimeController` whether that session owns Hammer interaction. Floor/Wall/Door placement suppresses unrelated world interaction targets while the external **PLACE** action is active. Remove mode supplies the semantic panel target to `GameApp`, which publishes that target to the HUD and demolition preview. Legacy physical-log/campfire Hammer targeting remains available only when the semantic construction session does not own Hammer interaction.

This target-authority boundary is important on mobile. The panel controller may compute the exact first-person reticle target, but it must not independently race the global target refresh by writing a second HUD interaction target or demolition overlay. Physical Android verification exposed that competing publishers could clear a valid semantic Wall target immediately after the white dot acquired it; PR #166 established the single-owner boundary.

The old `MobileHud` physical-log build tray remains transition infrastructure for deferred legacy systems but is explicitly hidden during semantic panel construction and is not a source of Floor/Wall/Door choices.

The Hammer menu page-state classes are presentation-only coordination boundaries. They exist so sibling HUD controls can avoid the active build control footprint; they must not become sources of gameplay or construction state.

The Door extension does not alter:

- existing Floor or Solid Wall costs;
- schema-2 save format;
- local building grid orientation;
- terrain/support rules for Floor;
- Hammer durability rules;
- exact three-Log demolition refunds for wall-family panels;
- first-person exact-ray or third-person proximity targeting rules;
- PWA/install architecture;
- deployment architecture.

## Desktop compatibility

`B` remains a construction shortcut. If the Hammer is not equipped, the shortcut routes through normal Hammer selection; while semantic placement is active, `B` cycles the live Floor / Wall / Door choices. `E` / `V` confirms placement, while `G` / Escape closes the construction session. In Remove mode, `E` / `V` removes the exact semantic panel target when one is selected.

The compact/expanded menu behavior is a mobile presentation layer only and does not replace those keyboard controls.

## Verification

`verify-panel-construction-runtime.mjs` protects these UI/runtime boundaries:

- Hammer selection is the build-menu entry contract;
- inventory Logs are not a build-menu trigger;
- the Hammer stays equipped during semantic placement;
- the structure menu exposes Floor, Wall, Door, Remove and Close;
- Window, Stairs and Roof remain visibly disabled;
- RAW, FRAME and physical-log DROP are not exposed in the semantic structure menu;
- active Floor/Wall/Door/Remove choices collapse to the compact build dock;
- Door costs three Logs and records `variant: 'door'` in semantic wall state;
- Door materialization uses an open centre with two side collision boxes;
- Door save/restore recreates its visual variant and open collision without consuming inventory;
- Door demolition removes both side colliders and refunds three Logs;
- the compact and expanded HUD footprints have separate layout rules;
- the panel controller exposes semantic Hammer ownership/target resolution without publishing a competing HUD target;
- `GameApp` defers to semantic Hammer target authority while the panel session is active and keeps legacy demolition targeting isolated to the closed-session path;
- the production shell loads the dedicated structure-menu styling.

`verify-device-regressions-0.3.11.mjs` additionally protects the established mobile Hammer layout contract:

- Hammer construction open state is published and cleaned up;
- the expanded selector uses the narrow list presentation rather than the larger house schematic;
- Close and Remove retain deliberate touch targets;
- the 3P/1P camera control keeps an explicit construction-safe offset for the narrower list in landscape and portrait.

## Physical-device status

As of 2026-09-08, the installed Android PWA has physically verified the baseline semantic slice:

- compact/expanded Hammer list readability;
- third-person Floor and Wall placement;
- vegetation masking beneath Floor Panels;
- 3P/1P switching with the Hammer session open;
- first-person Remove acquisition when the white dot is on a Wall;
- target release when the dot moves off the Wall;
- exact Wall removal with a three-Log refund.

The new Door slice must receive the same physical Android acceptance before Window, Stairs or Roof is enabled: Door preview/snap in 3P and 1P, three-Log placement, walking through the opening, exact Remove targeting/refund, and save/Continue restoration of the open doorway.
