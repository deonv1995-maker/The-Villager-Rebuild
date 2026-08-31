# Survival interaction model

Foundation 0.3.7 keeps the shared gathering/crafting/building/combat boundaries from 0.3.6 and refines physical construction and work-tool presentation after Android verification. The archived original game is a behavioural reference for the interaction model; the rebuild keeps its own modular architecture.

## Resource storage

Resources declare their storage mode in `ResourceDefinitions.js`.

- `stick`, `stone`, `grass` and food are inventory resources. Picking them up removes the world presentation and increments the player inventory.
- `log` is a physical resource. A log never enters `InventorySystem` and therefore cannot be consumed by a normal crafting recipe.
- Chopping a tree creates physical log world objects. The Ranger lifts one log at a time and carries that same object until it is placed or dropped.

This distinction is architectural: future large building materials should extend the physical-resource path instead of adding hidden inventory stacks for objects the player is expected to carry and place.

## Physical log building

Foundation 0.3.7 restores the original game's physical-log proportions and construction vocabulary inside the rebuild architecture.

`PhysicalLogDefinitions.js` is the authority for the current raw Log: 2.90 units long, 0.27 radius, 0.25 construction grid and 45-degree yaw increments. Loose, carried, previewed and committed raw Logs share that definition so the material does not visibly change dimensions between gameplay states.

Holding a Log temporarily replaces ordinary tool use with the construction tray:

- **RAW** — places the whole physical Log. On open ground it follows the terrain-aware rest pose; between a supported frame pair it can snap as a structural beam.
- **FLOOR** — creates the original-reference split-log floor presentation. Adjacent floors can snap on the construction grid and register a standable support surface.
- **FRAME** — creates an upright whole-Log frame. Foundation frames require a valid floor corner and reject occupied corners.
- **WALL** — creates a split-log wall section between a supported pair of frames and refuses to stack above their supported height.
- **ANGLE** — creates an angled whole-Log structural member from a supported frame top.
- **DROP** — returns the carried Log to the loose physical-resource state rather than committing it as construction.

Selecting a build mode does not consume or place the Log. While carrying, `PhysicalLogSystem` continuously resolves the current target from Ranger position/facing and displays a translucent construction ghost. Green means the selected piece is valid; red means blocked or unsupported. The normal Hand interaction commits only the currently valid placement. Changing mode destroys and recreates the ghost from the same authoritative construction data.

Placed construction registers through `WorldCollisionSystem`; standable floor/raw pieces use support metadata rather than a separate traversal system. Hammer demolition removes the registered construction collision and returns the structure to a loose physical Log pickup.

Foundation 0.3.7 deliberately restores the important original interaction rules first. Multi-log rope hauling, upper-floor traversal/support, roofing and later advanced building systems remain later extensions and must build on this physical-material/snapping boundary rather than creating a parallel construction economy.

## Inventory crafting and toolbelt

The bottom toolbelt is the single basic-tool selection surface. Its first slot is always **Hand**, representing the default Ranger state with no tool equipped. The five craftable tool slots follow it: Spear, Axe, Hammer, Pickaxe and Sword.

Selecting Hand clears the equipped tool without consuming or discarding owned tools. Selecting an unowned tool attempts to craft it through the existing `CraftingSystem`; selecting an owned tool equips it.

Current roles are:

- **Spear** — projectile hunting weapon. It auto-locks a valid target inside spear range. The Ranger uses the authored KayKit `Throw` animation, releases the held spear part-way through that animation, and the projectile follows a visible ballistic-style arc toward the live locked target. Damage resolves only when that projectile arrives.
- **Axe** — enables tree harvesting.
- **Hammer** — enables demolition of supported player-built structures such as Log construction and the current campfire.
- **Pickaxe** — mines large world rocks into loose Stone pickups.
- **Sword** — short-range fighting/defence weapon. Foundation establishes the melee tool role; later hostile-enemy behaviour can use the same boundary rather than creating a second combat system.

All handheld tool visuals continue to mount through the Ranger's shared authored right-hand attachment slot. Foundation 0.3.7 changes Axe, Hammer and Pickaxe work motion specifically: the production Ranger plays a one-shot skeleton action and the mounted tool follows `handslot.r`. The tool object itself must not orbit independently around the wrist. Sword keeps its existing melee presentation and Spear keeps its authored Throw path.

Tool recipes consume only inventory resources. Tool ownership is stored in the same inventory/crafting data model, while equipped-tool state belongs to `ToolbeltSystem`.

## Campfire

The campfire costs three Sticks plus three Stones. It does not consume Logs. Logs are reserved for physical construction.

Campfire construction is a two-step placement flow:

1. the first Campfire action searches the existing playable/slope/collision rules and displays a translucent green world template at the current valid placement;
2. the second Campfire action confirms that same template and only then consumes the three Sticks and three Stones, creates the real fire and registers collision.

The green template follows the Ranger-facing placement calculation while preview mode is active. It has no gameplay collision and consumes no materials. Selecting another tool cancels an unconfirmed preview.

## System boundaries

- `InventorySystem` never stores physical Logs.
- `GatherableSystem` owns loose world resources, creates the authoritative raw-Log visual and refuses to inventory a resource declared `storage: 'physical'`.
- `PhysicalLogDefinitions` owns authoritative Log dimensions and construction snap constants.
- `PhysicalLogVisual` owns raw/split construction presentations without deciding placement validity.
- `PhysicalLogSystem` owns carrying, dropping, construction-mode selection, preview validity, snapping, committed Log construction and demolition conversion back to a physical Log.
- `ToolbeltSystem` owns Hand/default state plus craft/select/equip state for the five basic tools.
- `RangerController` owns the authored right-hand attachment boundary, spear throw animation/release timing and production work-action selection/timing.
- `RangerToolPresentation` mounts Axe, Hammer, Pickaxe and Sword through that hand boundary; Axe/Hammer/Pickaxe request skeleton-driven work actions from `RangerController`.
- `TreeHarvestSystem` only operates when the Axe is selected by the app interaction layer.
- `RockHarvestSystem` only operates when the Pickaxe is selected.
- `CampfireSystem` owns preview, confirmation, final placement and its demolition handle.
- `SpearProjectileSystem` owns the moving arcing spear presentation and hit timing.
- `DayOneHuntSystem` exposes target acquisition and damage; it does not decide which player tool is equipped.

The PWA shell, deterministic Pages deployment ordering, expanded mainland, render chunks, terrain, water, tree occlusion and world-generation architecture are outside this refinement pass and remain unchanged.
