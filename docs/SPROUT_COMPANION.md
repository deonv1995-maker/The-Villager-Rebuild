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

A loose Log remains a real physical object for the Ranger. Because the Ranger is human, ordinary Log interaction uses **manual shoulder-carry** rather than silently placing a whole trunk into the pack. The same Log remains an inventory-compatible resource for construction only after Sprout legitimately compresses it.

When Sprout becomes allied, `InventoryCapacityController` derives the storage mode from that existing story checkpoint and switches the same `InventorySystem` to Sprout compressed storage. The initial Sprout tuning is **96 compressed units** with a 4:1 bulk-compression ratio and a minimum stored cost of one unit per item. A Log therefore costs eight bulk units in uncompressed accounting but only two units once Sprout compression is active. No quantities move between inventories because there is still only one inventory authority.

Capacity state is derived from current story allegiance rather than saved as a second persistence authority. Existing saves keep every saved quantity, even if an old unlimited-inventory save is temporarily above the new Ranger limit; no data is deleted. An over-capacity inventory simply cannot accept additional pickups until enough material is consumed or Sprout compression becomes available.

Future storage-capacity upgrades may increase capacity or compression efficiency, but they must extend these profiles and the same inventory authority rather than introduce parallel storage systems.

## Harvest versus retrieval

The responsibility split is explicit:

- **Ranger performs the harvesting.** The Ranger chops a standing tree, mines a rock, cuts/harvests vegetation and performs other active world interactions.
- **World systems create real results.** A felled tree visibly falls and settles before its configured Logs become collectible; mined/cut resources exist in the world according to their resource system.
- **Sprout performs retrieval.** After allegiance, Sprout detects eligible loose world pickups near the Ranger and collects them through the compression beam.
- **Inventory remains authoritative.** Collection succeeds only when the resource is legitimately transferred out of its world representation and into the shared inventory.

Sprout never silently harvests intact trees, rocks or other nodes merely because they are within collection range. Harvestable grass patches also remain Ranger interactions. Sprout may collect a loose Grass pickup only after another world/harvest system has created that pickup as a legitimate result.

## Automatic collection

After allegiance, Sprout dynamically follows the Ranger and may retrieve the following loose pickup types:

- Logs already produced as world pickups;
- loose Sticks;
- loose Stones;
- loose Grass pickups produced by an eligible world/harvest flow;
- later resources explicitly opted into companion collection by data.

Raw Meat is intentionally not part of the initial automatic collection set.

Collection is bounded by a companion collection radius around the Ranger. Sprout does not disappear deep into the island chasing a distant pickup. Catch-up/follow behavior wins whenever collecting would leave Sprout too far behind.

The implemented behavior loop is:

`Follow Ranger -> scan eligible loose pickup that fits storage -> move within beam range -> reserve pickup -> compress visibly -> re-check capacity -> commit world removal -> increment shared inventory -> catch up -> resume follow`

A hard catch-up fallback may relocate the companion back beside the Ranger if ordinary collision-aware movement cannot close a very large separation. This is a companion recovery rule, not a second navigation system.

## Transactional collection boundary

`GatherableSystem` remains the authority for loose-pickup identity and removal. Sprout does not directly award an item merely because a beam animation started.

Collection uses a small reservation/commit transaction:

1. Sprout finds an active eligible loose pickup that fits the currently active shared-storage profile.
2. `GatherableSystem` reserves that pickup for Sprout, preventing normal player targeting while the transfer is in progress.
3. The authoritative pickup remains active with its original saved transform; only its normal visual is temporarily hidden.
4. Sprout animates a temporary presentation clone toward the companion with a blue beam/halo.
5. If collection is cancelled, the reservation is released and the authoritative pickup becomes visible again.
6. Immediately before commit, `GatherableSystem` re-checks capacity. If storage changed or filled during the animation, the reservation is released and the world pickup is restored instead of being lost.
7. If compression completes and capacity still permits it, `GatherableSystem` commits the reserved removal.
8. Only after that commit succeeds does the existing shared `InventorySystem` receive the quantity and the HUD refresh from the authoritative inventory snapshot.

Because the authoritative pickup is not moved or made inactive until commit, an autosave during the short compression animation still records a recoverable world item rather than a half-transferred resource.

## Compression presentation

Collection must be readable rather than an unexplained disappearance:

1. Sprout approaches the eligible loose resource.
2. A blue compression beam and halo connect Sprout to the resource.
3. A presentation clone visibly scales down and moves toward Sprout.
4. The authoritative world pickup is removed only when the transfer succeeds.
5. The shared inventory icon/quantity visibly refreshes after the award.

Logs use a slightly longer compression beat than small loose resources. Presentation timing never creates a second inventory or duplicate award.

## Following and collision

Sprout uses the shared world collision service for ordinary follow/collection movement. It hovers at a small fixed height above the current terrain, follows behind and slightly beside the Ranger, and uses a smaller collision footprint than the human Ranger.

The companion does not introduce a navmesh or a competing obstacle database. If it falls far enough behind, collection intent is cancelled and catch-up takes priority. A bounded hard catch-up is allowed only as recovery from large separation or obstacle trapping.

## Tree felling and timber handoff

Normal tree harvesting now follows the intended visible handoff:

`Axe hits -> final hit hides the instanced standing tree -> an authored-tree proxy pivots away from the Ranger -> fall settles -> stump/regrowth state begins -> configured Log results become collectible -> Sprout may collect those Logs after allegiance`

The falling presentation is created from the harvested tree's existing render matrices and shared tree mesh/material data. It is therefore a temporary presentation of the same authored tree rather than a second forest-tree authority. A low-poly fallback is used only when no render-state handles are available.

Logs are **not** spawned at the final axe hit. `TreeHarvestSystem` creates them only after the falling presentation reaches its settled state. Before Sprout allegiance the Ranger can lift one of those loose Logs through the existing physical carry/build path. After allegiance, the same loose Log also qualifies for Sprout's storage-aware compression transaction.

The tree collider is removed when felling begins so the former standing trunk no longer behaves as an upright obstacle. Falling-tree damage/collision is intentionally not introduced by this slice; that would be a separate combat/physics decision.

### Save/Continue rule for felling

Tree regrowth persistence is also the settled-state checkpoint for this transition:

- a save written during the short falling animation contains no regrowth record for that tree, so Continue restarts the fall and still produces its Logs only after impact;
- a save written after the tree settled contains its regrowth record, so restore finalizes the stump/regrowth state without spawning replacement Logs because restored `GatherableSystem` state is already authoritative for whether those Logs still exist or were collected;
- older saves created before visible felling are treated as already-settled tree state and therefore do not duplicate timber on Continue.

This keeps harvesting, world pickups and shared inventory as separate authorities while preserving save compatibility.

## Upgrade direction

Future Sprout upgrades may include:

- storage-capacity upgrades and improved compression efficiency;
- collection radius;
- compression/collection speed;
- sequential or multi-target retrieval;
- maximum compressible object size;
- scanner, light, repair or story-specific utility systems.

These are progression extensions and must build on the same companion/inventory boundaries.

## Architecture boundaries

- `InventorySystem` remains the single item-count authority for the Ranger/Sprout pair. It owns storage profiles, bulk accounting and capacity checks while retaining an uncapped authoritative `add` path for save restore and internal state transformations.
- `InventoryCapacityController` binds the active inventory profile to the existing Sprout allegiance checkpoint, exposes that capacity to world-pickup systems and presents the compact PACK/SPROUT capacity readout. It does not own quantities.
- `GatherableSystem` remains responsible for loose world pickup identity, player targeting, Ranger capacity preflight, Sprout reservation/release and legitimate committed pickup removal. It never deletes a pickup that fails the active capacity check.
- `TreeHarvestSystem` remains responsible for axe hits, standing-tree state, felling completion, stump/regrowth state and creation of timber results.
- `TreeFellingPresentation` owns only the temporary visual fall of the already-harvested authored tree. It does not award Logs, mutate inventory or decide harvesting.
- `SproutArrivalController` owns the opening gameplay story state, crash investigation objective, rescue action, boot dialogue and allegiance checkpoint. At allegiance it exposes the single crash-site Sprout presentation for companion ownership; it does not own item quantities or harvesting.
- `SproutCrashSiteSystem` owns the gameplay crash-site presentation/collision, incoming blue object, fallen rescue tree and pre-allegiance temporary Sprout/pod visual.
- `SproutCompanionController` owns post-allegiance follow intent, collision-aware catch-up, loose-resource selection and compression presentation. It does not harvest nodes and it does not own item quantities.
- `SaveGameController` stores the additive Sprout-arrival checkpoint after normal Ranger/world restore. Capacity mode is re-derived from that checkpoint; pre-Sprout saves stay compatible and deliberately skip replaying the opening story inside an established world.
- HUD code displays objective/action/inventory feedback but does not own story or item quantities. The existing inventory strip shows the current PACK/SPROUT used/capacity value.
- Sprout's production visual/animation asset is presentation and must be swappable without changing story, movement, reservation, capacity or inventory rules.
- Existing terrain, ecology, wildlife, construction, rendering and PWA systems remain independent unless a later Sprout feature explicitly requires an integration point.

## Current implementation boundary

The Sprout introduction, crash-site rescue, companion retrieval, human carrying limit and visible tree-to-timber handoff are now connected end to end. After the beach-recovery cinematic, the blue object impacts inland; the Ranger investigates, frees Sprout and completes the allegiance dialogue. The existing crash-site Sprout presentation then transfers to the companion runtime rather than spawning a duplicate actor.

Before Sprout allegiance, the Ranger's shared inventory operates as a 24-bulk-unit human pack. Small world pickups are refused without world deletion when they do not fit, and loose Logs use the physical shoulder-carry path instead of entering the pack. The HUD exposes the live PACK usage.

Once allied, the same inventory changes to Sprout's 96-unit compressed profile. Sprout follows the Ranger, uses the shared collision world for movement, scans a bounded radius for eligible loose Stick/Stone/Grass/Log pickups that fit, approaches them, displays a blue compression transfer and adds the committed quantity to the existing shared inventory. Catch-up always wins over resource chasing, and collection uses the `GatherableSystem` reservation/commit boundary so save data cannot record an unexplained duplicate award. The HUD changes to the SPROUT capacity readout without introducing a transfer screen or second inventory.

For timber specifically, the Ranger's final axe hit starts a visible authored-tree fall. The tree must settle before its configured Log pickups are spawned. The Ranger may physically lift one loose Log, while allied Sprout may instead compress those same legitimate pickups into the shared inventory for larger-scale construction storage.

This slice still does **not** implement storage-capacity upgrade progression, advanced companion utilities, multi-target collection, a production Sprout 3D asset, or falling-tree damage/collision. Those remain later milestones.
