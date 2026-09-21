# Sprout companion

Status: **command-driven deployed companion**.

Sprout remains stored with the Ranger while unused. A player-selected task deploys the same production Sprout actor for a bounded mission, then returns that actor to the Ranger. This keeps the command-driven architecture introduced after the follower prototype while restoring the important physical behavior: when Sprout is sent to collect something, he actually travels through the world to reach it.

## Deployment and retrieval presentation

Every free-roaming Sprout mission uses one shared presentation sequence.

1. The Ranger takes out a miniaturized Sprout.
2. The Ranger gently throws/releases mini Sprout from the right hand.
3. Sprout arcs into the air, grows to normal presentation scale and begins the mission.
4. When the mission finishes, Sprout returns to the Ranger.
5. The Ranger holds out the right hand while Sprout shrinks back to mini scale and is stowed.

The sequence reuses the existing Ranger cinematic/animation boundary and the same Sprout presentation. It does not spawn a second gameplay companion. Ranger input is only held during the short deployment/retrieval beats; Sprout's mission movement itself is not a Ranger cinematic.

The underground scan is intentionally different: the Ranger keeps mini Sprout in the raised hand for the scan, mini Sprout runs the scanner from there, then the Ranger puts him away again.

## Physical mission movement

Sprout does not return to permanent follow, idle roaming or follower pathfinding. World movement exists only while a command is active.

Mission travel reuses the island's shared collision resolver and walkable-height query. There is no Sprout-specific terrain or building collision authority. This allows physical collection to work with the same world constraints as the rest of the game without rebuilding the retired always-following companion AI.

The historical **18 m** Sprout harvesting/collection distance is the fixed mission radius for physical resource work. The mission origin is captured when the command is issued, so walking the Ranger away does not drag an already deployed search area across the map.

## Basic resource collection

The former Find Sticks, Find Grass, Find Stone and Find Mushrooms commands are now physical collection missions. They retain their command IDs for compatibility, but their player-facing labels are Collect Sticks, Collect Grass, Collect Stone and Collect Mushrooms.

For each deployment Sprout chooses a target quantity of **2–5** items. He searches for the nearest legitimate matching `GatherableSystem` resource inside the 18 m mission radius, flies to it, compresses it through the existing reservation/commit transaction, then continues until the chosen quantity is reached or there are no more valid resources/capacity/energy.

If fewer than the chosen amount exists, Sprout returns with what he actually collected. He never creates missing resources to satisfy the batch count.

## Loose Logs

Collect Logs uses the same physical mission movement. Sprout travels to legitimate loose Logs inside the 18 m mission radius and compresses them one by one until no more valid Logs remain or storage/energy/movement prevents further collection.

`GatherableSystem` remains authoritative for reservation and removal, and `InventorySystem` remains the only item-count/capacity authority.

## Tree harvesting

Harvest Nearby Trees preserves `TreeHarvestSystem` as the single tree authority and the established **18 m** harvest radius.

Sprout physically travels to each active tree in that radius, stops within laser working distance, and applies the same authoritative harvest action already used by the tree system. The normal tree-fall state and legitimate world Log drops are preserved. Sprout then travels to those Logs, compresses them into shared inventory, and moves on to the next active tree in the original 18 m mission area.

The deployment ends only when there are no more active trees in that mission radius, or when energy, storage capacity or an inaccessible route forces the mission to stop. Any felled but uncollected Logs remain in the world.

## Underground pocket scan

Scan Underground keeps geology authoritative through `getUndiscoveredPocketSignal`. The Ranger raises mini Sprout and holds him while Sprout performs the scanner presentation.

When the nearest undiscovered underground pocket is detected, rendering receives only that existing geology signal and shows a faint cyan/blue glow at the detected location. The glow is presentation-only, uses no second pocket search, remains visible for about **five seconds**, and fades away until the next scan creates a new cue.

The cue deliberately reads as a weak subsurface signal rather than a permanent waypoint. Already discovered pockets remain governed by the underground system and are not reintroduced by rendering.

## Shared inventory and energy

There is still one Ranger/Sprout inventory. Before Sprout alliance/compression, Ranger carrying uses the human-scale capacity. After alliance, the same authoritative `InventorySystem` uses Sprout compressed storage; no transfer inventory is introduced.

Sprout has a saved energy meter with a current maximum of 100. Energy recharges while Sprout is stowed and no transfer is active. Collection pickups, laser passes and scans consume centrally configured energy. `SproutCompanionController.grantEnergy(amount, source)` remains the future charge/reward boundary and contains no storefront or advertising dependency.

## Architecture boundaries

- `SproutCompanionController` owns command state, energy, mission-only movement intent, deployment/retrieval sequencing, scanner intent and compression presentation.
- `WorldCollisionSystem` / island walkable-height queries remain authoritative for physical mission traversal.
- `RangerController` owns the existing character animation/cinematic and right-hand position boundary used by deployment/retrieval.
- `TreeHarvestSystem` remains authoritative for tree damage, felling, Log spawning, stumps and regrowth.
- `GatherableSystem` remains authoritative for loose-resource identity and reservation/commit.
- `InventorySystem` remains authoritative for item counts and capacity.
- The underground exploration/tunneling service remains authoritative for hidden-pocket selection.
- The pocket-signal visual is rendering-only and may not query geology itself.
- `SaveGameController` persists Sprout energy but deliberately does not restore an in-flight mission.

## Device verification target

On device, verify that mini Sprout visibly leaves and returns to the Ranger's hand; normal resource missions collect only 2–5 legitimate items; Sprout physically travels rather than remotely vacuuming pickups; the 18 m mission boundary feels consistent for basic resources, Logs and tree harvesting; multiple trees in one deployment fall and produce normal world Logs; the Ranger-held cave scan reads clearly; and the faint blue pocket signal remains visible for roughly five seconds before fading without becoming an intrusive permanent marker.
