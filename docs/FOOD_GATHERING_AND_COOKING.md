# Food Gathering and Campfire Cooking

This document records the agreed direction for expandable gathered foods and campfire recipes without creating a second survival or inventory system.

## Mushrooms

Mushrooms are a collectible world food resource.

- The Ranger can gather visible mushroom pickups through the normal world interaction/gatherable path.
- Collected mushrooms enter the shared `InventorySystem`; they do not use a separate food pouch or cooking inventory.
- Spawn regions, rarity and visual variants remain data-driven. Mushrooms may later appear in suitable damp forest/cave environments, but ecology placement should stay separate from cooking logic.
- First acquisition may use the existing one-time discovery-card pattern.
- Sprout collection eligibility can be decided separately from mushroom gathering itself; mushroom implementation must not create a Sprout-only resource path.

## Mushroom stew

The campfire can prepare **Mushroom Stew** from collected mushrooms.

- Mushroom Stew is a campfire recipe, not an instant inventory craft.
- The recipe must extend the existing station-driven `FoodRuntimeController` path already used for Raw Meat -> Cooked Meat.
- Starting a recipe reserves its ingredients through the same transaction/save semantics used by existing campfire cooking so backgrounding or Continue cannot duplicate ingredients or finished food.
- The finished stew becomes an inventory food item.
- Eating Mushroom Stew restores hunger only through `PlayerSurvivalSystem.restoreHunger()`; UI and recipe code must not mutate hunger directly.
- Exact mushroom quantity, cooking duration and hunger restoration are tuning values and should be defined in shared data rather than hard-coded in the runtime controller.
- A future village kitchen, cooking pot or other food station should be able to reuse the same recipe definitions instead of replacing the campfire system.

## Recipe architecture

When this feature is implemented, campfire cooking should move toward a small data-driven recipe definition boundary rather than accumulating item-specific conditionals.

A recipe definition should be able to describe at minimum:

- recipe id and display name;
- required station type;
- input resource quantities;
- output item and quantity;
- cooking duration;
- optional discovery/unlock metadata.

The existing Raw Meat -> Cooked Meat behavior must continue to work through the same shared path after recipe expansion.

## Milestone boundary

This is a recorded survival feature, not a reason to bypass the current construction/cave/device-acceptance work. Implementation should be scheduled as a scoped survival/cooking pass once the active milestone is verified.
