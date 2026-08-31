# Survival interaction model

Foundation 0.3.5 establishes one shared boundary for gathering, crafting, tools, physical building materials and combat.

## Resource storage

Resources declare their storage mode in `ResourceDefinitions.js`.

- `stick`, `stone`, `grass` and food are inventory resources. Picking them up removes the world presentation and increments the player inventory.
- `log` is a physical resource. A log never enters `InventorySystem` and therefore cannot be consumed by a normal crafting recipe.
- Chopping a tree creates physical log world objects. The Ranger lifts one log at a time and carries that same object until it is placed or dropped.

This distinction is architectural: future large building materials should extend the physical-resource path instead of adding hidden inventory stacks for objects the player is expected to carry and place.

## Physical log building

Holding a log temporarily replaces ordinary tool use with a small build tray. Current Foundation options are:

- **Lay Log** — places a horizontal, standable log with shared world collision.
- **Post** — places the carried log vertically with shared world collision.
- **Drop** — returns the carried log to the normal physical pickup state.

Placed logs can later be targeted with the Hammer and disassembled back into a physical log. This is the first construction primitive; it is intentionally not a separate inventory/crafting economy.

## Inventory crafting and toolbelt

The bottom toolbelt is the single basic-tool selection surface. Selecting an unowned tool attempts to craft it through the existing `CraftingSystem`; selecting an owned tool equips it.

Current roles are:

- **Spear** — projectile hunting weapon. It auto-locks a valid target inside spear range and damage resolves only when the thrown spear reaches that target.
- **Axe** — enables tree harvesting.
- **Hammer** — enables demolition of supported player-built structures such as placed logs and the current campfire.
- **Pickaxe** — mines large world rocks into loose Stone pickups.
- **Sword** — short-range fighting/defence weapon. Foundation 0.3.5 establishes the melee tool role; later hostile-enemy behaviour can use the same boundary rather than creating a second combat system.

Tool recipes consume only inventory resources. Tool ownership is stored in the same inventory/crafting data model, while equipped-tool state belongs to `ToolbeltSystem`.

## Campfire

The campfire is an inventory-resource structure and now costs three Sticks plus three Stones. It does not consume Logs. Logs are reserved for physical construction.

The campfire still uses the existing world placement checks: playable terrain, slope, shared collision clearance and Ranger-facing placement.

## System boundaries

- `InventorySystem` never stores physical Logs.
- `GatherableSystem` owns loose world resources and refuses to inventory a resource declared `storage: 'physical'`.
- `PhysicalLogSystem` owns carrying, dropping and primitive log placement.
- `ToolbeltSystem` owns craft/select/equip state for the five basic tools.
- `TreeHarvestSystem` only operates when the Axe is selected by the app interaction layer.
- `RockHarvestSystem` only operates when the Pickaxe is selected.
- `CampfireSystem` owns campfire placement and its demolition handle.
- `SpearProjectileSystem` owns the moving thrown-spear presentation and hit timing.
- `DayOneHuntSystem` exposes target acquisition and damage; it does not decide which player tool is equipped.

The PWA shell, deterministic Pages deployment ordering, expanded mainland, render chunks, terrain, water, tree occlusion and world-generation architecture are outside this interaction pass and remain unchanged.
