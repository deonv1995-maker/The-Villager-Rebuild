# Survival interaction model

Foundation 0.3.6 keeps the shared gathering/crafting/building/combat boundaries from 0.3.5 and tightens their presentation rules after Android device verification.

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

The bottom toolbelt is the single basic-tool selection surface. Its first slot is always **Hand**, representing the default Ranger state with no tool equipped. The five craftable tool slots follow it: Spear, Axe, Hammer, Pickaxe and Sword.

Selecting Hand clears the equipped tool without consuming or discarding owned tools. Selecting an unowned tool attempts to craft it through the existing `CraftingSystem`; selecting an owned tool equips it.

Current roles are:

- **Spear** — projectile hunting weapon. It auto-locks a valid target inside spear range. The Ranger uses the authored KayKit `Throw` animation, releases the held spear part-way through that animation, and the projectile follows a visible ballistic-style arc toward the live locked target. Damage resolves only when that projectile arrives.
- **Axe** — enables tree harvesting.
- **Hammer** — enables demolition of supported player-built structures such as placed logs and the current campfire.
- **Pickaxe** — mines large world rocks into loose Stone pickups.
- **Sword** — short-range fighting/defence weapon. Foundation establishes the melee tool role; later hostile-enemy behaviour can use the same boundary rather than creating a second combat system.

All non-spear handheld tool visuals mount through the Ranger's shared authored right-hand attachment slot. They must follow the hand/bone animation instead of using fixed offsets from the Ranger root, which previously caused Axe/Hammer/Pickaxe/Sword visuals to float beside the shoulder.

Tool recipes consume only inventory resources. Tool ownership is stored in the same inventory/crafting data model, while equipped-tool state belongs to `ToolbeltSystem`.

## Campfire

The campfire costs three Sticks plus three Stones. It does not consume Logs. Logs are reserved for physical construction.

Campfire construction is a two-step placement flow:

1. the first Campfire action searches the existing playable/slope/collision rules and displays a translucent green world template at the current valid placement;
2. the second Campfire action confirms that same template and only then consumes the three Sticks and three Stones, creates the real fire and registers collision.

The green template follows the Ranger-facing placement calculation while preview mode is active. It has no gameplay collision and consumes no materials. Selecting another tool cancels an unconfirmed preview.

## System boundaries

- `InventorySystem` never stores physical Logs.
- `GatherableSystem` owns loose world resources and refuses to inventory a resource declared `storage: 'physical'`.
- `PhysicalLogSystem` owns carrying, dropping and primitive log placement.
- `ToolbeltSystem` owns Hand/default state plus craft/select/equip state for the five basic tools.
- `RangerController` owns the authored right-hand attachment boundary and spear throw animation/release timing.
- `RangerToolPresentation` mounts Axe, Hammer, Pickaxe and Sword through that hand boundary.
- `TreeHarvestSystem` only operates when the Axe is selected by the app interaction layer.
- `RockHarvestSystem` only operates when the Pickaxe is selected.
- `CampfireSystem` owns preview, confirmation, final placement and its demolition handle.
- `SpearProjectileSystem` owns the moving arcing spear presentation and hit timing.
- `DayOneHuntSystem` exposes target acquisition and damage; it does not decide which player tool is equipped.

The PWA shell, deterministic Pages deployment ordering, expanded mainland, render chunks, terrain, water, tree occlusion and world-generation architecture are outside this refinement pass and remain unchanged.
