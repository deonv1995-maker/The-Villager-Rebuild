# Hammer construction menu

## Decision

The Hammer is now the player-facing entry point for semantic construction.

The construction responsibility chain is:

`Hammer selection -> structure menu -> semantic panel choice -> PanelConstructionSystem -> inventory Log cost`

Logs remain inventory material. Selecting or tapping the Log inventory row must not open a competing construction workflow.

## Mobile interaction

Selecting an owned **Hammer** automatically opens the structure-style building menu.

The menu is deliberately presented as a small house schematic rather than a generic list. It uses the existing Villager mobile visual language: dark forest-green surfaces, warm timber/gold accents, compact rounded controls and large touch targets.

The current active choices are:

- **Floor** — complete semantic Floor Panel, 3 Logs;
- **Wall** — complete semantic Solid Wall Panel, 3 Logs;
- **Remove** — leaves placement mode while keeping the Hammer equipped, then uses the existing exact Hammer demolition target;
- **Close** — closes the menu while leaving the Hammer equipped.

The following structure locations are visible but disabled so the player can understand the eventual building vocabulary without reconnecting unfinished legacy systems:

- Door;
- Window;
- Stairs;
- Roof.

Those controls must remain disabled until their semantic runtime slices are implemented.

## Hammer behavior

The Hammer remains equipped while Floor or Wall placement is active. Construction must never silently switch the toolbelt back to Hand.

When Floor or Wall is selected:

- the normal semantic panel preview remains authoritative;
- green means the selected panel can be placed and the inventory can pay the cost;
- red means the placement is invalid or there are not enough Logs;
- the unified mobile Action button shows the Hammer and **PLACE**;
- selecting Hammer is allowed even with fewer than three Logs so the player can see the intended slot and the missing material requirement.

When Remove is selected:

- semantic placement preview is disabled;
- first person continues to raycast the exact materialized panel meshes;
- third person continues to use the nearest valid semantic panel target;
- the unified Hammer action is **REMOVE**;
- dependency-safe demolition, exact Log refunds and normal Hammer durability remain unchanged.

## Architecture boundary

`PanelConstructionSystem` remains the single structural authority for Floor and Wall validity, local grids, collision, demolition dependencies and persistence.

`HammerConstructionMenu` owns only presentation and player choice. `PanelConstructionRuntimeController` owns the translation between Hammer/toolbelt state, menu state and the existing semantic construction runtime.

The old `MobileHud` physical-log build tray remains transition infrastructure for deferred legacy systems but is explicitly hidden during semantic panel construction and is not a source of Floor/Wall choices.

The change does not alter:

- panel costs;
- schema-2 save format;
- local building grids;
- terrain/support rules;
- collision authority;
- Hammer durability rules;
- exact demolition refunds;
- PWA/install architecture;
- deployment architecture.

## Desktop compatibility

`B` remains a construction shortcut. If the Hammer is not equipped, the shortcut routes through normal Hammer selection; once the menu is open, `B` cycles the live Floor/Wall choices. `E` / `V` confirms placement, while `G` / Escape closes the menu. In Remove mode, `E` / `V` removes the exact semantic panel target when one is selected.

## Verification

`verify-panel-construction-runtime.mjs` additionally protects these UI/runtime boundaries:

- Hammer selection is the build-menu entry contract;
- inventory Logs are not a build-menu trigger;
- the Hammer stays equipped during semantic placement;
- the structure menu exposes Floor, Wall, Remove and Close;
- Door, Window, Stairs and Roof remain visibly disabled;
- RAW, FRAME and physical-log DROP are not exposed in the semantic structure menu;
- the production shell loads the dedicated structure-menu styling.

Device verification remains required for menu readability, touch target size, placement confirmation, Remove targeting and first-person behavior on the installed Android PWA.
