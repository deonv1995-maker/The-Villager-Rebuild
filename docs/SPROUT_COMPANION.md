# Sprout companion

Status: **command-driven companion foundation**.

Sprout is no longer an always-following navigation actor. After alliance, Sprout is stored with the Ranger by default and deploys only for a player-selected task. This preserves Sprout as a visible character while removing permanent follower pathfinding across deformable caves, terrain edits, cliffs and player construction.

## Mobile command model

The mobile HUD exposes a dedicated Sprout control with a live energy gauge. The first command set is:

- Find sticks
- Find grass
- Find stone
- Find mushrooms
- Collect loose Logs
- Laser a nearby tree and collect the resulting Logs
- Scan underground for the established hidden-pocket signal

Find commands are information utilities. Sprout deploys beside the Ranger, points the existing scanner toward the nearest valid signal, reports it, and then returns to storage. They do not award resources.

Collect Logs uses the existing `GatherableSystem` reservation/commit transaction and the shared `InventorySystem`. There is no second Sprout inventory.

## Shared inventory capacity

Before Sprout alliance/compression, the Ranger pack remains limited to **24 bulk units**. After Sprout alliance, the same authoritative inventory is re-evaluated under Sprout compression with **96 compressed units** of capacity; quantities are not copied into a second store. The manual Log pickup path remains inventory-backed and still obeys the current Ranger/Sprout capacity profile.

The tree command uses `TreeHarvestSystem` as the single tree-felling authority. Each laser pulse applies the same authoritative tree-harvest hit used by Ranger axe harvesting. The normal authored fall, stump/regrowth state and world Log drops are therefore preserved. Sprout collects those legitimate loose Logs afterward when energy and inventory capacity allow.

## Energy

Sprout has a saved energy meter with a current maximum of 100. Energy slowly recharges while Sprout is stowed and no resource transfer is active. Scans, laser pulses and compressed pickups consume centrally configured energy.

`SproutCompanionController.grantEnergy(amount, source)` is the future reward boundary. Gameplay rewards, rewarded advertising, purchases or another release-time source may grant charge through that boundary later; harvesting and scanning contain no advertising, storefront or payment dependency.

If energy runs out during a tree job, the already-felled tree and any uncollected Logs remain legitimate world state. Sprout never creates replacement Logs to conceal an interrupted command.

## Architecture boundaries

- `SproutCompanionController` owns commands, energy, short deployment/stow state, scanner intent and compression presentation.
- `SproutCommandMenuController` owns only the mobile Sprout menu and reads controller state.
- `TreeHarvestSystem` remains authoritative for tree hit count, felling, Log spawning, stumps and regrowth.
- `GatherableSystem` remains authoritative for loose-resource identity and reservation/commit.
- `InventorySystem` remains authoritative for Ranger/Sprout item counts and capacity.
- The underground exploration service remains authoritative for hidden-pocket signals.
- `SaveGameController` persists Sprout energy but intentionally does not restore an in-flight command.

## Current scope

This pass establishes the command/energy foundation and laser tree harvesting with Log collection. A separate “find cave entrance” command is not fabricated yet because the world does not expose a stable cave-entrance query. The existing underground scan reuses the proven hidden-pocket detector; a cave-entrance command should be added when geology exposes that explicit query.

Sprout Upgrade Shards remain a saved inventory resource. Shard spending, energy-capacity upgrades, recharge-rate upgrades and scan upgrades remain later progression work.
