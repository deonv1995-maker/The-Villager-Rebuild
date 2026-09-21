# Sprout command autonomy

Status: **command-driven physical mission companion**.

Sprout remains stowed with the Ranger while unused. He is not a permanent follower and does not own a second general-purpose NPC navigation system. A player-selected command temporarily deploys Sprout into the world, lets him travel to the relevant world objects, performs the task through existing authorities, and then returns him to the Ranger.

## Deployment and retrieval

Normal gathering, loose-Log collection and tree harvesting share one presentation lifecycle:

1. the Ranger takes Mini Sprout out and holds him in the right hand;
2. the Ranger uses the existing authored throw/interaction animation while Mini Sprout is released gently into the air;
3. Sprout grows to normal presentation scale during the short launch;
4. Sprout physically travels to each target and performs the mission;
5. when the mission ends, Sprout travels back to the Ranger;
6. the Ranger holds out a hand, Sprout shrinks back to Mini Sprout, and he is stowed.

The temporary deployment pose uses the Ranger's existing cinematic/hand-mount boundaries. It does not create a new Ranger animation rig. The hand mount is allowed to tilt Mini Sprout naturally while held, but once detached the mission controller levels Sprout by clearing inherited hand pitch/roll and then owns only his world-facing yaw.

Sprout mission travel is intentionally lightweight direct travel between known task targets. It is not a replacement for Ranger, villager or future NPC traversal/pathfinding.

## Resource gathering

The existing command ids for sticks, grass, stone and mushrooms now run gather missions rather than remote pointer scans. Each deployment chooses a mission target count between **2 and 5** and physically visits valid matching loose resources inside the configured gather radius.

Each collected object is still reserved and committed through GatherableSystem, then added to the shared InventorySystem. Sprout never creates substitute resources and never bypasses capacity.

If fewer valid items exist, capacity is exhausted, or energy runs out, Sprout returns with what he legitimately collected.

## Loose Logs

Collect Logs uses the same deployment/retrieval lifecycle and physically travels to loose Logs inside the established collection radius. Reservation, compression, inventory capacity and persistence remain owned by the existing shared systems.

## Tree harvesting

The tree command keeps the established **18 m** harvest radius as its mission area. Sprout records the Ranger's deployment origin, physically travels to the nearest active tree inside that radius, and applies laser cuts through TreeHarvestSystem.

After the authoritative tree fall and Log drops, Sprout travels to and stores the legitimate loose Logs before finding the next active tree inside the same original radius. The mission ends when there are no more active trees in that area, or when energy/capacity prevents safe continuation.

No tree, stump, regrowth or Log-drop rules are duplicated in Sprout code.

## Underground scan

Underground scanning intentionally uses a different presentation. The Ranger raises **Mini Sprout** and keeps him in hand while Sprout performs the full scan. Sprout does not grow or leave the Ranger for this command.

The existing underground geology service remains authoritative for the nearest undiscovered pocket. Sprout's explicit scan uses a **56 m** search radius and is allowed from the surface as well as from an existing tunnel. This surface allowance is opt-in at the geology query boundary; other detector callers keep the established underground-only default.

When a surface signal exists, the controller projects one faint blue world-space glow onto the terrain directly above the hidden chamber. This is a digging cue, not a prebuilt cave entrance. When the Ranger is already underground, the cue remains at the hidden pocket's underground position. The signal lasts about **5 seconds**, fades away completely, and does not reappear until another explicit scan.

The glow is a temporary presentation only. It does not alter pocket discovery, terrain density, mining, rewards or save state.

## Energy behavior

Energy slowly recharges only while Sprout is stowed and no transfer is active. Gather deployment/scan costs, laser pulses and compressed pickups remain centrally configured.

SproutCompanionController.grantEnergy(amount, source) remains the future reward boundary. Gameplay rewards, rewarded ads, purchases or another release-time source may grant charge without embedding commercial logic into gathering, harvesting or scanning.

## Retired responsibilities

Sprout still does not own permanent follow, catch-up teleporting, idle roaming, semantic-door routing, cave-follow layer selection or a second autonomous inventory.

The active responsibility is narrower: execute an explicit temporary mission, using shared world authorities, then return to storage.

## Verification target

Device testing should confirm the Mini Sprout hand pose, gentle grow/launch, upright world orientation after detaching from the tilted hand bone, physical travel to world items, 2–5 gather cap, multi-tree area clearing, physical Log collection, return/shrink/catch sequence, hand-held scan from both surface and tunnel, usable surface cue above the nearest hidden pocket, five-second faint blue pocket glow, and clean stow afterward.
