# Mobile HUD context action

This pass keeps gameplay handlers authoritative while simplifying the mobile interaction surface and keeping construction controls out of the main building view.

## Layout invariants

- While carrying a physical Log, construction modes live in a compact two-column icon grid at the top-right safe area.
- The construction menu is collapsible. Collapsing it hides the grid and leaves one small square toggle showing the currently selected build-mode icon so the menu can be reopened without dropping the Log.
- Raw, Floor, Frame, Wall, Angle, Roof and Drop each use a dedicated icon asset. The grid is sized so Roof and Drop stay directly visible without an internal scroll area.
- Inventory is a compact vertical stack on the left, below the status banner, so it no longer competes with the construction menu.
- The bottom toolbelt is an equipment-selection bar only. Crafting lives in the dedicated top `CRAFT` menu.
- Jump remains a dedicated movement control.
- The old fixed joystick and permanent Sprint button are removed from the HUD.
- The left half of unobstructed gameplay canvas is the hidden movement surface. Touch origin becomes the temporary analog center and thumb distance controls movement speed continuously.
- A contextual RUN target appears above the active movement thumb. It is intentionally separated from the normal walking radius; sliding the same thumb into that target enables Sprint through the existing Ranger sprint state.
- The right half of unobstructed gameplay canvas owns manual camera look.
- Normal world interactions, combat and tool actions share one fixed-position Action button.
- Crafted world placement is confirmed from the crafting control rather than borrowing the Action button.

## Movement and camera behavior

`MobileHud` owns touch-region routing only. `RangerController` remains the authority for actual locomotion and camera state.

Normal mobile movement scales from slow walking to a fast run-like pace according to analog thumb distance. The contextual RUN target is a separate deliberate gesture for full Sprint, so ordinary forward walking does not require a second finger and does not accidentally sprint.

The camera normally settles behind the Ranger using damped angular follow rather than snapping to every heading change. Manual right-side look temporarily suspends that follow. Releasing the look touch keeps the viewed angle briefly, then smoothly returns yaw and pitch toward the Ranger's forward view. Camera position uses its own damping so heading and translation remain visually soft on mobile.

Keyboard movement keeps its existing desktop behavior, including Shift sprint.

## Context action ownership

`src/ui/ContextActionPolicy.js` is the single UI policy for choosing what the Action button represents.

Priority is intentionally contextual:

1. carried Log placement;
2. thrown-Spear retrieval;
3. equipped work-tool target (Axe tree, Pickaxe rock, Hammer demolition);
4. equipped Spear/Sword combat target;
5. normal pickup/gather target;
6. registered external construction action such as roof thatching;
7. disabled fallback for the equipped tool/Hand.

Campfire construction is deliberately absent from this policy. It is a crafting operation, not a contextual world Action. The policy still exposes an already-built Campfire as a Hammer demolition target because demolition is a tool interaction.

The policy chooses only the UI owner. It does not perform gameplay logic. Existing `GameApp` interaction, combat, campfire and building handlers remain authoritative.

## Crafting-owned campfire placement

The top crafting menu includes Campfire beside the tool recipes and reads the same shared recipe/inventory data.

The mobile flow is:

1. tap `CRAFT`;
2. choose Campfire `BUILD`;
3. the crafting menu closes and the existing green Campfire placement preview appears in the world;
4. the top crafting control changes from `CRAFT` to the Campfire icon + `PLACE`;
5. move the Ranger until placement is valid and tap `PLACE`;
6. the authoritative `CampfireSystem` consumes the shared recipe ingredients only on successful confirmation.

The Action button remains free for pickups, combat, tools and other contextual actions throughout this flow.

## Extending the Action button

Systems outside `GameApp` should not add another round mobile control. They can register a temporary action with `MobileHud.setExternalAction(id, action)` and remove it with `setExternalAction(id, null)`.

Roof thatching follows this rule. Once a roof bay has all required roof Logs, select Hand and move within thatch range. The unified Action button changes to `THATCH`; tapping it covers the targeted roof panel and consumes 4 Grass. Each roof slope panel is handled independently.

Craftable placeable structures should instead extend the crafting recipe/runtime boundary and use the top crafting placement state. They should not register themselves as Action-button contexts merely because they require a world preview.

## Regression coverage

`scripts/verify-mobile-context-action.mjs` verifies action priority, tool-specific routing, carried-log validity, explicit campfire exclusion from Action, crafting-owned placement state, roof-thatch registration, removal of the legacy interaction buttons, the collapsible two-column icon build grid, direct Roof/Drop visibility, dedicated build icon assets, left-side inventory, removal of the fixed joystick/permanent Sprint button, the 50/50 movement/look split, contextual sprint target spacing, analog speed scaling and damped camera follow/recenter contracts.

`scripts/verify-campfire.mjs` verifies the shared Campfire recipe, no inventory-output crafting, preview-before-consumption, crafting-control confirmation, world collision and Hammer demolition contracts.