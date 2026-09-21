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

Underground scan does not use the normal grow-and-deploy sequence. The Ranger visibly raises the right hand with Mini Sprout and holds him aloft while the scanner runs. The active camera mode is preserved; in first person Mini Sprout rises into the upper view instead of forcing a camera change.

The scan presentation emits exactly **three** cyan-blue ground-grid pulses centered on the Ranger. Each lattice expands outward in a circle to roughly **18 m** and fades as it travels away from the Ranger, with a brief gap before the next pulse. The third pulse must finish before the hand lowers and Mini Sprout is stowed. This grid is presentation-only and does not change the authoritative **56 m** geology query.

The underground exploration service identifies the closest pocket within the configured **56 m** scan radius. Every manual Sprout scan performs a fresh nearest-pocket query from the Ranger's current position, including pockets that have already been discovered, so rescanning the same area always produces the closest available cue. Other geology callers keep the established hidden-pocket-only default. The explicit Sprout scan is allowed both on the surface and inside excavated tunnels.

When the Ranger scans from the surface, the faint blue cue is projected onto the terrain directly above the chamber so it gives the player an actionable place to start digging without exposing the chamber geometry. Once underground, the cue remains at the pocket's underground position. Each scan restarts the cue: it stays fully readable for **10 seconds**, then fades very gradually over another **8 seconds** before disappearing.

The glow is non-persistent presentation. It does not reveal or modify pocket contents, mark the pocket discovered, change mining geometry, create a cave entrance, or introduce a second geology query. Hidden pockets are still reached by tunneling.

## Rocket-shoe flight

After Sprout is allied, the Ranger can convert the existing double jump into powered flight without adding another movement button. The first jump remains unchanged. The second airborne jump also remains a normal double jump when tapped. If the player keeps holding that second jump for the configured hold threshold, Sprout leaves storage or cancels an active field mission and transforms into a pair of rocket shoes mounted to the Ranger's left and right foot anchors.

RangerController remains authoritative for movement, collision and vertical position. It only asks the registered Sprout flight-assist provider to start or stop. While the provider reports active flight, full directional input moves at **2.5× the centralized running speed** while still resolving through the normal player collision path. Mobile analog input preserves its stick-strength scaling beneath that boosted maximum.

The held-double-jump path is now a **re-engageable boost** rather than an all-or-nothing hold. Holding the second jump deploys the boots and drives vertical velocity toward the tuned ascent speed. Releasing jump stops thrust but keeps Sprout transformed while the Ranger is still airborne; gravity resumes during that coast/fall. Pressing and holding jump again re-engages the same boots immediately, without another transformation or another double jump.

A rapid **third jump press** inside the centrally tuned tap window latches **locked flight**. Releasing that third press leaves the Ranger in flight. In locked flight the right half of the mobile screen changes from free camera look to a flight controller: drag upward/downward to climb/descend and left/right to turn. Returning that right-side control to center damps vertical velocity toward a hover. The normal left movement control continues to provide horizontal directional movement at the existing 2.5× flight speed. Landing, entering a cinematic, losing Sprout flight availability or exhausting Sprout energy ends the deployed/locked state and restores normal ground controls.

SproutCompanionController remains authoritative for whether flight is available, the shared energy meter and the transformation presentation. Flight drains **8 energy per second** from the same saved 100-point battery used by scanning, harvesting and collection. Sprout does not recharge while powering the shoes. At the current rate a completely full battery provides up to **12.5 seconds** of continuous flight before forced shutdown.

The rocket-shoe visual is presentation-only. It mounts through RangerController foot-anchor APIs so it follows the animated rig without gaining authority over player movement. The ordinary Sprout body is stowed while the shoes are active, and normal Sprout commands are disabled until flight ends.

The shoes deliberately retain the production Sprout visual language instead of reading as generic boots: ivory rounded shell plating, dark and leaf-green side panels, orange shell-band trim, cyan expression/energy light, a small leaf-fin silhouette and a cyan antigrav ring around each heel thruster. Activation uses a fast **0.18 second** visual transformation. Each foot first shows a compact Sprout-like pod, then the pod collapses while its shell stretches around the foot, panels and fins unfold, the cyan expression/core resolves and the antigrav thruster ignites near the end of the transform. Flight authority is already active during this presentation, so the animation never adds input latency to the held-double-jump traversal contract.

## Energy

Sprout has a saved energy meter with a maximum of 100. Energy slowly recharges while Sprout is stowed and no resource transfer or rocket-shoe flight is active. Scans, laser pulses, compressed pickups and flight consume centrally configured energy.

SproutCompanionController.grantEnergy(amount, source) remains the monetization-agnostic future reward boundary.

## Architecture boundaries

- SproutCompanionController owns command state, shared energy, deployment/retrieval presentation, temporary mission travel, scanner intent, tree-cutting presentation intent, pocket glow, compression presentation and rocket-shoe flight availability.
- SproutVisualRuntimeController forwards scanner and tree-cutting presentation state into separate lightweight rendering effects; neither effect owns gameplay targeting or harvesting.
- SproutRocketShoesPresentation owns only the temporary foot-mounted shoe/thruster visuals.
- SproutCommandMenuController owns only the mobile Sprout menu and reads controller state.
- RangerController owns the Ranger rig, authored cinematic animations, hand/foot mounting, generic cinematic right-hand offset hook, movement, collision and vertical flight motion. SproutCompanionController decides when its presentation hooks are used.
- TreeHarvestSystem remains authoritative for tree hits, felling, Log spawning, stumps and regrowth.
- GatherableSystem remains authoritative for loose-resource identity and reservation/commit.
- InventorySystem remains authoritative for counts and capacity.
- The underground exploration service remains authoritative for hidden-pocket selection.
- SaveGameController persists Sprout energy but intentionally does not restore an in-flight mission or temporary pocket glow.

## Device verification

Verify on the deployed Android/PWA build that deployment and retrieval read naturally in third person, the same deployment/scan/retrieval sequence stays entirely in first person when 1P is active, Mini Sprout remains visible as a first-person view prop without unhiding the third-person Ranger body, the view does not snap behind the Ranger after retrieval, Sprout remains upright after leaving the Ranger's hand/view mount, physical mission travel does not visibly teleport, 2–5 gather missions stop correctly, all trees inside the 18 m mission area are processed, Logs are collected only after normal world drops exist, the cave scan visibly raises the Ranger's right hand, all three expanding ground-grid pulses are readable and dissipate outward before the hand lowers, a surface scan produces a usable ground cue when a pocket is within 56 m, every manual scan reacquires the closest pocket even when it was previously discovered, and the glow holds for 10 seconds before completing an 8-second slow fade.

For rocket-shoe flight, verify both keyboard and touch input: a quick second-jump tap must remain only a double jump; holding the second press should visibly replace stored Sprout with two foot-mounted rocket shoes and boost upward; releasing that hold should stop thrust **without removing the boots**, and holding jump again while still airborne should resume the boost without replaying the transformation. A rapid third jump press should latch flight so releasing the button leaves the Ranger airborne. While latched on mobile, the visible right-side flight guide should replace camera-look control: upward/downward drag climbs/descends, horizontal drag turns, and returning to center settles toward a hover. The normal left movement control must continue to steer horizontally at up to **2.5× normal running speed**, with partial stick input remaining proportional. Flight must still drain the existing Sprout gauge continuously and force shutdown cleanly at zero energy or on landing. Confirm the shoes track both feet in third person and flight remains mechanically usable in first person without unhiding the body. The 0.18-second transformation should read as Sprout physically reconfiguring rather than generic boots appearing: compact pod first, ivory/green/orange shell unfolding around each foot, cyan expression/core resolving, leaf fins opening and the antigrav thrusters igniting only near the end.
