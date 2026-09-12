# Sprout crash scene

## Purpose

The Sprout crash site is the first gameplay handoff from the voyage opening into the companion loop. It must read as an actual high-energy impact in the island world rather than a temporary demo prop, while preserving the existing story, resource, save, terrain and companion authorities.

## Current sequence

1. After the Ranger finishes the beach-recovery introduction, the blue incoming object descends toward a deterministic collision-safe inland site.
2. The title shooting star and gameplay descent use the same centrally authored X/Z approach direction from `SproutArrivalDefinitions`. The title scene remains an unresolved sighting; gameplay continues the same travel direction rather than reversing it.
3. A standing tree is presented from the same forest tree asset family used by the island environment.
4. The incoming pod accelerates hard through the final descent, carries a cyan plasma tail, and strikes through the tree. The standing tree presentation disappears at impact and the result is a broken stump plus four standard RawLog presentations piled over Sprout.
5. Impact contact produces a short cyan flash/shockwave. The final site contains a visibly bowl-shaped scorched crater, raised irregular rim, directional scours/ejecta, detached scout-pod debris and a ruptured multi-part wreck.
6. The crash footprint suppresses grass, ferns and static ground-cover presentation inside the crater. This is a visual exclusion only; authoritative terrain height and collision are unchanged.
7. The damaged scout pod retains its cream shell, green armor and orange safety language, but now includes a charred hull breach, exposed cyan core, cracked canopy, bent plates, a damaged engine/thruster and detached debris so it cannot read as an intact parked craft.
8. The impact-log pile is the rescue obstruction. The Ranger uses the existing FREE action/cinematic interaction to move the individual logs away from Sprout.
9. Sprout reboots and the existing dialogue completes. The final line explicitly cues Sprout to demonstrate what he can do with the cleared logs.
10. When allegiance becomes active, the cleared log positions are handed to `GatherableSystem` as ordinary loose Log pickups. The crash-site-only rescue presentations are hidden.
11. The existing `SproutCompanionController` sees those legitimate loose Logs, approaches them and performs the normal visible compression/reservation/commit transaction into the single shared `InventorySystem`.

## Impact visual reference

The crater presentation follows broad features visible in fresh impact-crater references rather than copying one real crater literally. NASA/JPL fresh-crater imagery shows a simple bowl/depression with a raised rim, a continuous disturbed zone near the crater and progressively more discontinuous ejecta farther away. NASA examples also show that low/oblique impacts can leave asymmetric rays, gaps and directional ejecta patterns. Barringer/Meteor Crater imagery is useful for the readable combination of a steep bowl, raised rim and jumbled blocks.

For Sprout, the incoming object is a spacecraft rather than a natural meteor and the scale is deliberately compressed for gameplay readability. The scene therefore uses an elliptical visual bowl, irregular rim clods, forward-biased ejecta/scours and detached mechanical debris. These features are presentation cues, not a physical simulation of a meteor strike.

## Authority boundaries

- `SproutArrivalController` remains the story/phase authority. It owns impact timing, investigation, rescue, dialogue and allegiance.
- `SproutArrivalDefinitions` owns the shared Sprout entry direction used by the title celestial event and the gameplay descent. Scene-specific start/end positions remain local presentation concerns.
- `SproutCrashSiteSystem` owns only crash-site presentation and temporary rescue collision. It may stage the pre-allegiance log pile, but it does not award inventory quantities.
- `TestIslandSystem` owns a small presentation-exclusion registry used to hide vegetation under authored world presentation. `GrassFieldSystem`, `FernFieldSystem` and `GroundCoverPresentationSystem` consume those zones without changing terrain or collision authority.
- The impact tree uses the same forest tree asset family as ordinary island trees. The crash scene does not create a second forest simulation or harvesting authority.
- The rescue log pile uses the standard `RawLog` presentation. Before allegiance those objects are story presentation so normal player pickup cannot bypass the rescue.
- At allegiance, `GatherableSystem` becomes the authority for the cleared Logs. From that point onward they are normal world pickups and there is no duplicate log authority.
- `SproutCompanionController` performs its existing collection behavior. The crash scene does not implement a special one-off compression system.
- `InventorySystem` remains the single shared InventorySystem for Ranger and Sprout. The crash scene never calls inventory add/consume directly.
- Terrain collision and terrain height remain authoritative. The crater is a presentation layer and does not create a competing terrain deformation system.

## Save and Continue

Dynamic `spawn-*` gatherables are already part of shared game-state persistence. The crash scene therefore releases the demonstration Logs through `GatherableSystem` rather than saving a parallel crash-resource record.

On an allied restore, the crash-site handoff checks for persisted dynamic Logs at the deterministic cleared positions before spawning anything. Active and already-compressed dynamic entries both remain represented in saved gatherable state, so Continue cannot recreate a second showcase pile after the original Logs were collected.

Before allegiance, the rescue pile remains deterministic story presentation reconstructed from the Sprout arrival phase. This keeps temporary cinematic state separate from persistent resource state. A restored crashed state also reapplies the crater vegetation-exclusion zone so Continue cannot repopulate grass inside the impact scar.

## Non-goals

This pass does not change normal tree harvesting, tree-fall damage, terrain generation, terrain collision, wildlife, construction, Ranger controls, PWA behavior or general companion collection tuning. The crash scene reuses those established boundaries instead of duplicating them.