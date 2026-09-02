# Survival interaction model

Foundation 0.3.8 keeps the shared gathering/crafting/building/combat boundaries from 0.3.7 and refines physical construction, hauling posture and mobile tool actions after Android verification. The archived original game remains a behavioural reference only; the rebuild keeps its modular architecture and continuous terrain ownership.

## Resource storage

Resources declare their storage mode in `ResourceDefinitions.js`.

- `stick`, `stone`, `grass` and food are inventory resources. Picking them up removes the world presentation and increments the player inventory.
- `log` is a physical resource. A log never enters `InventorySystem` and therefore cannot be consumed by a normal crafting recipe.
- Chopping a tree creates physical log world objects. The Ranger lifts one log at a time and carries that same object until it is placed or dropped.

This distinction is architectural: future large building materials should extend the physical-resource path instead of adding hidden inventory stacks for objects the player is expected to carry and place.

## Physical log hauling

`PhysicalLogDefinitions.js` remains the authority for raw Log size and carry placement. The Log is 2.90 units long and the carried object is the same world object that was picked up.

Foundation 0.3.8 separates carry presentation from locomotion. `RangerLogCarryPose` runs after the Ranger animation mixer and adjusts only the upper-arm/lower-arm presentation toward shoulder-support targets. Normal idle/walk/run animation remains owned by `RangerController`. The carried Log anchor is positioned above and behind the torso to reduce body clipping.

This is intentionally not a new player-state controller. Future multi-log hauling must extend the physical hauling boundary rather than duplicate Ranger locomotion.

## Physical log building

`PhysicalLogDefinitions.js` owns the 2.90-unit Log length, 0.27 radius, 0.25 construction grid, 45-degree yaw increments and support/roof constants. Loose, carried, previewed and committed raw Logs share that definition.

Holding a Log temporarily exposes the construction tray across the top of the mobile viewport:

- **RAW** — places the whole physical Log. On open ground it follows the terrain-aware rest pose; between a supported frame pair it can snap as a structural beam.
- **FLOOR** — creates the split-log floor presentation. The first floor establishes a construction level above the highest sampled terrain beneath it. Any adjacent snapped floor inherits that exact level rather than calculating a new Y value from local terrain.
- **FRAME** — creates an upright whole-Log frame from a valid floor corner and rejects occupied corners.
- **WALL** — creates a split-log wall section between a supported pair of frames and refuses to stack above their supported height.
- **ANGLE** — creates an angled whole-Log structural member from a supported frame top.
- **ROOF** — consumes the carried whole Log and snaps it as a pitched rafter from a valid supported frame pair. Duplicate placement on the same frame pair/side is rejected.
- **DROP** — returns the carried Log to the loose physical-resource state rather than committing it as construction.

Selecting a build mode does not consume or place the Log. `PhysicalLogSystem` continuously resolves the current target from Ranger position/facing and displays a translucent construction ghost. Green means the selected piece is valid; red means blocked or unsupported. The Hand interaction commits only the current valid placement.

### Uneven terrain and floor support

The rebuild does **not** restore the archived `FoundationTerrainSystem` behaviour that cut or flattened the terrain beneath floors. The island terrain remains the single world-generation/traversal surface.

Instead, `FloorSupportVisual` adapts construction to the existing terrain:

- shallow voids beneath floor corners receive small construction-owned fill piers;
- larger voids receive vertical physical-Log support posts;
- support posts can stack visually when the gap exceeds one Log length;
- floors reject terrain that protrudes above their shared construction level or requires support deeper than the configured maximum;
- demolishing the floor removes its generated support/fill presentation with it.

`WorldCollisionSystem.isCircleClear()` accepts an optional scoped ignore predicate. FLOOR placement uses it only to ignore intentional contact with existing floor construction during adjacency checks; ordinary collision semantics for trees, rocks, walls, campfire, environment props and traversal are unchanged.

Placed floor/raw pieces continue to use the shared standable collision path. Frame/wall/angle pieces use shared construction collision. ROOF currently remains presentation/demolition construction without adding a broad blocking collider through the building interior; later roof cladding/traversal work must introduce purpose-built roof support/collision rather than a false rectangular blocker.

## Inventory crafting and toolbelt

The bottom toolbelt is the single basic-tool selection surface. Its first slot is always **Hand**, representing the default Ranger state with no tool equipped. The five craftable slots remain Spear, Axe, Hammer, Pickaxe and Sword.

Selecting Hand clears the equipped tool without consuming or discarding owned tools. Selecting an unowned tool attempts to craft it through `CraftingSystem`; selecting an owned tool equips it.

Foundation 0.3.8 adds one dedicated right-side action control whenever a tool is equipped. The button uses the equipped tool's icon. Hand pickup/build remains a separate contextual interaction path, so tool use no longer has to reuse the pickup button visually.

Current roles are:

- **Spear** — projectile hunting weapon. It auto-locks a valid target inside spear range. The Ranger uses the authored KayKit `Throw` animation, releases the held spear part-way through that animation, and the projectile follows a visible ballistic-style arc toward the live locked target. Damage resolves only when that projectile arrives.
- **Axe** — enables tree harvesting. Its authored skeleton action remains authoritative while `RangerToolPresentation` adds a small grip-relative strike accent for clearer mobile impact.
- **Hammer** — enables demolition of supported player-built structures such as Log construction and the current campfire, using the same strengthened work-action presentation.
- **Pickaxe** — mines large world rocks into loose Stone pickups, using the same strengthened work-action presentation.
- **Sword** — short-range fighting/defence weapon with a dedicated lateral slash sweep rather than the generic vertical work-tool arc.

All handheld tool visuals continue to mount through the Ranger's shared authored right-hand attachment slot. Axe, Hammer and Pickaxe still request one-shot skeleton actions from `RangerController`; the new strike accent does not replace the authored body motion. Spear remains completely on its existing authored Throw/release/projectile path.

Tool recipes consume only inventory resources. Tool ownership is stored in the inventory/crafting data model, while equipped-tool state belongs to `ToolbeltSystem`.

## Harvest hit feedback

`HarvestHitFeedback` is a shared presentation-only effect for successful tree/rock impacts. Every successful Axe or Pickaxe hit emits a short expanding ring plus a bounded set of chip fragments. It does not own damage, resource yield, collision, harvesting state or persistence.

Tree health/yield remains in `TreeHarvestSystem`; rock hit/yield state remains in `RockHarvestSystem`. The visual effect is capped and short-lived so it cannot grow into an unbounded mobile particle system.

## Campfire

The campfire costs three Sticks plus three Stones. It does not consume Logs. Logs remain reserved for physical construction.

Campfire construction stays a two-step placement flow:

1. the first Campfire action searches the existing playable/slope/collision rules and displays a translucent green world template at the current valid placement;
2. the second Campfire action confirms that same template and only then consumes the three Sticks and three Stones, creates the real fire and registers collision.

The green template follows the Ranger-facing placement calculation while preview mode is active. It has no gameplay collision and consumes no materials. Selecting another tool cancels an unconfirmed preview.

## System boundaries

- `InventorySystem` never stores physical Logs.
- `GatherableSystem` owns loose world resources, creates the authoritative raw-Log visual and refuses to inventory a resource declared `storage: 'physical'`.
- `PhysicalLogDefinitions` owns authoritative Log dimensions, carry transform and construction snap/support/roof constants.
- `PhysicalLogVisual` owns raw/split/roof construction presentations without deciding placement validity.
- `RangerLogCarryPose` owns the post-mixer upper-body hauling posture only.
- `FloorSupportVisual` owns automatic floor support/fill presentation only and never mutates island terrain.
- `PhysicalLogSystem` owns carrying, dropping, construction-mode selection, preview validity, storey-aware level snapping, committed construction, support lifecycle and demolition conversion back to a physical Log.
- `UpperStoreyFloorRules` projects only occupied lower-floor strips through the shared closed RAW top-beam topology; it does not create terrain foundations or a second structural graph.
- `WorldCollisionSystem` remains the shared collision authority; its optional clearance ignore callback is caller-scoped and does not create a second construction collision system.
- `ToolbeltSystem` owns Hand/default state plus craft/select/equip state for the five basic tools.
- `RangerController` owns the authored right-hand attachment boundary, spear Throw/release timing and production work-action selection/timing.
- `RangerToolPresentation` mounts Axe, Hammer, Pickaxe and Sword through that hand boundary; Axe/Hammer/Pickaxe request skeleton actions and Sword owns the lateral slash presentation.
- `HarvestHitFeedback` owns only transient hit presentation.
- `TreeHarvestSystem` only operates when Axe is selected by the app interaction layer.
- `RockHarvestSystem` only operates when Pickaxe is selected.
- `CampfireSystem` owns preview, confirmation, final placement and its demolition handle.
- `SpearProjectileSystem` owns the moving arcing spear presentation and hit timing.
- `DayOneHuntSystem` exposes target acquisition and damage; it does not decide which player tool is equipped.

The PWA shell, native Chrome installation model, deterministic Pages deployment ordering, expanded mainland, render chunks, terrain, water, tree occlusion and world-generation architecture are outside this refinement pass and remain unchanged.
