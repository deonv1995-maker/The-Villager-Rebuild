# Bed and Storage Furniture

## Scope

This pass adds one new player-crafted **Bed** and refreshes the presentation of the existing **Storage Chest** and **Food Barrel** without changing the established storage economy.

- Bed is a Crafting Bench recipe that produces one inventory placeable.
- Bed placement uses the existing `PlaceableUtilityRuntimeController` preview, terrain/support-height resolution, collision checks and Action-button confirmation. Hammer REMOVE now exposes **PICK UP** for inventory-backed utilities and returns the Bed to inventory without automatically re-entering placement.
- Bed instances are owned by `BedSystem` and persist inside the existing `placeableUtilities` save section alongside Crafting Benches.
- A nearby Bed exposes the established nighttime **SLEEP** action and advances the authoritative `WorldTimeSystem` to 07:00 through the existing sleep runtime.
- Bed does **not** establish a respawn point, settlement home marker, villager assignment, comfort stat or parallel time system in this milestone.
- Chest and Barrel keep the existing `StorageContainerSystem` contents, transfer, collision, persistence and routing behavior. Only their procedural presentation factory is refreshed.

## Bed crafting and placement contract

`CraftingDefinitions.js` remains the recipe source of truth. Bed requires a Crafting Bench and currently costs **6 Stick + 6 Grass**. `InventoryCapacityDefinitions.js` assigns the packed Bed 8 bulk units.

`PlaceableUtilityDefinitions.js` remains the source of truth for Bed placement/collision dimensions. Indoor placement therefore inherits the existing constructed-floor support resolver used by Chest, Barrel and Crafting Bench rather than adding furniture-specific floor logic.

`BedSystem` owns Bed world roots, collision handles, ids and persistence records. `PlaceableUtilityRuntimeController` only coordinates inventory-to-world placement and Hammer pickup, matching the existing ownership split for Crafting Benches, storage containers and mounted Torches. Successful pickup returns exactly one packed item to inventory; placing it again is an explicit later action from inventory.

First-person utility selection remains centralized in `UtilityInteractionTargetingRules.js`. Bed, Bench, Storage and mounted Torches participate in the same centre-reticle query so one utility cannot incorrectly publish an interaction through another utility in front of it. If a directly aimed utility sits in front of a semantic Floor/Wall panel, **PICK UP** owns the first-person Action button; otherwise the established structural **REMOVE** target keeps priority.

## Indoor wall-snapping contract

Crafted placeables reuse semantic construction walls as optional placement anchors instead of creating a second room or furniture grid.

- `PanelConstructionSystem.getPlacementWallSurfaces()` exposes read-only geometry for active **solid** wall panels. Door and Window panels are deliberately excluded so furniture does not auto-block openings.
- `PlaceableUtilityWallSnapRules.js` is the single geometry rule for wall alignment. It keeps furniture on the player's side of the wall, clamps it within the wall segment, turns the item's usable/front side back into the room, and leaves only a 0.04-unit visual clearance behind the item.
- `PlaceableUtilityDefinitions.js` owns each item's wall footprint. Bed, Storage Chest, Food Barrel and Crafting Bench therefore use one generic snap algorithm instead of item-specific placement code.
- The established standable-surface resolver still owns vertical placement. `PlaceableUtilityRuntimeController` resolves the Ranger's current support level once per placement search, then rejects free or wall-snapped candidates that fall outside the shared stair-step tolerance. A preview that projects through an upstairs opening or beyond an upper-floor edge therefore keeps searching the Ranger's active storey instead of silently falling back to terrain or a lower storey. Wall snapping changes only horizontal position/yaw and re-resolves support at the snapped point.
- Collision validation ignores only the **specific solid wall that owns the snap**. Other walls, furniture and same-storey obstacles still block placement.
- Snap identity is preview-only. Save records continue storing the established `x/y/z/yaw` values, so there is no save-schema change and no second furniture persistence system.
- When no eligible wall is nearby, the original free-placement search remains the fallback. Existing exterior placement remains available.

This boundary is reusable for later furniture types: a new crafted prop normally needs only its data-defined wall footprint unless it genuinely requires different placement semantics.

## Sleep contract

The existing `CampfireSleepRuntimeController` retains the sleep-time authority. Bed is an additional sleep source, not a second sleep implementation.

- Sleep remains available only during the established dusk/night/pre-dawn window.
- A Bed within the existing 2.8-unit sleep radius takes precedence over a nearby campfire.
- Sleeping in Bed advances the shared clock to 07:00, immediately syncs established world-time presentations and checkpoints the save as `bed-sleep`.
- Campfire sleep remains unchanged as the temporary away-from-home sleep option.

## Storage visual refresh

The Chest remains a lightweight procedural prop but now has a rounded five-plank lid profile, lower trim, metal bands, lock hardware and feet. The Barrel now uses a segmented bulged body, four metal hoops, a top cap and bung. These meshes retain cast/receive-shadow behavior and stay small enough for repeated mobile placement.

The presentation refresh intentionally does not change container ids, accepted resources, contents, transfer rules, interaction radius or save records.

## Uploaded asset pack and licensing

The user-supplied `FREE.zip` was inspected during this pass. It contains FBX/GLB versions of a closed/open barrel, closed/open wooden chest, wooden crate, flour sack and wicker basket, but **no Bed model and no bundled licence/readme/provenance file**.

The repository's existing asset policy requires verifiable source/licence provenance before third-party art is committed into the runtime. The uploaded GLBs are therefore **not** copied into the repository. The runtime uses original procedural furniture presentation so the deployed build remains redistribution-safe. If a verifiable source URL/licence is supplied later, approved models can replace only the visual factories without changing crafting, storage, placement, sleep or saves.

## Verification

The existing `verify-placeable-utility-hammer-move.mjs` regression path now additionally protects:

- Bed inventory/placeable integration;
- Bed/Bench/Chest/Barrel Hammer REMOVE > **PICK UP** behavior, with the packed item left in inventory rather than forced into placement;
- Bed placement and saved elevation on constructed floors;
- active-storey placement for Bed, Chest, Barrel and Crafting Bench when an earlier preview candidate resolves to terrain/lower-storey support;
- data-driven Bed/Chest/Barrel/Bench wall-snap footprints;
- semantic solid-wall snapping with the furniture back edge held 0.04 units off the wall;
- snapped-wall-only collision filtering while neighboring walls remain blocking;
- snapped orientation persistence through existing save records;
- Bed persistence through `placeableUtilities`;
- nighttime Bed sleep advancing the authoritative clock to 07:00 and syncing lighting;
- refreshed Chest/Barrel procedural detail;
- continued absence of an unlicensed GLB runtime dependency.

The full repository `npm run check` remains the merge gate.

## Device verification

After deployment, verify on a physical phone in both first- and third-person:

- craft Bed from a Crafting Bench and place it outdoors and on an indoor constructed floor;
- from an upper floor, place Bed, Chest, Barrel and Crafting Bench near floor edges/stair openings and confirm previews remain on that upper level rather than appearing below;
- aim Bed, Chest, Barrel and Crafting Bench near an interior solid wall and confirm each snaps tightly against it with its usable/front side facing into the room;
- confirm Door/Window openings do not attract furniture snapping and neighboring walls still prevent corner clipping;
- confirm the tighter wall placement leaves noticeably more walking space without trapping the Ranger;
- at night, approach the Bed and confirm **SLEEP** appears and wakes at 07:00;
- Hammer > REMOVE shows **PICK UP** for Bed, Crafting Bench, empty Chest and empty Barrel, returns the selected item to inventory, and does not open a placement preview until the item is selected from inventory again;
- Chest and Barrel still open, transfer resources and restore after Save/Continue;
- refreshed Chest lid/lock/feet and Barrel bulge/hoops read clearly at normal gameplay distance without obvious mobile frame-rate regression.
