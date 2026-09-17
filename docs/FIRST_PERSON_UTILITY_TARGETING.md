# First-person utility targeting

## Scope

Crafting Benches and placed storage share the same first-person interaction targeting rule. This prevents proximity-only context actions from selecting a nearby utility that is not under the centre reticle.

## Targeting contract

`src/world/UtilityInteractionTargetingRules.js` is the shared first-person query for Crafting Benches, Storage Chests and Food Barrels.

When the Ranger is in first person:

- the centre camera ray represented by the on-screen dot is authoritative;
- only utilities whose world roots remain inside their established interaction radius are eligible;
- eligible utility meshes are ray-tested together, so the first visible utility surface along the dot wins even when another utility is close behind it;
- moving the dot off all eligible utilities clears both the storage and Crafting Bench context actions instead of falling back to nearest-proximity selection;
- hidden utility geometry is not targetable.

`PlaceableUtilityRuntimeController` exposes `CRAFT` only when the shared target is a Crafting Bench. `StorageRuntimeController` exposes `OPEN` only when the same shared target is storage. Their existing Action-button priorities remain unchanged because first-person world selection is resolved before UI arbitration.

Third-person behavior remains proximity-based. This pass does not change interaction radii, placement, collision, storage contents, crafting recipes, transfer UI, save data or the generic `ContextActionPolicy` priority model.

## Why this is a shared rule

Bench and storage raycasts must not run as independent object-type selectors. If a Chest is directly in front of a Crafting Bench, separate raycasts can hit both and the higher-priority `CRAFT` action can incorrectly win. The shared query combines both utility types into one raycast and returns the nearest intersected utility, matching what the player is actually looking at.

## Regression coverage

`scripts/verify-first-person-demolition-targeting.mjs` now also protects utility reticle targeting. It verifies:

- Chest in front of a nearby Crafting Bench selects storage;
- Crafting Bench in front of storage selects the bench;
- moving the dot away clears utility targeting rather than using proximity fallback;
- utilities outside the existing interaction reach remain unavailable;
- hidden utility geometry cannot be targeted;
- both runtime controllers route first-person interaction through the shared targeting rule.

Device verification should place a Chest and Crafting Bench close together, aim the centre dot at each visible object in turn, and confirm the unified Action button changes between `OPEN` and `CRAFT` according to the object under the dot.
