# Campfire Sleep and Player Storage

## Scope

This pass adds two player-facing survival utilities without creating a second time system, inventory economy, construction grid, or settlement automation path.

- A built campfire can be used as a temporary sleep point while the Ranger is away from a future home base.
- A starter salvage chest stores Stone, Stick, Grass and Log item IDs.
- A starter salvage barrel stores resources tagged with the shared `food` storage category; Raw Meat is the first supported food.
- Container instances own independent contents and use the existing save controller.

This player-storage layer is not the Phase 3 settlement Storage Flag or villager drop-off authority. Later settlement logistics should consume or extend the same container/resource boundaries rather than create a parallel economy.

## Campfire sleep contract

`CampfireSleepRuntimeController` reads the existing `CampfireSystem` placement state and the authoritative `WorldTimeSystem` snapshot.

Sleep is offered only when all of the following are true:

- a campfire is built;
- the Ranger is within 2.8 world units of it;
- the Ranger is not carrying a construction log;
- world time is dusk/night/pre-dawn (17:30 through 06:59).

Sleeping advances the existing clock to 07:00. At or after dusk this means 07:00 on the next day; before 07:00 it means 07:00 on the current day. `WorldTimeRuntime.sync()` immediately reapplies the established lighting/celestial/torch consumers and the save controller checkpoints the new time. No separate sleep clock or visual-time inference is allowed.

## Storage architecture

`StorageContainerDefinitions` is the single source of truth for container type, accepted resources and collision footprint. `StorageContainerSystem` owns world instances and their contents. `StorageRuntimeController` owns proximity interaction and the mobile transfer panel. `StoragePanel` is presentation only.

Transfers always use `InventorySystem.consume()` and `InventorySystem.tryAdd()` so Ranger capacity remains authoritative when taking items back. Storage never mutates inventory quantities directly.

The initial world contains two salvage containers near the Day 1 beach start:

- `starter-chest` — Stone, Stick, Grass and Log;
- `starter-barrel` — any resource whose `ResourceDefinitions.storageCategory` is `food`.

`StorageContainerSystem.addContainer()` supports additional independent instances. Crafting/placement recipes are intentionally not introduced in this pass; when container construction becomes a milestone, placement should create another instance through this system rather than add another storage implementation.

## Asset-pack status

The user-provided itch.io ZIP was audited before integration. It contains GLB storage props including closed/open barrel and chest variants, clay pots, a flour sack and a wicker basket. It does not contain the requested fire or tool models, and it does not contain an identifiable source/licence file.

Repository asset policy requires source, licence and provenance before third-party art is promoted into the runtime. Therefore this pass uses lightweight procedural chest/barrel fallback visuals and does **not** commit the uploaded GLBs. Once the itch.io source URL/licence is verified, the approved chest/barrel art can replace only the presentation factory; storage behavior and saves should remain unchanged.

The current Sword, Spear and Torch presentation remains unchanged. Other tool-model replacement is deferred until the corresponding source files and licence provenance are available.

## Persistence

`SaveGameController` writes container snapshots to `state.storage` and restores them through `StorageRuntimeController`. Older compatible saves that do not contain `state.storage` keep the starter salvage containers created at boot.

Each saved container record contains its stable id, type, position, yaw and accepted contents. Invalid individual container records are ignored during restoration so one damaged record cannot invalidate the entire save.

## Verification

`scripts/verify-campfire-sleep-storage.mjs`, invoked by the existing campfire verification path, protects:

- dusk/night/pre-dawn sleep availability and daytime exclusion;
- next-morning day rollover at 07:00;
- use of the existing world-time authority and runtime sync;
- chest/barrel resource-routing rules;
- transfer semantics without item duplication;
- support for multiple independent container instances;
- storage snapshot/restore behavior;
- save-controller and mobile context-action wiring;
- data-defined food categorization.

Device verification remains required for mobile panel ergonomics, starter-container world placement, collision feel, and the visible night-to-morning transition.
