# Sprout crash scene

## Purpose

The Sprout crash site is the first gameplay handoff from the voyage opening into the companion loop. It must read as an actual high-energy impact in the island world rather than a temporary demo prop, while preserving the existing story, resource, save, terrain and companion authorities.

## Current sequence

1. After the Ranger finishes the beach-recovery introduction, the blue incoming object descends toward a deterministic collision-safe inland site.
2. The title shooting star and gameplay descent use the same centrally authored X/Z approach direction from `SproutArrivalDefinitions`. The title scene remains an unresolved sighting; gameplay continues the same travel direction rather than reversing it.
3. A standing tree is presented from the same forest tree asset family used by the island environment.
4. The incoming pod accelerates hard through the final descent. The title sighting and gameplay continuation share the same procedural falling-star trail presentation: a compact cyan-white head, broad luminous blue/cyan plume that tapers away behind the head, narrow cyan/violet light streaks and sparse glowing particles. The reference image is visual direction only; no external or watermarked artwork is shipped as a runtime asset.
5. During the final gameplay descent, `SproutImpactCinematicEffects` follows the authoritative incoming-object position with one local cyan spotlight. The light casts moving tree/environment shadows through the existing `CelestialShadowSystem` caster policy and shared renderer shadow gate. Its map is fixed at 512 px and its moving-shadow refresh is capped at 10 Hz so the brief cinematic does not introduce a second continuous shadow pipeline.
6. The pod strikes through the tree. The standing tree presentation disappears at impact and the result is a broken stump plus four standard RawLog presentations piled over Sprout.
7. Impact contact produces a short cyan flash/shockwave, a deterministic outward dust burst and a brief decaying camera impulse. The shake is applied only for rendering and the authored gameplay/cinematic camera transform is restored immediately afterward, so impact feedback cannot accumulate into camera state.
8. The final site contains a visibly bowl-shaped scorched crater, raised irregular rim, directional scours/ejecta, detached scout-pod debris and a ruptured multi-part wreck.
9. The crash footprint suppresses grass, ferns and static ground-cover presentation inside the crater. This is a visual exclusion only; authoritative terrain height and collision are unchanged.
10. The damaged scout pod retains its cream shell, green armor and orange safety language, but now includes a charred hull breach, exposed cyan core, cracked canopy, bent plates, a damaged engine/thruster and detached debris so it cannot read as an intact parked craft.
11. The impact-log pile is the rescue obstruction. The Ranger uses the existing FREE action/cinematic interaction to move the individual logs away from Sprout.
12. Sprout reboots and the existing dialogue completes. The final line explicitly cues Sprout to demonstrate what he can do with the cleared logs.
13. When allegiance becomes active, the cleared log positions are handed to `GatherableSystem` as ordinary loose Log pickups. The crash-site-only rescue presentations are hidden.
14. The existing `SproutCompanionController` sees those legitimate loose Logs, approaches them and performs the normal visible compression/reservation/commit transaction into the single shared `InventorySystem`.

## Impact visual reference

The crater presentation follows broad features visible in fresh impact-crater references rather than copying one real crater literally. NASA/JPL fresh-crater imagery shows a simple bowl/depression with a raised rim, a continuous disturbed zone near the crater and progressively more discontinuous ejecta farther away. NASA examples also show that low/oblique impacts can leave asymmetric rays, gaps and directional ejecta patterns. Barringer/Meteor Crater imagery is useful for the readable combination of a steep bowl, raised rim and jumbled blocks.

For Sprout, the incoming object is a spacecraft rather than a natural meteor and the scale is deliberately compressed for gameplay readability. The scene therefore uses an elliptical visual bowl, irregular rim clods, forward-biased ejecta and detached mechanical debris. The ground scours are a separate approach-path cue: because the pod moves into the crater along the authored approach vector, those scar streaks extend backward from the crater along the inverse of that vector. This keeps the crater scar visually aligned with the direction the falling star actually came from instead of pointing to the opposite side. These features are presentation cues, not a physical simulation of a meteor strike.

`FallingStarTrailVisual` is the single presentation helper for both the title sighting and gameplay descent. It owns the tapered additive plume, secondary light streaks and spark particles, while the title and gameplay systems continue to own their own positions, timing, lights and impact-specific effects. This keeps the visual language consistent without creating a second trajectory authority.

`SproutImpactCinematicEffects` is the gameplay-only transient effects boundary for the final descent and contact beat. It consumes `SproutCrashSiteSystem.incoming.position`; it does not calculate or own a second flight path. Its spotlight is deliberately a `SpotLight` rather than a shadow-casting point light because a point light would require six shadow-map faces. Dust uses a small deterministic `Points` burst and is disposed with the controller.

## Authority boundaries

- `SproutArrivalController` remains the story/phase authority. It owns impact timing, investigation, rescue, dialogue and allegiance. It starts/stops cinematic presentation effects at phase boundaries.
- `SproutArrivalDefinitions` owns the shared Sprout entry direction and the centrally tuned impact-light, dust and camera-shake values. Scene-specific start/end positions remain local presentation concerns.
- `SproutCrashSiteSystem` owns the authoritative gameplay incoming-object position plus crash-site presentation and temporary rescue collision. It may stage the pre-allegiance log pile, but it does not award inventory quantities.
- `SproutImpactCinematicEffects` consumes the crash-site position for temporary light/dust/camera feedback only. It does not alter terrain, collision, world state, story state or the trajectory.
- `CelestialShadowSystem` remains the single gameplay shadow-map policy/gate. The falling-star effect requests bounded refreshes from it rather than enabling a competing renderer shadow system.
- `SceneSystem` owns the generic camera-shake primitive. The shake is a render-time offset restored after every frame and does not become movement/camera authority.
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

If a save is restored during the impact phase, the established impact sequence is reconstructed from its deterministic phase state. The transient falling-star light is restarted from the crash-site incoming presentation; dust and camera shake are not persisted as gameplay state.

## Mobile constraints

The descent adds exactly one shadow-casting spotlight and only while the approximately 2.15-second impact phase is active. The spotlight uses one 512 px shadow map, reuses the established shadow caster/receiver policy, and requests updates at no more than 10 Hz. It does not enable a second renderer or post-processing pass. The existing non-shadow-casting point light remains responsible for the broad blue illumination while the spotlight supplies directional moving shadows.

The impact dust is a fixed small `Points` buffer with deterministic motion and a sub-two-second lifetime. Camera shake is a short mathematical render offset and allocates no per-frame objects.

## Non-goals

This pass does not change normal tree harvesting, tree-fall damage, terrain generation, terrain collision, wildlife, construction, Ranger controls, PWA behavior or general companion collection tuning. The crash scene reuses those established boundaries instead of duplicating them.
