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
- **Remove** — leaves placement mode while keeping the Hammer equipped, then uses the existing exact Hammer demolition target;
- **Close** — closes the construction session while leaving the Hammer equipped.

Choosing Floor, Wall or Remove automatically collapses the expanded list back to the compact dock. The player can therefore aim, walk, rotate the camera and use the unified Hammer action without a large menu covering the placement target. Tapping the compact dock reopens the list without changing the active construction mode.

The following future structure choices remain visible as compact disabled list rows so the player can understand the eventual building vocabulary without reconnecting unfinished legacy systems:

- Door;
- Window;
- Stairs;
- Roof.

Those controls must remain disabled until their semantic runtime slices are implemented.

The construction session publishes the `hammer-construction-open` page state. The expanded list additionally publishes `hammer-construction-expanded`. These are presentation-only coordination states: sibling HUD controls use them to reserve separate screen lanes, but construction gameplay does not read them as structural state.

The normal camera view control remains independently reachable in both compact and expanded states. Beside the compact dock it uses a short offset; while the list is expanded it moves only far enough left to clear the narrower selector footprint. The normal HUD objective is suppressed during the construction session because the build status/dock already communicate the active mode, and the top build status is temporarily hidden while the selector is expanded so the two overlays cannot stack on top of each other.

The player-facing **Close** and **Remove** controls retain at least 44 CSS-pixel touch targets. Floor and Wall also remain full touch rows. Disabled future rows can be visually denser because they are not interactive. The selector and compact dock remain in the established top-right safe area so the bottom movement/action controls are not displaced.

## Hammer behavior

The Hammer remains equipped while Floor or Wall placement is active. Construction must never silently switch the toolbelt back to Hand.

When Floor or Wall is active:

- the normal semantic panel preview remains authoritative;
- green means the selected panel can be placed and the inventory can pay the cost;
- red means the placement is invalid or there are not enough Logs;
- the unified mobile Action button shows the Hammer and **PLACE**;
- the expanded structure list is collapsed during normal aiming/placement;
- selecting Hammer is allowed even with fewer than three Logs so the player can see the intended slot and the missing material requirement.

When Remove is selected:

- semantic placement preview is disabled;
- first person continues to raycast the exact materialized panel meshes;
- third person continues to use the nearest valid semantic panel target;
- the unified Hammer action is **REMOVE**;
- dependency-safe demolition, exact Log refunds and normal Hammer durability remain unchanged.

## Architecture boundary

`PanelConstructionSystem` remains the single structural authority for Floor and Wall validity, local grids, collision, demolition dependencies and persistence.

`HammerConstructionMenu` owns only presentation and player choice, including whether its selector is expanded or collapsed. `PanelConstructionRuntimeController` owns the translation between Hammer/toolbelt state, selected semantic mode and the existing semantic construction runtime.

The old `MobileHud` physical-log build tray remains transition infrastructure for deferred legacy systems but is explicitly hidden during semantic panel construction and is not a source of Floor/Wall choices.

The Hammer menu page-state classes are presentation-only coordination boundaries. They exist so sibling HUD controls can avoid the active build control footprint; they must not become sources of gameplay or construction state.

The list presentation does not alter:

- panel costs;
- schema-2 save format;
- local building grids;
- terrain/support rules;
- collision authority;
- Hammer durability rules;
- exact demolition refunds;
- first-person or third-person targeting rules;
- PWA/install architecture;
- deployment architecture.

## Desktop compatibility

`B` remains a construction shortcut. If the Hammer is not equipped, the shortcut routes through normal Hammer selection; while Floor/Wall placement is active, `B` cycles the live Floor/Wall choices. `E` / `V` confirms placement, while `G` / Escape closes the construction session. In Remove mode, `E` / `V` removes the exact semantic panel target when one is selected.

The compact/expanded menu behavior is a mobile presentation layer only and does not replace those keyboard controls.

## Verification

`verify-panel-construction-runtime.mjs` protects these UI/runtime boundaries:

- Hammer selection is the build-menu entry contract;
- inventory Logs are not a build-menu trigger;
- the Hammer stays equipped during semantic placement;
- the structure menu exposes Floor, Wall, Remove and Close;
- Door, Window, Stairs and Roof remain visibly disabled;
- RAW, FRAME and physical-log DROP are not exposed in the semantic structure menu;
- active Floor/Wall/Remove choices collapse to the compact build dock;
- the compact and expanded HUD footprints have separate layout rules;
- the production shell loads the dedicated structure-menu styling.

`verify-device-regressions-0.3.11.mjs` additionally protects the established mobile Hammer layout contract:

- Hammer construction open state is published and cleaned up;
- the expanded selector uses the narrow list presentation rather than the larger house schematic;
- Close and Remove retain deliberate touch targets;
- the 3P/1P camera control keeps an explicit construction-safe offset for the narrower list in landscape and portrait.

Physical-device verification remains required for compact/expanded readability, Floor/Wall placement confirmation, Remove targeting, status/control separation, and first-person aim behavior on the installed Android PWA.
