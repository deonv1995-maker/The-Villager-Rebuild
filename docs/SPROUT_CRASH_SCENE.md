# Sprout crash scene

## Purpose

The Sprout crash site is the first gameplay handoff from the voyage opening into the companion loop. It must read as an actual event in the island world rather than a temporary demo prop, while preserving the existing story, resource, save and companion authorities.

## Current sequence

1. After the Ranger finishes the beach-recovery introduction, the blue incoming object descends toward a deterministic collision-safe inland site.
2. A standing tree is presented from the same forest tree asset family used by the island environment.
3. The incoming pod strikes through that tree. The standing tree presentation disappears at impact and the result is a broken stump plus four standard RawLog presentations piled over Sprout.
4. The impact site presents a scorched crater with a raised irregular rim/ejecta and a damaged multi-part scout pod with cream shell sections, green armor, orange safety details, broken wing/debris, engines and cyan reactor/thruster light.
5. The impact-log pile is the rescue obstruction. The Ranger uses the existing FREE action/cinematic interaction to move the individual logs away from Sprout.
6. Sprout reboots and the existing dialogue completes. The final line explicitly cues Sprout to demonstrate what he can do with the cleared logs.
7. When allegiance becomes active, the cleared log positions are handed to `GatherableSystem` as ordinary loose Log pickups. The crash-site-only rescue presentations are hidden.
8. The existing `SproutCompanionController` sees those legitimate loose Logs, approaches them and performs the normal visible compression/reservation/commit transaction into the single shared `InventorySystem`.

## Authority boundaries

- `SproutArrivalController` remains the story/phase authority. It owns impact timing, investigation, rescue, dialogue and allegiance.
- `SproutCrashSiteSystem` owns only crash-site presentation and temporary rescue collision. It may stage the pre-allegiance log pile, but it does not award inventory quantities.
- The impact tree uses the same forest tree asset family as ordinary island trees. The crash scene does not create a second forest simulation or harvesting authority.
- The rescue log pile uses the standard `RawLog` presentation. Before allegiance those objects are story presentation so normal player pickup cannot bypass the rescue.
- At allegiance, `GatherableSystem` becomes the authority for the cleared Logs. From that point onward they are normal world pickups and there is no duplicate log authority.
- `SproutCompanionController` performs its existing collection behavior. The crash scene does not implement a special one-off compression system.
- `InventorySystem` remains the single shared InventorySystem for Ranger and Sprout. The crash scene never calls inventory add/consume directly.
- Terrain collision and terrain height remain authoritative. The crater is a presentation layer and does not create a competing terrain deformation system.

## Save and Continue

Dynamic `spawn-*` gatherables are already part of shared game-state persistence. The crash scene therefore releases the demonstration Logs through `GatherableSystem` rather than saving a parallel crash-resource record.

On an allied restore, the crash-site handoff checks for persisted dynamic Logs at the deterministic cleared positions before spawning anything. Active and already-compressed dynamic entries both remain represented in saved gatherable state, so Continue cannot recreate a second showcase pile after the original Logs were collected.

Before allegiance, the rescue pile remains deterministic story presentation reconstructed from the Sprout arrival phase. This keeps temporary cinematic state separate from persistent resource state.

## Non-goals

This pass does not change normal tree harvesting, tree-fall damage, terrain generation, ecology, wildlife, construction, Ranger controls, PWA behavior or general companion collection tuning. The crash scene reuses those established boundaries instead of duplicating them.