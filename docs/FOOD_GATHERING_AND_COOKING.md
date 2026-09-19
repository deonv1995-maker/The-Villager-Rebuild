# Food Gathering and Campfire Cooking

This document records the implemented foundation for expandable gathered foods and campfire recipes without creating a second survival or inventory system.

## Implemented first pass — 2026-09-19

- Mushrooms use the authoritative `GatherableSystem` and shared inventory path.
- The deterministic island distribution places 72 mushroom clusters away from the starter corridor and biases them toward terrain with at least 0.5 forest cover.
- Mushroom visuals are lightweight procedural two-mushroom clusters built from shared geometry/materials.
- Sprout does not collect mushrooms in this pass; its existing collectible-resource allow-list remains unchanged.
- Campfire cooking is defined by `CookingRecipeDefinitions.js` rather than raw-item-specific runtime conditionals.
- Cooked Meat remains 1 Raw Meat -> 1 Cooked Meat in 3.2 seconds.
- Mushroom Stew is 3 Mushrooms -> 1 Mushroom Stew in 5.5 seconds and restores 60 hunger.
- Tapping Raw Meat or Mushrooms in the suitcase near a campfire starts the matching recipe. The campfire context action offers the highest-priority recipe currently available.
- In-progress cooking persists by recipe id. The restore path still accepts the previous single-meat save shape so compatible existing saves are not stranded.

## Mushrooms

Mushrooms are a collectible world food resource.

- The Ranger can gather visible mushroom pickups through the normal world interaction/gatherable path.
- Collected mushrooms enter the shared `InventorySystem`; they do not use a separate food pouch or cooking inventory.
- Spawn regions and rarity remain data-driven. The first pass uses forest habitat; cave-specific mushroom placement can be added later without moving ecology rules into cooking logic.
- First acquisition may use the existing one-time discovery-card pattern.
- Sprout collection eligibility can be decided separately from mushroom gathering itself; mushroom implementation must not create a Sprout-only resource path.

## Mushroom stew

The campfire can prepare **Mushroom Stew** from collected mushrooms.

- Mushroom Stew is a campfire recipe, not an instant inventory craft.
- The recipe must extend the existing station-driven `FoodRuntimeController` path already used for Raw Meat -> Cooked Meat.
- Starting a recipe reserves its ingredients through the same transaction/save semantics used by existing campfire cooking so backgrounding or Continue cannot duplicate ingredients or finished food.
- The finished stew becomes an inventory food item.
- Eating Mushroom Stew restores hunger only through `PlayerSurvivalSystem.restoreHunger()`; UI and recipe code must not mutate hunger directly.
- Mushroom quantity, cooking duration and hunger restoration are tuning values held in shared data rather than hard-coded in the runtime controller.
- A future village kitchen, cooking pot or other food station should be able to reuse the same recipe definitions instead of replacing the campfire system.

## Recipe architecture

Campfire cooking uses a small data-driven recipe definition boundary rather than accumulating item-specific conditionals.

A recipe definition should be able to describe at minimum:

- recipe id and display name;
- required station type;
- input resource quantities;
- output item and quantity;
- cooking duration;
- optional discovery/unlock metadata.

The existing Raw Meat -> Cooked Meat behavior must continue to work through the same shared path after recipe expansion.

## Milestone boundary

This pass extends the established survival/campfire systems only. It does not change cave excavation, construction, terrain collision, wildlife, Sprout collection eligibility, PWA installation or deployment architecture.
