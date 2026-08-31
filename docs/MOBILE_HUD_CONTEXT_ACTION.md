# Mobile HUD context action

This pass keeps gameplay systems unchanged and simplifies only the mobile interaction surface.

## Layout invariants

- While carrying a physical Log, the construction mode bar sits at the top safe-area edge.
- Inventory is a compact vertical stack on the right and moves directly below the construction bar while building.
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

Roof thatching now follows this rule. The Action button shows the Hand icon and a `4 GRASS` caption when a valid roof panel is targeted.

## Regression coverage

`scripts/verify-mobile-context-action.mjs` verifies action priority, tool-specific routing, carried-log validity, campfire confirmation, roof-thatch registration, removal of the old interact/attack/campfire round buttons, top construction-bar placement, and vertical inventory layout.
