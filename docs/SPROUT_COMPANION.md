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
11. Sprout's first gameplay demonstration is compressing and storing the freed tree/log material.

The production crash-site interaction and production Sprout 3D asset are separate implementation slices. The title scene must not create a duplicate gameplay Sprout or fake crash-site authority merely to finish the cinematic early.

## Shared inventory rule

There is **one authoritative shared inventory** for the Ranger/Sprout pair. Sprout does not own a second inventory and no transfer UI exists between Ranger and companion.

Before Sprout joins, future capacity work should keep the Ranger's practical carrying ability intentionally limited. After Sprout joins, its matter-compression storage capability raises the amount of material that can be represented by that same shared inventory.

Storage capacity is intended to be upgradeable. Capacity progression, collection radius, compression speed and larger-object support may improve over time, but they must extend the same inventory authority rather than introduce parallel storage systems.

## Harvest versus retrieval

The responsibility split is explicit:

- **Ranger performs the harvesting.** The Ranger chops a standing tree, mines a rock, cuts/harvests vegetation and performs other active world interactions.
- **World systems create real results.** A chopped tree should visibly fall before its timber becomes collectible; mined/cut resources exist in the world according to their resource system.
- **Sprout performs retrieval.** Once unlocked, Sprout may detect eligible loose or harvested resources near the Ranger and collect them through the compression beam.
- **Inventory remains authoritative.** Collection succeeds only when the resource is legitimately transferred out of its world representation and into the shared inventory.

Sprout must never silently harvest intact trees, rocks or other nodes merely because they are within collection range.

## Automatic collection

Once allegiance is established, Sprout dynamically follows the Ranger and may collect eligible nearby resources such as:

- Logs produced by chopped trees;
- loose Sticks;
- collectible/harvested Grass;
- loose Stones;
- later resources explicitly opted into companion collection by data.

Collection is bounded by a companion collection radius around the Ranger/Sprout relationship. Sprout must not disappear deep into the island chasing a distant pickup. If following the Ranger conflicts with collecting a resource, catch-up/follow behavior wins.

The intended behavior loop is:

`Follow Ranger -> detect eligible loose resource -> orient/move within beam range -> compress/collect -> catch up -> resume follow`

## Compression presentation

Collection must be visible rather than an unexplained disappearance:

1. Sprout targets/scans the resource.
2. A blue beam or compression effect connects Sprout to the object.
3. The object visibly scales/compresses toward Sprout.
4. The world pickup is removed only when the transfer succeeds.
5. The shared inventory count visibly increments with item icon/quantity feedback.

Large objects such as Logs may use a slightly longer compression beat than small loose resources. Presentation timing must not create a second inventory or duplicate item award.

## Tree-felling requirement

Normal tree harvesting should no longer hide the standing tree and instantly replace it with Logs at the final axe hit. The intended final loop is:

`Axe hits -> tree enters falling state -> trunk visibly falls -> fall settles -> configured Log results become collectible -> Sprout may collect those Logs after allegiance`

Tree fall presentation must remain owned by the tree-harvest/world layer. Sprout only reacts to valid collectible results after they exist.

## Upgrade direction

Future Sprout upgrades may include:

- shared storage capacity;
- collection radius;
- compression/collection speed;
- sequential or multi-target retrieval;
- maximum compressible object size;
- scanner, light, repair or story-specific utility systems.

These are progression extensions, not requirements for the first companion slice.

## Architecture boundaries

- `InventorySystem` remains the single item-count authority for the Ranger/Sprout pair.
- `GatherableSystem` remains responsible for world pickup identity/presentation and legitimate pickup removal.
- `TreeHarvestSystem` remains responsible for axe hits, tree state, felling/regrowth and creation of timber results.
- Sprout companion logic owns follow/collection intent and compression presentation, not harvesting rules.
- HUD code displays inventory/capacity/delta feedback but does not own quantities.
- Sprout's production visual/animation asset is presentation and must be swappable without changing storage or collection rules.
- Story sequencing owns when Sprout allegiance becomes available; ordinary gameplay systems must not assume Sprout exists from a fresh save.
- Existing terrain, collision, wildlife, construction, rendering and PWA systems remain independent unless a later Sprout feature explicitly requires an integration point.

## Current implementation boundary

The first implementation slice adds only the celestial prelude to the existing title voyage: calm approach, night/stars, blue signal and the incoming object that establishes Sprout's arrival. The object deliberately does **not** impact during the disposable title renderer. Its island impact, crash site, rescue, dialogue, allegiance, follower behavior, auto-collection, tree falling and upgradeable capacity remain subsequent playable slices so `main` never contains a dead exploration objective or a duplicate temporary gameplay system.
