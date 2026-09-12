# Sprout follower and compression implementation

## Decision

After the `ALLIED` story checkpoint, the crash-site Sprout presentation transfers into one persistent companion runtime. The companion follows the Ranger, uses the shared `WorldCollisionSystem` for ordinary movement and may retrieve only explicitly eligible loose pickups inside a bounded Ranger-centered radius.

This milestone deliberately does not introduce a second navigation authority, a second inventory, automatic harvesting of intact nodes, storage-capacity progression, or the final production Sprout model.

## Loose-resource transaction

Automatic retrieval uses the existing `GatherableSystem` as the world-pickup authority.

`find -> reserve -> animate compression -> commit removal -> InventorySystem.add`

Reservation temporarily removes a pickup from normal Ranger targeting without changing its authoritative active state or saved transform. If collection is cancelled, the reservation is released and the original pickup returns. Only a successful committed removal may increment the shared inventory.

This ordering is important for autosave safety: a save taken during compression still contains an active world pickup and no inventory award, so reloading cannot duplicate or silently lose the resource.

## Follow priority

Following the Ranger has higher priority than retrieving resources. If Sprout exceeds the catch-up threshold, collection intent is cancelled and Sprout returns to the Ranger. A larger hard catch-up threshold permits a bounded relocation beside the Ranger when collision-aware movement cannot recover from extreme separation.

The hard catch-up is a companion recovery mechanism, not a general NPC pathfinding system.

## Eligible resources

The initial automatic retrieval allow-list is:

- Stick
- Stone
- Grass, only when represented as an actual loose pickup
- Log, only after a world system has produced the Log pickup

Raw Meat is excluded from this first automatic-collection set. Harvestable grass patches, standing trees and intact rocks remain Ranger-owned interactions.

## Deferred work

The following remain separate later milestones:

- physical tree-felling before Log results become collectible;
- storage-capacity upgrades and other Sprout progression;
- multi-target collection or broader scanner behavior;
- production Sprout 3D art/animation and final presentation polish.
