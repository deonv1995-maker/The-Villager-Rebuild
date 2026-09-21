# Sprout companion

Status: **command-driven physical mission foundation**.

After alliance, Sprout is stored with the Ranger by default and deploys only for a player-selected task. Sprout is not restored as a permanent follower. The command controller owns a temporary mission lifecycle while the established world systems remain authoritative for resources, trees, inventory and geology.

## Mobile command model

The Sprout command menu keeps the stable command ids and energy gauge. The current commands are:

- Gather sticks
- Gather grass
- Gather stone
- Gather mushrooms
- Collect loose Logs
- Harvest nearby trees
- Scan underground

The four gather commands collect real world items rather than merely marking them. Each mission selects a target count from **2 through 5**, launches Sprout physically, moves him between valid targets, and returns him when the target is met or no valid target remains.

## Shared deployment presentation

Gathering, loose-Log collection and tree harvesting use the same sequence:

- Mini Sprout is mounted in the Ranger's right hand.
- The Ranger performs the existing authored throw/interaction animation.
- Sprout is released upward and grows to normal scale.
- Sprout travels to the mission targets and works there.
- Sprout travels back to the Ranger.
- The Ranger holds out a hand while Sprout shrinks back to Mini Sprout and is stowed.

The presentation reuses RangerController.beginCinematic, playCinematicAnimation and mountRightHandObject. It does not add a second animation controller. Sprout requests the camera-preserving form of the Ranger pose lock, so deployment, scanning and retrieval never switch the player between first person and third person. In first person the normal third-person Ranger body remains hidden; Mini Sprout is temporarily mounted to the active camera as a small view-space mission prop for the hand-off/scan, then detaches back into the shared world scene. Third person continues using the authored right-hand bone mount. When Sprout detaches from the Ranger's hand or first-person view mount, the mission controller clears inherited pitch/roll before world travel so Sprout remains upright; only world yaw is retained for facing.

The cinematic lock exists only for the brief hand-off/catch presentation. Ranger control is released while Sprout is out performing a normal mission. Ending a camera-preserving first-person pose keeps the player's existing yaw and pitch instead of snapping the view behind the Ranger.

## Shared inventory capacity

Before Sprout alliance/compression, the Ranger pack remains limited to **24 bulk units**. After Sprout alliance, the same authoritative inventory is re-evaluated under Sprout compression with **96 compressed units** of capacity; quantities are not copied into a second store. The manual Log pickup path and Sprout Log collection both commit into that same inventory-backed capacity model.

Every Sprout pickup is reserved/committed through GatherableSystem and then added to the shared InventorySystem. There is no second Sprout inventory. A failed reservation, full inventory or interrupted mission leaves the legitimate object in the world.

## Tree mission

TreeHarvestSystem remains the single tree-felling authority. Collect Logs uses GatherableSystem reservation/commit and the same shared InventorySystem as every other Sprout pickup.

The tree command retains the established treeHarvestRange of **18 m** from the Ranger's deployment origin. Sprout physically visits trees inside that area one at a time.

Each laser pulse still calls TreeHarvestSystem.harvestTree. During that pulse sequence the companion controller exposes a dedicated cutting presentation target, and the rendering layer beams a narrow **red laser** from Sprout's authored scanner lens into the tree trunk with a small red impact glow. Tree cutting does not reuse the cyan scan cone/grid, and the red beam has no harvesting authority of its own.

The normal authored fall, stump state, regrowth and world Log drops therefore remain authoritative. Sprout then physically travels to those drops and stores them through the normal gatherable transaction before moving to the next tree. Sprout never creates replacement Logs if harvesting or collection is interrupted.

The mission ends when no active trees remain inside the original harvest radius. If energy or capacity prevents completion, remaining trees/Logs stay as real world state.

## Underground scan

Underground scan does not use the normal grow-and-deploy sequence. The Ranger raises Mini Sprout and holds him while the scanner runs.

The underground exploration service identifies the closest pocket within the configured **56 m** scan radius. Every manual Sprout scan performs a fresh nearest-pocket query from the Ranger's current position, including pockets that have already been discovered, so rescanning the same area always produces the closest available cue. Other geology callers keep the established hidden-pocket-only default. The explicit Sprout scan is allowed both on the surface and inside excavated tunnels.

When the Ranger scans from the surface, the faint blue cue is projected onto the terrain directly above the chamber so it gives the player an actionable place to start digging without exposing the chamber geometry. Once underground, the cue remains at the pocket's underground position. Each scan restarts the cue: it stays fully readable for **10 seconds**, then fades very gradually over another **8 seconds** before disappearing.

The glow is non-persistent presentation. It does not reveal or modify pocket contents, mark the pocket discovered, change mining geometry, create a cave entrance, or introduce a second geology query. Hidden pockets are still reached by tunneling.

## Energy

Sprout has a saved energy meter with a maximum of 100. Energy slowly recharges while Sprout is stowed and no resource transfer is active. Scans, laser pulses and compressed pickups consume centrally configured energy.

SproutCompanionController.grantEnergy(amount, source) remains the monetization-agnostic future reward boundary.

## Architecture boundaries

- SproutCompanionController owns command state, energy, deployment/retrieval presentation, temporary mission travel, scanner intent, pocket glow and compression presentation.
- SproutCommandMenuController owns only the mobile Sprout menu and reads controller state.
- RangerController owns the Ranger rig, authored cinematic animations and right-hand mount.
- TreeHarvestSystem remains authoritative for tree hits, felling, Log spawning, stumps and regrowth.
- GatherableSystem remains authoritative for loose-resource identity and reservation/commit.
- InventorySystem remains authoritative for counts and capacity.
- The underground exploration service remains authoritative for hidden-pocket selection.
- SaveGameController persists Sprout energy but intentionally does not restore an in-flight mission or temporary pocket glow.

## Device verification

Verify on the deployed Android/PWA build that deployment and retrieval read naturally in third person, the same deployment/scan/retrieval sequence stays entirely in first person when 1P is active, Mini Sprout remains visible as a first-person view prop without unhiding the third-person Ranger body, the view does not snap behind the Ranger after retrieval, Sprout remains upright after leaving the Ranger's hand/view mount, physical mission travel does not visibly teleport, 2–5 gather missions stop correctly, all trees inside the 18 m mission area are processed, Logs are collected only after normal world drops exist, a surface scan produces a usable ground cue when a pocket is within 56 m, every manual scan reacquires the closest pocket even when it was previously discovered, and the glow holds for 10 seconds before completing an 8-second slow fade.
