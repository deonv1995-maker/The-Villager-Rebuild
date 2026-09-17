# Bed and Storage Furniture

## Scope

This pass adds one new player-crafted **Bed** and refreshes the presentation of the existing **Storage Chest** and **Food Barrel** without changing the established storage economy.

- Bed is a Crafting Bench recipe that produces one inventory placeable.
- Bed placement uses the existing `PlaceableUtilityRuntimeController` preview, terrain/support-height resolution, collision checks, Action-button confirmation and Hammer REMOVE/replacement flow.
- Bed instances are owned by `BedSystem` and persist inside the existing `placeableUtilities` save section alongside Crafting Benches.
- A nearby Bed exposes the established nighttime **SLEEP** action and advances the authoritative `WorldTimeSystem` to 07:00 through the existing sleep runtime.
- Bed does **not** establish a respawn point, settlement home marker, villager assignment, comfort stat or parallel time system in this milestone.
- Chest and Barrel keep the existing `StorageContainerSystem` contents, transfer, collision, persistence and routing behavior. Only their procedural presentation factory is refreshed.

## Bed crafting and placement contract

`CraftingDefinitions.js` remains the recipe source of truth. Bed requires a Crafting Bench and currently costs **6 Stick + 6 Grass**. `InventoryCapacityDefinitions.js` assigns the packed Bed 8 bulk units.

`PlaceableUtilityDefinitions.js` remains the source of truth for Bed placement/collision dimensions. Indoor placement therefore inherits the existing constructed-floor support resolver used by Chest, Barrel and Crafting Bench rather than adding furniture-specific floor logic.

`BedSystem` owns Bed world roots, collision handles, ids and persistence records. `PlaceableUtilityRuntimeController` only coordinates inventory-to-world placement and hammer replacement, matching the existing ownership split for Crafting Benches and storage containers.

First-person utility selection remains centralized in `UtilityInteractionTargetingRules.js`. Bed, Bench and Storage participate in the same centre-reticle query so one utility cannot incorrectly publish an interaction through another utility in front of it.

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
- Bed Hammer REMOVE/replacement behavior;
- Bed placement and saved elevation on constructed floors;
- Bed persistence through `placeableUtilities`;
- nighttime Bed sleep advancing the authoritative clock to 07:00 and syncing lighting;
- refreshed Chest/Barrel procedural detail;
- continued absence of an unlicensed GLB runtime dependency.

The full repository `npm run check` remains the merge gate.

## Device verification

After deployment, verify on a physical phone in both first- and third-person:

- craft Bed from a Crafting Bench and place it outdoors and on an indoor constructed floor;
- confirm the Bed footprint feels sensible and does not clip through nearby walls;
- at night, approach the Bed and confirm **SLEEP** appears and wakes at 07:00;
- Hammer > REMOVE can move the Bed and re-enter the established placement preview;
- Chest and Barrel still open, transfer resources and restore after Save/Continue;
- refreshed Chest lid/lock/feet and Barrel bulge/hoops read clearly at normal gameplay distance without obvious mobile frame-rate regression.
