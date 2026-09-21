# Sprout companion

## Role

Sprout is the Ranger's persistent futuristic companion. The Ranger remains the directly controlled human character and performs survival actions such as chopping, mining, cutting and interacting with the world. Sprout supports those actions through retrieval, matter compression, storage and later utility upgrades rather than replacing the Ranger as the active survivor.

The core fantasy is deliberate: the Ranger is physically limited, while Sprout explains how the player can eventually manage quantities of bulky resources that a human could not reasonably carry.

## Opening introduction

Sprout is tied directly to the shipwreck opening.

1. The ship approaches the island through calm water.
2. The voyage transitions toward night and stars become visible.
3. A bright blue flash appears in the sky.
4. Immediately after the flash, a bright incoming object crosses toward the island.
5. The flash marks the onset of the storm that ultimately wrecks the Ranger's ship.
6. The incoming object remains on course rather than striking the ship.
7. After the Ranger reaches the beach and gets back to his feet, the object crashes elsewhere on the island.
8. The Ranger receives an exploration objective to find the distant impact site.
9. The impact site contains Sprout trapped beneath a fallen tree.
10. The Ranger frees Sprout. Sprout boots, thanks the Ranger through dialogue and pledges allegiance to the Ranger.
11. Once allegiance is complete, the same Sprout presentation leaves the crash site, follows the Ranger and can visibly compress eligible loose resources into the shared inventory.

The title scene never creates a duplicate gameplay Sprout or fake crash-site authority. The gameplay continuation owns the actual island impact and rescue. The current Sprout body and crash pod at that site are deliberately lightweight procedural presentation so the story interaction and companion systems can be completed before a production companion asset is selected; replacing that visual must not change story, inventory or collection state.

## Shared inventory and carrying rule

There is **one authoritative shared inventory** for the Ranger/Sprout pair. Sprout does not own a second inventory and no transfer UI exists between Ranger and companion.

Before Sprout becomes allied, that inventory represents the Ranger's human-scale pack. The current initial tuning is **24 bulk units**. Bulk is an abstract carrying-volume value rather than kilograms: small resources are cheap, Stones and equipment are heavier, and a full Log is deliberately very bulky. World pickups are rejected before removal when the next quantity would exceed the active capacity.

A loose Log remains visibly full-sized in the world, but **manual Log pickup stores it in the shared inventory** like the other inventory resources. Human-scale carrying remains enforced by bulk instead of a second physical-carry authority: an uncompressed Log costs eight of the Ranger's 24 bulk units, so an otherwise empty pack can hold at most three Logs. This keeps harvested timber on the same inventory boundary used by semantic construction and prevents the legacy shoulder-carry construction path from competing with the current building system.

When Sprout becomes allied, `InventoryCapacityController` derives the storage mode from that existing story checkpoint and switches the same `InventorySystem` to Sprout compressed storage. The initial Sprout tuning is **96 compressed units** with a 4:1 bulk-compression ratio and a minimum stored cost of one unit per item. A Log therefore costs eight bulk units in uncompressed accounting but only two units once Sprout compression is active. Manual Ranger pickup and Sprout's automatic retrieval both commit to this same inventory; Sprout's visible scan/compression sequence is the autonomous retrieval presentation, not a separate inventory or the only valid way to store a Log.

Capacity state is derived from current story allegiance rather than saved as a second persistence authority. Existing saves keep every saved quantity, even if an old unlimited-inventory save is temporarily above the new Ranger limit; no data is deleted. An over-capacity inventory simply cannot accept additional pickups until enough material is consumed or Sprout compression becomes available.

Future storage-capacity upgrades may increase capacity or compression efficiency, but they must extend these profiles and the same inventory authority rather than introduce parallel storage systems.

## Harvest versus retrieval

The responsibility split is explicit:

- **Ranger performs the harvesting for intact/tool-gated nodes.** The Ranger chops standing trees, mines rocks and performs other active survival interactions that require a tool or dedicated harvest system.
- **World systems create real results.** A felled tree visibly falls and settles before its configured Logs become collectible; mined resources exist in the world according to their resource system.
- **Grass is the passive forage exception.** The visible harvestable grass patches owned by `GatherableSystem` are already gatherable inventory resources rather than intact tool-gated nodes. The Ranger may hand-gather them, and allied Sprout may retrieve those same patches directly through the normal reservation/compression transaction.
- **Ranger may manually collect gatherables.** Eligible pickups, including Logs and grass patches, enter the same shared inventory when the player gathers them and capacity allows.
- **Sprout performs automatic retrieval.** After allegiance, Sprout detects eligible `GatherableSystem` resources near the Ranger and collects them through the compression sequence.
- **Inventory remains authoritative.** Collection succeeds only when the resource is legitimately transferred out of its world representation and into the shared inventory.

Sprout never silently harvests intact trees, rocks or other tool-gated nodes merely because they are within collection range. Direct grass-patch retrieval is intentionally limited to the passive forage exception already owned by `GatherableSystem`; it does not give Sprout authority over `TreeHarvestSystem`, `RockHarvestSystem` or future active harvest systems.

## Automatic collection

After allegiance, Sprout dynamically follows the Ranger and may retrieve the following gatherable types:

- Logs already produced as world pickups;
- loose Sticks;
- loose Stones;
- visible harvestable Grass patches plus loose/tutorial Grass clumps owned by `GatherableSystem`;
- later resources explicitly opted into companion collection by data.

Raw Meat is intentionally not part of the initial automatic collection set.

Collection is bounded by a companion collection radius around the Ranger. Sprout does not disappear deep into the island chasing a distant pickup. Catch-up/follow behavior wins whenever collecting would leave Sprout too far behind.

The implemented behavior loop is:

`Follow Ranger -> select eligible loose pickup that fits storage -> scan from Sprout's scanning lens while moving toward it -> stop within beam range -> hold a short scan-lock pause on the pickup -> switch scanner off -> reserve pickup -> compress visibly -> re-check capacity -> commit world removal -> increment shared inventory -> resume scanning/searching or catch up`

The collection scan and compression are deliberately separate phases. The selected pickup remains the scan target while Sprout approaches and pauses. The holographic scanner turns off before the matter-compression transfer starts, so the player can read “identify” and “store” as two different actions.

A hard catch-up fallback may relocate the companion back beside the Ranger if ordinary collision-aware movement cannot close a very large separation. This is a companion recovery rule, not a second navigation system.

## Transactional collection boundary

`GatherableSystem` remains the authority for companion-retrievable world resources and removal. Its shared loose-resource transaction now covers both normal item records and passive harvestable grass patches. Sprout does not directly award an item merely because a scan or beam animation started.

Collection uses a small reservation/commit transaction:

1. Sprout finds an active eligible gatherable that fits the currently active shared-storage profile.
2. Sprout scans that resource while approaching it, then pauses briefly in beam range with the scanner locked on the target. No reservation or inventory award occurs during this scan phase.
3. The scanner switches off before compression begins.
4. `GatherableSystem` reserves the resource for Sprout, preventing normal player targeting while the transfer is in progress.
5. Normal loose items remain active at their saved transform with their world root temporarily hidden. For a grass patch, the authoritative instanced patch remains active but receives a transient `collectionHidden` presentation flag.
6. Sprout animates a temporary presentation clone toward the companion with the existing compression beam/halo. Grass uses the same clump geometry/material presentation as the tutorial grass without converting the island's instanced field into separate scene objects.
7. If collection is cancelled, the reservation is released. Loose items reappear and grass clears only the transient `collectionHidden` flag, restoring the original patch.
8. Immediately before commit, `GatherableSystem` re-checks capacity. If storage changed or filled during the animation, the reservation is released and the world resource is restored instead of being lost.
9. If compression completes and capacity still permits it, `GatherableSystem` commits the reserved removal. A grass commit marks the patch harvested and permanently hides its authoritative instanced entries.
10. Only after that commit succeeds does the existing shared `InventorySystem` receive the quantity and the HUD refresh from the authoritative inventory snapshot.

Because the authoritative resource is not made inactive until commit, an autosave during the short compression animation still records a recoverable world resource rather than a half-transferred award. Reservation state is deliberately transient and is cleared on restore; harvested grass patch IDs remain the persistence authority for depleted patches.

## Scan and compression presentation

Collection must be readable rather than an unexplained disappearance:

1. Sprout approaches the eligible loose resource while the cyan scanner projects from the authored scanning lens toward the selected item.
2. Once inside collection beam range, Sprout stops and holds the scanner on the item for a short scan-lock pause.
3. The scanner switches off.
4. The existing blue compression beam/halo starts and a presentation clone scales down and moves toward Sprout.
5. The authoritative world pickup is removed only when the transfer succeeds.
6. The shared inventory icon/quantity visibly refreshes after the award.
7. Sprout resumes searching for the next eligible loose pickup after the short collection cooldown.

Logs use a slightly longer compression beat than small loose resources. Presentation timing never creates a second inventory or duplicate award. Idle curiosity may still add its existing inspection beat inside the reserved transfer, but that occurs after the scanner phase has ended and does not change the reservation/commit authority.

## Following and collision

Sprout uses the shared world collision service for ordinary follow/collection movement. It hovers at a small fixed height above the current walkable support, follows behind and slightly beside the Ranger, and uses a smaller collision footprint than the human Ranger. Grounding is layer-aware: the companion resolves support through the same reference-height-aware `walkableHeightAt` boundary used by traversal, so an excavated cave floor can remain authoritative even when the overworld surface exists at the same X/Z.

The companion does not introduce a navmesh, cave-only locomotion mode or a competing obstacle database. If it falls far enough behind, collection intent is cancelled and catch-up takes priority. A bounded hard catch-up is allowed only as recovery from large separation or obstacle trapping, and that recovery uses the Ranger's current vertical layer when choosing Sprout's support height.

## Tree felling and timber handoff

Normal tree harvesting now follows the intended visible handoff:

`Axe hits -> final hit hides the instanced standing tree -> an authored-tree proxy pivots away from the Ranger -> fall settles -> stump/regrowth state begins -> configured Log results become collectible -> Ranger or Sprout may collect those Logs`

The falling presentation is created from the harvested tree's existing render matrices and shared tree mesh/material data. It is therefore a temporary presentation of the same authored tree rather than a second forest-tree authority. A low-poly fallback is used only when no render-state handles are available.

Logs are **not** spawned at the final axe hit. `TreeHarvestSystem` creates them only after the falling presentation reaches its settled state. The Ranger can manually pick up those loose Logs into the shared inventory whenever capacity allows. After Sprout allegiance, Sprout may alternatively scan and compress those same legitimate pickups into the same inventory; neither path awards timber before the visible tree impact has completed.

The tree collider is removed when felling begins so the former standing trunk no longer behaves as an upright obstacle. Falling-tree damage/collision is intentionally not introduced by this slice; that would be a separate combat/physics decision.

### Save/Continue rule for felling

Tree regrowth persistence is also the settled-state checkpoint for this transition:

- a save written during the short falling animation contains no regrowth record for that tree, so Continue restarts the fall and still produces its Logs only after impact;
- a save written after the tree settled contains its regrowth record, so restore finalizes the stump/regrowth state without spawning replacement Logs because restored `GatherableSystem` state is already authoritative for whether those Logs still exist or were collected;
- older saves created before visible felling are treated as already-settled tree state and therefore do not duplicate timber on Continue.

This keeps harvesting, world pickups and shared inventory as separate authorities while preserving save compatibility.

## Upgrade direction

Sprout Upgrade Shards now exist as a persistent shared-inventory progression resource discovered in deterministic underground pockets. Shard placement/collection is owned by the underground content layer and normal inventory; there is intentionally no second Sprout-specific shard counter. This pass establishes the exploration reward only and does not yet spend shards or alter companion statistics.

Future Sprout upgrades may include:

- storage-capacity upgrades and improved compression efficiency;
- collection radius;
- compression/collection speed;
- sequential or multi-target retrieval;
- maximum compressible object size;
- scanner, light, repair or story-specific utility systems.

These are progression extensions and must build on the same companion/inventory boundaries. When upgrade spending is introduced, it should consume `sprout_shard` from `InventorySystem` and apply upgrades through a dedicated Sprout progression authority rather than embedding upgrade logic in cave generation.

## Architecture boundaries

- `InventorySystem` remains the single item-count authority for the Ranger/Sprout pair, including collected `sprout_shard` progression resources. It owns storage profiles, bulk accounting and capacity checks while retaining an uncapped authoritative `add` path for save restore and internal state transformations.
- `InventoryCapacityController` binds the active inventory profile to the existing Sprout allegiance checkpoint, exposes that capacity to world-pickup systems and presents the compact PACK/SPROUT capacity readout. It does not own quantities.
- `GatherableSystem` remains responsible for loose world pickup identity, passive harvestable grass patches, player targeting, Ranger capacity preflight, Sprout reservation/release and legitimate committed removal. Inventory-backed resources, including Logs and Grass, use the same reservation/commit boundary; it never deletes a resource that fails the active capacity check.
- `TreeHarvestSystem` remains responsible for axe hits, standing-tree state, felling completion, stump/regrowth state and creation of timber results.
- `TreeFellingPresentation` owns only the temporary visual fall of the already-harvested authored tree. It does not award Logs, mutate inventory or decide harvesting.
- `SproutArrivalController` owns the opening gameplay story state, crash investigation objective, rescue action, boot dialogue and allegiance checkpoint. At allegiance it exposes the single crash-site Sprout presentation for companion ownership; it does not own item quantities or harvesting.
- `SproutCrashSiteSystem` owns the gameplay crash-site presentation/collision, incoming blue object, fallen rescue tree and pre-allegiance temporary Sprout/pod visual.
- `SproutCompanionController` owns post-allegiance follow intent, collision-aware catch-up, loose-resource selection, approach/scan-lock sequencing and compression presentation. It does not harvest nodes and it does not own item quantities.
- `SproutVisualRuntimeController` forwards presentation-only scanner state/target data to the rendering layer. `SproutScannerVisual` may aim the visual cone from the authored scanning lens, but it does not select targets or own scan range/timing.
- `SaveGameController` stores the additive Sprout-arrival checkpoint after normal Ranger/world restore. Capacity mode is re-derived from that checkpoint; pre-Sprout saves stay compatible and deliberately skip replaying the opening story inside an established world.
- HUD code displays objective/action/inventory feedback but does not own story or item quantities. The existing inventory strip shows the current PACK/SPROUT used/capacity value.
- Sprout's production visual/animation asset is presentation and must be swappable without changing story, movement, reservation, capacity or inventory rules.
- Existing terrain, ecology, wildlife, construction, rendering and PWA systems remain independent unless a later Sprout feature explicitly requires an integration point.

## Current implementation boundary

The Sprout introduction, crash-site rescue, companion retrieval, human carrying limit and visible tree-to-timber handoff are now connected end to end. After the beach-recovery cinematic, the blue object impacts inland; the Ranger investigates, frees Sprout and completes the allegiance dialogue. The existing crash-site Sprout presentation then transfers to the companion runtime rather than spawning a duplicate actor.

Before Sprout allegiance, the Ranger's shared inventory operates as a 24-bulk-unit human pack. Small world pickups and loose Logs enter that inventory only when they fit; a Log costs eight units, so the pack remains human-scale without routing timber into the legacy shoulder-carry construction path. The HUD exposes the live PACK usage.

Once allied, the same inventory changes to Sprout's 96-unit compressed profile. Manual Ranger gathering continues to use that shared inventory, while Sprout follows the Ranger, uses the shared collision world for movement, scans a bounded radius for eligible Stick/Stone/Log pickups and passive Grass patches that fit, and projects the scanner from the authored scanning lens toward a selected resource while approaching it. Normal island grass is therefore collectible by Sprout just like the tutorial Grass without duplicating the grass field into hundreds of separate scene objects. At beam range Sprout stops for a short scan-lock pause; the scanner then turns off before the resource is reserved and the existing blue compression transfer begins. Selected approaches remain bounded to eight seconds, active compression finishes before catch-up, and collection uses the `GatherableSystem` reservation/commit boundary so save data cannot record an unexplained duplicate award. The HUD changes to the SPROUT capacity readout without introducing a transfer screen or second inventory.

For timber specifically, the Ranger's final axe hit starts a visible authored-tree fall. The tree must settle before its configured Log pickups are spawned. The Ranger may manually store a loose Log through the normal inventory pickup path, while allied Sprout may instead scan and compress those same legitimate pickups into the same shared inventory for larger-scale construction storage.

Underground exploration can now award Sprout Upgrade Shards into the same shared inventory, but this slice still does **not** implement shard spending, storage-capacity upgrade effects, advanced companion utilities, multi-target collection or falling-tree damage/collision. Those remain later milestones.