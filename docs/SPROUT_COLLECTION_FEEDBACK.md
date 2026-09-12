# Sprout collection feedback

This milestone polishes the already-established shared Ranger/Sprout inventory loop without changing inventory authority, harvesting ownership or storage balance.

## Visible inventory gain rule

Every positive world-resource addition to the shared inventory should be visibly acknowledged at the inventory strip. The resource row pulses and briefly shows a `+N` badge beside the icon, while the PACK/SPROUT capacity badge also pulses so the player can connect the world pickup to the stored-capacity change.

The feedback is presentation only. `InventorySystem` remains the item-count authority and `InventoryGainFeedbackController` wraps the established `add` boundary only to schedule HUD feedback after the authoritative quantity has already changed. It never decides whether a pickup is legal, never removes world resources and never owns quantities.

The controller starts only after save restoration on Continue so loading an existing inventory does not masquerade as newly collected resources. Fresh games start feedback after runtime systems are ready. Only inventory-backed world resources participate; crafted tools do not generate resource-gain popups.

## Sprout readability

When Sprout compression succeeds, the existing blue beam/halo still communicates the physical transfer. The inventory `+N` pulse is the second half of that same event: world object disappears only after a legitimate Gatherable commit, shared inventory increases, then the HUD confirms the increase.

When Sprout storage mode is active, the gain badge uses the existing blue/cyan Sprout visual language. Ranger PACK feedback remains the warmer inventory color treatment.

## Follow formation polish

The post-allegiance follow target is widened slightly to keep Sprout visibly beside/behind the Ranger instead of riding directly on the Ranger's hip in normal third-person framing. This is only a tuning change to the existing collision-aware follower; catch-up, collection radius, beam range and hard recovery rules remain unchanged.

## Preserved boundaries

- Ranger harvesting remains unchanged.
- Sprout still retrieves only eligible loose Stick, Stone, Grass and Log pickups.
- One shared `InventorySystem` remains authoritative.
- Storage remains 24 PACK units before allegiance and 96 compressed SPROUT units after allegiance.
- Save/Continue state is unchanged.
- No production Sprout 3D asset is introduced.
- No storage-upgrade progression is introduced by this polish slice.
- Falling-tree damage/collision remains a later milestone.
