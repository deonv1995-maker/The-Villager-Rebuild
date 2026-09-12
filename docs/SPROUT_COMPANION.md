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

## Shared inventory rule

There is **one authoritative shared inventory** for the Ranger/Sprout pair. Sprout does not own a second inventory and no transfer UI exists between Ranger and companion.

The current companion slice adds retrieved quantities directly to the existing `InventorySystem` only after a legitimate world-pickup transfer commits. Storage-capacity limits are not introduced by this slice. Future capacity progression may make the Ranger/Sprout carrying fiction more explicit, but it must extend the same inventory authority rather than introduce parallel storage systems.

Storage capacity, collection radius, compression speed and larger-object support may become upgradeable over time.

## Harvest versus retrieval

The responsibility split is explicit:

- **Ranger performs the harvesting.** The Ranger chops a standing tree, mines a rock, cuts/harvests vegetation and performs other active world interactions.
- **World systems create real results.** A chopped tree should ultimately visibly fall before its timber becomes collectible; mined/cut resources exist in the world according to their resource system.
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

`Follow Ranger -> scan eligible loose pickup -> move within beam range -> reserve pickup -> compress visibly -> commit world removal -> increment shared inventory -> catch up -> resume follow`

A hard catch-up fallback may relocate the companion back beside the Ranger if ordinary collision-aware movement cannot close a very large separation. This is a companion recovery rule, not a second navigation system.

## Transactional collection boundary

`GatherableSystem` remains the authority for loose-pickup identity and removal. Sprout does not directly award an item merely because a beam animation started.

Collection uses a small reservation/commit transaction:

1. Sprout finds an active eligible loose pickup.
2. `GatherableSystem` reserves that pickup for Sprout, preventing normal player targeting while the transfer is in progress.
3. The authoritative pickup remains active with its original saved transform; only its normal visual is temporarily hidden.
4. Sprout animates a temporary presentation clone toward the companion with a blue beam/halo.
5. If collection is cancelled, the reservation is released and the authoritative pickup becomes visible again.
6. If compression completes, `GatherableSystem` commits the reserved removal.
7. Only after that commit succeeds does the existing shared `InventorySystem` receive the quantity and the HUD refresh from the authoritative inventory snapshot.

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

## Tree-felling requirement

Normal tree harvesting should still move toward a visible felling state. The intended final loop is:

`Axe hits -> tree enters falling state -> trunk visibly falls -> fall settles -> configured Log results become collectible -> Sprout may collect those Logs after allegiance`

The current tree system already creates legitimate loose Log results after the final axe hit, so Sprout can retrieve those results now. However, the standing tree still transitions immediately to stump/results at the final hit. The physical falling animation/state remains a later harvesting slice.

Tree fall presentation must remain owned by the tree-harvest/world layer. Sprout only reacts to valid collectible results after they exist.

## Upgrade direction

Future Sprout upgrades may include:

- shared storage capacity;
- collection radius;
- compression/collection speed;
- sequential or multi-target retrieval;
- maximum compressible object size;
- scanner, light, repair or story-specific utility systems.

These are progression extensions and must build on the same companion/inventory boundaries.

## Architecture boundaries

- `InventorySystem` remains the single item-count authority for the Ranger/Sprout pair.
- `GatherableSystem` remains responsible for loose world pickup identity, player targeting, Sprout reservation/release and legitimate committed pickup removal.
- `TreeHarvestSystem` remains responsible for axe hits, tree state, regrowth and creation of timber results. The future physical fall belongs there, not in Sprout logic.
- `SproutArrivalController` owns the opening gameplay story state, crash investigation objective, rescue action, boot dialogue and allegiance checkpoint. At allegiance it exposes the single crash-site Sprout presentation for companion ownership; it does not own item quantities or harvesting.
- `SproutCrashSiteSystem` owns the gameplay crash-site presentation/collision, incoming blue object, fallen rescue tree and pre-allegiance temporary Sprout/pod visual.
- `SproutCompanionController` owns post-allegiance follow intent, collision-aware catch-up, loose-resource selection and compression presentation. It does not harvest nodes and it does not own item quantities.
- `SaveGameController` stores the additive Sprout-arrival checkpoint after normal Ranger/world restore. Pre-Sprout saves stay compatible and deliberately skip replaying the opening story inside an established world.
- HUD code displays objective/action/inventory feedback but does not own story or item quantities.
- Sprout's production visual/animation asset is presentation and must be swappable without changing story, movement, reservation or inventory rules.
- Existing terrain, ecology, wildlife, construction, rendering and PWA systems remain independent unless a later Sprout feature explicitly requires an integration point.

## Current implementation boundary

The Sprout introduction, crash-site rescue and first companion behavior are now connected end to end. After the beach-recovery cinematic, the blue object impacts inland; the Ranger investigates, frees Sprout and completes the allegiance dialogue. The existing crash-site Sprout presentation then transfers to the companion runtime rather than spawning a duplicate actor.

Once allied, Sprout follows the Ranger, uses the shared collision world for movement, scans a bounded radius for eligible loose Stick/Stone/Grass/Log pickups, approaches them, displays a blue compression transfer and adds the committed quantity to the existing shared inventory. Catch-up always wins over resource chasing, and collection uses the `GatherableSystem` reservation/commit boundary so save data cannot record an unexplained duplicate award.

This slice still does **not** implement storage-capacity upgrades, advanced companion utilities, multi-target collection, a production Sprout 3D asset, or the normal tree-felling animation/state. Those remain later milestones.
