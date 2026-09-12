# Day / Night Cycle

## Purpose

The game uses one authoritative world clock for player survival, future villager routines, wildlife schedules, farming, sleep, and other time-aware systems. Rendering consumes that clock but does not own gameplay time.

This preserves the architecture rule that player and NPC systems share one world concept rather than creating separate clocks or time-of-day logic.

## Baseline timing

The current tuning is intentionally simple and centralized in `src/data/WorldTimeDefinitions.js`:

- new game begins on **Day 1 at 08:00**;
- one full game day lasts **24 real minutes**;
- one real second therefore advances one in-game minute;
- dawn begins at **05:00**;
- daytime begins at **07:00**;
- dusk begins at **17:30**;
- night begins at **20:00**.

The beach-arrival cinematic does not consume the Day 1 survival clock. The clock begins when normal gameplay begins. These values are configuration, not hard-coded rules in gameplay systems, so later device/playtesting can tune pacing without replacing the architecture.

## System boundaries

- `WorldTimeDefinitions` is the single tuning source for clock scale, start time, phase boundaries, and frame-delta limits.
- `WorldTimeSystem` owns Day / time-of-day state, phase classification, progression, persistence state, and transition subscriptions.
- `WorldTimeRuntime` advances the clock using a small requestAnimationFrame lifecycle and fans each authoritative snapshot into registered time-driven presentation systems. It clamps resume/background deltas so minimizing the PWA does not skip hours of game time.
- `DayNightLightingSystem` is presentation only. It interpolates the existing `SceneSystem` sky, fog, hemisphere light, sun, sky fill, ambient fill, and tone-mapping exposure.
- `CelestialBodySystem` is presentation only. It renders the visible sun and moon from the same world-time snapshot without owning time or gameplay rules.
- `CelestialOrbit` is the shared orbital calculation used by both the visible sun/moon and directional sunlight, preventing two competing notions of where the sun is.
- `CelestialDefinitions` centralizes orbital distance, sky-path orientation, disc size, halo values, and horizon fading.
- `SceneSystem` still owns the actual Three.js scene, camera, and lighting objects. Day/night does not create a competing lighting rig.
- `SaveGameController` captures/restores world time alongside the existing shared save state. Compatible saves created before this feature simply fall back to Day 1 at 08:00.

## Sun and moon sky clock

The celestial bodies provide a readable environmental clock without adding a HUD requirement:

- the **sun rises at approximately 06:00**;
- it reaches its highest point around **12:00**;
- it sets at approximately **18:00**;
- the **moon is exactly opposite the sun** on the same sky cycle and is highest around **00:00**;
- sunrise and moonset occur on opposite horizons, as do sunset and moonrise;
- dawn lighting starts before the visible sunrise and dusk lighting continues after sunset so transitions remain natural rather than snapping with the discs.

The sky path is intentionally stable and predictable. Seasonal sun-angle changes, moon phases, eclipses, astronomical simulation, and calendar latitude are not part of the current survival-loop requirement.

The bodies are positioned relative to the moving camera at a fixed sky distance so they do not drift toward the island as the Ranger travels. Their direction remains world-consistent, so the sun crosses the same side of the sky every day. Low bodies keep depth testing enabled, allowing mountains, terrain, trees, and structures to occlude them naturally near the horizon.

## Mobile rendering policy

Lighting transitions continuously through night, dawn, day, and dusk. Night remains dark enough to read as night but retains cool hemisphere/sky fill so mobile gameplay is not reduced to a black screen.

The sun and moon use small procedural Three.js sphere meshes and lightweight basic materials. They require no downloaded textures, shadow maps, volumetric atmosphere, post-processing, or additional animation loop. Their glow is a low-cost transparent halo and they reuse the existing world-time runtime frame.

Dynamic shadows remain disabled.

## Integration contract for later systems

Gameplay systems that need time should read or subscribe to `game.worldTime`; they should not infer time from sun position, moon position, sky colors, renderer values, or their own timers. Phase changes are observable through `WorldTimeSystem.subscribe()` without coupling the clock to HUD, NPC, wildlife, or survival implementations.

The celestial bodies are therefore a player-facing time cue, not gameplay authority.

The current cycle deliberately does **not** change animal behavior, villager behavior, hunger, damage, campfire rules, or tutorial progression.

## Planned Day 1 continuation

The existing design still calls for the first night to unlock sleeping near a valid active campfire and advance to morning. That sleep interaction should use this shared clock when implemented rather than adding a separate Day 1 timer.

## Verification

`scripts/verify-day-night-cycle.mjs` protects:

- the Day 1 start time and 24-minute baseline;
- phase boundaries and day rollover;
- observable phase transitions;
- save/restore and backward-compatible missing-time behavior;
- visibly darker but playable night lighting;
- sun horizon positions, midday height, moon midnight height, and sun/moon opposition;
- shared orbit authority between visible sunlight direction and the celestial presentation;
- camera-relative fixed sky distance and horizon occlusion policy;
- runtime fan-out to both lighting and celestial presentation without a second clock or frame loop;
- boot ownership, existing-light reuse, persistence wiring, and inclusion in the full `npm run check` suite.
