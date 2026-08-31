# Mobile HUD context action

This pass keeps gameplay handlers authoritative while simplifying the mobile interaction surface and keeping construction controls out of the main building view.

## Layout invariants

- While carrying a physical Log, construction modes live in a compact vertical menu at the top-right safe area.
- The construction menu is collapsible. Collapsing it hides only the mode choices; the current-mode toggle remains available so the menu can be reopened without dropping the Log.
- Inventory is a compact vertical stack on the left, below the status banner, so it no longer competes with the construction menu.
- Toolbelt remains the equipment/crafting selector.
- Jump and Sprint remain dedicated movement controls.
- All normal world actions share one fixed-position Action button.

## Context action ownership

`src/ui/ContextActionPolicy.js` is the single UI policy for choosing what the Action button represents.

Priority is intentionally contextual:

1. carried Log placement;
2. active campfire placement confirmation;
3. equipped work-tool target (Axe tree, Pickaxe rock, Hammer demolition);
4. equipped Spear/Sword combat target;
5. normal pickup/gather target;
6. registered external construction action such as roof thatching;
7. campfire construction when its recipe is ready;
8. disabled fallback for the equipped tool/Hand.

The policy chooses only the UI owner. It does not perform gameplay logic. Existing `GameApp` interaction, combat, campfire and building handlers remain authoritative.

## Extending the Action button

Systems outside `GameApp` should not add another round mobile control. They can register a temporary action with `MobileHud.setExternalAction(id, action)` and remove it with `setExternalAction(id, null)`.

Roof thatching follows this rule. Once a roof bay has all required roof Logs, select Hand and move within thatch range. The unified Action button changes to `THATCH`; tapping it covers the targeted roof panel and consumes 4 Grass. Each roof slope panel is handled independently.

## Regression coverage

`scripts/verify-mobile-context-action.mjs` verifies action priority, tool-specific routing, carried-log validity, campfire confirmation, roof-thatch registration, removal of the old interact/attack/campfire round buttons, the collapsible right-side construction menu, and the left-side vertical inventory layout.
