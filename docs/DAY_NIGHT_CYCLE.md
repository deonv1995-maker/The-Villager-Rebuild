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
- `DayNightLightingSystem` is presentation only. It interpolates the existing `SceneSystem` sky, fog, hemisphere light, shared celestial key light, sky fill, ambient fill, and tone-mapping exposure.
- `CelestialBodySystem` is presentation only. It renders the visible sun and moon from the same world-time snapshot without owning time or gameplay rules.
- `CelestialOrbit` is the shared orbital calculation used by the visible sun/moon and the directional key light, preventing competing notions of where the sun or moon is.
- `CelestialShadowSystem` owns the mobile shadow budget, caster/receiver policy, and the Ranger's lightweight contact shadow. It reuses the existing celestial directional light rather than creating a second shadow-casting light.
- `CelestialDefinitions` centralizes orbital distance, sky-path orientation, disc size, halo values, and horizon fading.
- `CelestialShadowDefinitions` centralizes shadow-map resolution, local coverage, refresh rate, camera range, and bias tuning.
- `SceneSystem` still owns the actual Three.js scene, camera, and lighting objects.
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

## Celestial light and shadows

The existing directional `sun` light is the shared celestial key light for rendering compatibility. During daylight it follows the visible sun. Once the sun moves below the horizon, the same light flips to the moon direction and retains the cool, low-intensity night values from the lighting curve. This gives sun and moon lighting consistent shadow direction without paying for two directional shadow maps.

The light and its target are translated around the Ranger while preserving the orbital direction. This keeps the useful shadow camera local to gameplay rather than covering the entire expanded island.

The mobile shadow budget remains deliberately conservative:

- one **512 × 512 PCF** shadow map;
- one shadow-casting directional light only;
- approximately **56 m × 56 m** local orthographic coverage around the Ranger;
- shadow-map redraw capped at **10 Hz**, while normal rendering may continue faster;
- opaque gameplay/building meshes automatically cast and receive shadows;
- terrain receives shadows;
- the animated Ranger is **receiver-only** in the throttled global map and uses a small transparent contact shadow that follows the walkable surface every presentation frame;
- the existing static `forest-tree-batch-*` instanced meshes cast and receive celestial shadows while preserving the forest batching architecture;
- lightweight instanced understory, grass/fern presentation, transparent water, build previews, celestial visuals, smoke/flame/spark effects, trails, and distant mountains stay out of the shadow pass.

The Ranger contact shadow deliberately replaces a full animated Ranger caster in the throttled map. This prevents a 10 Hz shadow silhouette from visibly trailing a character that is rendered and moved every frame, while keeping the character's standard materials fully responsive to the day/night rig and local torch light.

Forest trees are a bounded exception to the generic instanced-vegetation exclusion. They remain static, are already grouped into a small number of `InstancedMesh` batches, and therefore can participate in the low-frequency celestial shadow pass without turning 540 trees into hundreds of separate draw calls. Small understory remains excluded. Player-built structures continue through the normal opaque-mesh policy, so their standard materials receive the same celestial and torch lighting without construction-specific shadow logic.

## Mobile rendering policy

Lighting transitions continuously through night, dawn, day, and dusk. Night remains dark enough to read as night but retains cool hemisphere/sky fill so mobile gameplay is not reduced to a black screen.

The sun and moon use small procedural Three.js sphere meshes and lightweight basic materials. They require no downloaded textures, volumetric atmosphere, post-processing, or additional animation loop. Their glow is a low-cost transparent halo and they reuse the existing world-time runtime frame.

Dynamic shadows are enabled only through the bounded celestial shadow system described above. The renderer does not continuously redraw a full-island shadow map. The Ranger's contact shadow is two tiny transparent discs and does not require a shadow-map redraw, so normal movement stays visually smooth while the expensive map remains capped at 10 Hz.

The handheld torch remains one local spotlight with local shadow casting disabled for mobile performance. Trees, buildings, and the Ranger use lit materials, so surfaces still brighten and shade according to the torch direction and falloff even though the torch does not create a second dynamic shadow map.

## Integration contract for later systems

Gameplay systems that need time should read or subscribe to `game.worldTime`; they should not infer time from sun position, moon position, sky colors, renderer values, or their own timers. Phase changes are observable through `WorldTimeSystem.subscribe()` without coupling the clock to HUD, NPC, wildlife, or survival implementations.

The celestial bodies are therefore a player-facing time cue, not gameplay authority.

Construction and world systems do not need shadow-specific logic for ordinary opaque meshes. `CelestialShadowSystem` periodically discovers newly added scene meshes and applies the centralized rendering policy. Static forest tree batches are recognized centrally by their established `forest-tree-batch-*` presentation names; other instanced/effect presentation remains outside the expensive caster path.

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
- shared orbit authority between visible celestial bodies and directional lighting;
- camera-relative fixed sky distance and horizon occlusion policy;
- runtime fan-out without a second clock or frame loop;
- boot ownership, existing-light reuse, persistence wiring, and inclusion in the full `npm run check` suite.

`scripts/verify-celestial-shadows.mjs` protects:

- the 512px map, local camera extent, and 10 Hz refresh ceiling;
- PCF shadow type and disabled per-frame auto-update;
- exactly one shadow-casting celestial key light;
- sun direction by day and moon direction at night;
- Ranger-relative key-light targeting;
- opaque building/dynamic receiver enrollment;
- receiver-only animated Ranger policy plus per-frame ground-following contact shadow;
- static instanced forest-tree caster/receiver enrollment while understory stays excluded;
- transparent/effect exclusions;
- delayed discovery of newly built meshes without construction-system coupling;
- boot wiring and inclusion in the full repository check suite.
