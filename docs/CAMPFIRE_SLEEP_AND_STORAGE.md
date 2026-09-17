# Campfire Sleep, Crafting Bench and Player Storage

## Scope

This milestone keeps the established campfire, inventory, crafting and storage authorities, but changes how the player obtains and manages storage.

- A built campfire remains a temporary sleep point while the Ranger is away from a future home base.
- New worlds no longer receive a free Chest or Barrel in the beach area.
- The portable craft list can create a **Crafting Bench** item.
- Crafting the bench places the item in player inventory; selecting it from the suitcase starts world placement.
- Approaching a placed Crafting Bench exposes the existing unified Action button as **CRAFT**.
- A bench crafting session unlocks the **Storage Chest** and **Food Barrel** recipes.
- Crafted Chest/Barrel outputs are inventory placeables. Only explicit placement creates a `StorageContainerSystem` world instance.
- The old always-visible inventory strip and separate craft button are replaced by one suitcase button containing **Items** and **Craft** tabs.

This player-storage layer is not the later settlement Storage Flag or villager drop-off authority. Future settlement logistics should consume or extend these container/resource boundaries rather than create a parallel economy.

## Campfire sleep contract

`CampfireSleepRuntimeController` reads the existing `CampfireSystem` placement state and the authoritative `WorldTimeSystem` snapshot.

Sleep is offered only when all of the following are true:

- a campfire is built;
- the Ranger is within 2.8 world units of it;
- the Ranger is not carrying a construction log;
- world time is dusk/night/pre-dawn (17:30 through 06:59).

Sleeping advances the existing clock to 07:00. At or after dusk this means 07:00 on the next day; before 07:00 it means 07:00 on the current day. `WorldTimeRuntime.sync()` immediately reapplies the established lighting/celestial/torch consumers and the save controller checkpoints the new time. No separate sleep clock or visual-time inference is allowed.

## Crafting and placeable utility architecture

`CraftingDefinitions.js` remains the recipe source of truth. Recipes may optionally declare `station: 'bench'`. `CraftingSystem` enforces that requirement through `canUseStation`, `canCraft` and `craft`; it does not infer proximity itself.

`EquipmentRuntimeController` owns the current crafting context (`hand` or `bench`) and publishes the corresponding recipe snapshot to the HUD. Portable recipes remain available from the suitcase Craft tab. Chest and Barrel are omitted until a bench session is active, preventing a second hidden advanced-crafting path.

`PlaceableUtilityRuntimeController` owns the transition from an inventory placeable to a world utility. It is intentionally separate from tool equipment and from storage contents:

1. Crafting produces `crafting-bench`, `chest` or `barrel` inventory items.
2. The suitcase Items grid marks placeable items as selectable.
3. Selecting a placeable starts a presentation-only placement preview.
4. Confirming through the unified Action button consumes exactly one inventory item.
5. A Crafting Bench is registered with `CraftingBenchSystem`.
6. Chest/Barrel placement calls the existing `StorageContainerSystem.addContainer()` boundary.

Placement uses the existing terrain/collision authority and does not introduce another construction grid.

## Storage architecture

`StorageContainerDefinitions` is the single source of truth for container type, accepted resources and collision footprint. `StorageContainerSystem` owns world instances and their contents. `StorageRuntimeController` owns proximity interaction and the mobile transfer panel. `StoragePanel` remains presentation only.

The storage routing rules remain:

- **Storage Chest** — Stone, Stick, Grass and Log;
- **Food Barrel** — any resource whose `ResourceDefinitions.storageCategory` is `food`; Raw Meat is the first supported food.

Transfers use `InventorySystem.consume()` and `InventorySystem.tryAdd()` so Ranger capacity remains authoritative when taking items back. Container contents never become a second inventory system.

### Storage transfer UI contract

The opened storage panel is a two-pane transfer surface rather than a row of one-item Store/Take buttons:

- **ON HAND** on the left shows accepted item stacks currently carried by the Ranger.
- **CHEST** or **BARREL** on the right shows stacks currently inside that specific container.
- Both sides reuse `ASSET_PATHS.ui.mobile.resources` for item artwork and show the current stack quantity as a badge on each grid card.
- A single tap opens a quantity selector with decrement, direct numeric entry, increment, **ALL**, and the direction-specific **STORE**/**TAKE** confirmation.
- A double tap on a stack bypasses the selector and transfers the full currently transferable quantity in that direction.
- Deposits may move the whole carried stack because containers currently have no stack-capacity ceiling. Withdrawals cap the offered quantity through `InventorySystem.canAdd()` so the existing Ranger carrying-capacity authority is never bypassed.
- A selected quantity is passed once to `StorageContainerSystem.store()` or `StorageContainerSystem.take()`. The presentation layer must not loop one-item transactions, which keeps transfer conservation and future persistence hooks inside the established storage boundary.

The panel remains generic for both Chest and Food Barrel. Accepted item types still come from `StorageContainerDefinitions`; the UI must not hard-code a second list of valid resources.

## Suitcase HUD contract

`MobileHud` exposes one `inventory-menu-toggle` using the suitcase icon. When closed, the former inventory strip and independent Craft button do not occupy screen space.

The suitcase contains two tabs:

- **Items** — a compact grid for collected resources and crafted placeables. Resources are view-only. A placeable with quantity above zero exposes a PLACE affordance that delegates to `PlaceableUtilityRuntimeController`.
- **Craft** — the existing recipe list, now embedded inside the same panel. Away from a bench it shows portable recipes; during a bench session it also shows Chest and Barrel.

Opening the suitcase is also a gameplay pause boundary. `MobileHud` reports visibility through its existing `onInventoryVisibilityChange` callback; `GameApp` owns the resulting reason-based pause state rather than allowing individual gameplay systems to invent their own menu flags. While the suitcase is open:

- the main gameplay frame keeps rendering the frozen world but does not advance Ranger movement, wildlife, projectiles, harvesting, construction previews, campfire updates or world streaming;
- `WorldTimeRuntime` keeps its existing lifecycle but does not advance the authoritative clock, preventing time-of-day catch-up when the menu closes;
- independent Sprout story and companion loops respect the same `GameApp.isPaused()` authority, so story timers, movement and automatic resource collection cannot continue behind the menu;
- opening the menu immediately clears Ranger movement/sprint/look input so a held touch cannot continue driving the character underneath the overlay.

The suitcase itself is a safe-area-aware full-screen surface with internal Items/Craft scrolling, larger touch targets and no dependency on the gameplay HUD behind it. Closing it removes only the `inventory-menu` pause reason and resumes normal simulation. Inventory and crafting actions inside the suitcase remain available because they are deliberate menu actions, not background world simulation.

Campfire placement and placeable utility placement both use the existing unified contextual Action button for confirmation. This avoids adding a new placement button while preserving the existing action-routing boundary.

`InventoryCapacityController` publishes carrying capacity through `MobileHud.setInventoryCapacity()` so the suitcase header/toggle owns inventory presentation. It no longer writes directly into the retired inventory-strip DOM.

## Save compatibility and migration

`SaveGameController` continues to persist placed container records in `state.storage`. Crafting Bench instances are stored in `state.placeableUtilities` through `PlaceableUtilityRuntimeController`.

The temporary starter-storage pass created `starter-chest` and `starter-barrel` in some saves. Those ids are now an explicit migration case. On restore:

- the legacy starter world objects are not recreated;
- any saved contents inside them are returned to player inventory before the filtered storage snapshot is restored;
- migration uses `InventorySystem.add()` intentionally so saved player property is not destroyed merely because the returned contents exceed current pack capacity.

All player-crafted/placed storage instances retain their stable id, type, position, yaw and contents.

## Asset-pack status

The user-provided itch.io ZIP was audited before integration. It contains GLB storage props including closed/open barrel and chest variants, clay pots, a flour sack and a wicker basket. It does not contain the requested fire or tool models, and it does not contain an identifiable source/licence file.

Repository asset policy requires source, licence and provenance before third-party art is promoted into the runtime. This implementation therefore keeps lightweight procedural Bench/Chest/Barrel visuals and does **not** commit the uploaded GLBs. Once the itch.io source URL/licence is verified, approved art can replace only the presentation factories; crafting, placement, storage behavior and saves should remain unchanged.

The current Sword, Spear and Torch presentation remains unchanged.

## Verification

`scripts/verify-campfire-sleep-storage.mjs` protects the broader campfire/crafting/storage milestone. `scripts/verify-storage-transfer-ui.mjs` is part of `npm run check` and specifically protects the split-grid transfer interaction.

Together they protect:

- dusk/night/pre-dawn sleep availability and daytime exclusion;
- next-morning day rollover at 07:00;
- use of the existing world-time authority and runtime sync;
- absence of free starter storage on new worlds;
- portable Crafting Bench recipe and bench-gated Chest/Barrel recipes;
- inventory output before placement;
- Chest/Barrel resource-routing and transfer semantics;
- atomic multi-quantity deposit/withdrawal behavior and rejection without partial mutation;
- the two-pane ON HAND/container grid, shared resource icons, quantity badges and quantity selector;
- double-tap full-stack transfer and capacity-aware withdrawal limits;
- multiple independent placed storage instances and persistence;
- Crafting Bench proximity and persistence;
- legacy starter-container content migration;
- suitcase Items/Craft consolidation and removal of the standalone Craft button;
- full-screen suitcase layout and centralized pause wiring;
- save-controller and mobile context-action wiring;
- data-defined food categorization.

`verify:day-night` also protects the paused world-time contract so opening a menu cannot advance the clock or create a resume-time jump.

Device verification remains required for storage split-grid sizing in landscape and portrait, single-tap quantity selection, double-tap responsiveness, safe handling of full Ranger capacity, full-screen suitcase ergonomics and safe-area coverage, touch scrolling, pause/resume behavior, placement-preview readability, Bench CRAFT interaction range, Chest/Barrel collision feel and the visible night-to-morning transition.
