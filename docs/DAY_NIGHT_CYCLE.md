# Day / Night Cycle

## Purpose

The game uses one authoritative world clock for player survival, future villager routines, wildlife schedules, farming, sleep, and other time-aware systems. Rendering consumes that clock but does not own gameplay time.

This preserves the architecture rule that player and NPC systems share one world concept rather than creating separate clocks or time-of-day logic.

## Baseline timing

The current tuning is intentionally simple and centralized in `src/data/WorldTimeDefinitions.js`:

- a new shipwreck game begins on **Day 1 at 22:00**, preserving the night established by the title voyage and making Sprout's blue crash glow readable against the dark island;
- legacy saves created before world-time persistence that have no clock state still fall back to **Day 1 at 08:00** for compatibility;
- one full game day lasts **24 real minutes**;
- one real second therefore advances one in-game minute;
- dawn begins at **05:00**;
- daytime begins at **07:00**;
- dusk begins at **17:30**;
- night begins at **20:00**.

The beach-arrival cinematic does not consume the Day 1 survival clock. The gameplay world's lighting is synchronized to the 22:00 narrative start before the title transition is released, but the clock itself begins advancing only when normal gameplay begins after the beach-arrival cinematic. These values are configuration, not hard-coded rules in gameplay systems, so later device/playtesting can tune pacing without replacing the architecture.

## System boundaries

- `WorldTimeDefinitions` is the single tuning source for clock scale, new-game start time, legacy-save fallback time, phase boundaries, and frame-delta limits.
- `WorldTimeSystem` owns Day / time-of-day state, phase classification, progression, persistence state, and transition subscriptions.
- `WorldTimeRuntime` advances the clock using a small requestAnimationFrame lifecycle and fans each authoritative snapshot into registered time-driven presentation systems. It clamps resume/background deltas so minimizing the PWA does not skip hours of game time.
- `DayNightLightingSystem` is presentation only. It interpolates the existing `SceneSystem` sky, fog, hemisphere light, shared celestial key light, sky fill, ambient fill, and tone-mapping exposure.
- `CelestialBodySystem` is presentation only. It renders the visible sun and moon from the same world-time snapshot without owning time or gameplay rules.
- `CelestialOrbit` is the shared orbital calculation used by the visible sun/moon and the directional key light, preventing competing notions of where the sun or moon is.
- `CelestialShadowSystem` owns the baseline mobile shadow budget, caster/receiver policy, and the Ranger's lightweight contact shadow. It reuses the existing celestial directional light rather than creating a second celestial shadow-casting light.
- `TorchRuntimeController` owns the optional handheld fire point light and its tightly bounded local shadow map while a torch is active. It reuses the renderer shadow pipeline and existing centralized caster enrollment instead of creating a competing world-shadow system.
- `CelestialDefinitions` centralizes orbital distance, sky-path orientation, disc size, halo values, and horizon fading.
- `CelestialShadowDefinitions` centralizes shadow-map resolution, local coverage, refresh rate, camera range, and bias tuning.
- `SceneSystem` still owns the actual Three.js scene, camera, and lighting objects.
- `SaveGameController` captures/restores world time alongside the existing shared save state. A valid saved clock always wins on Continue; compatible saves created before world-time persistence explicitly use the 08:00 legacy fallback instead of inheriting the new 22:00 story start.

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

The baseline mobile celestial shadow budget remains deliberately conservative:

- one **512 × 512 PCFSoft** directional shadow map;
- one shadow-casting celestial directional light only;
- approximately **56 m × 56 m** local orthographic coverage around the Ranger;
- celestial shadow-map redraw capped at **10 Hz**, while normal rendering may continue faster;
- opaque gameplay/building meshes automatically cast and receive shadows;
- terrain receives shadows;
- the animated Ranger is **receiver-only by default** in the throttled celestial map and uses a small transparent contact shadow that follows the walkable surface every presentation frame;
- while an equipped torch is burning, its runtime temporarily promotes Ranger render meshes to `castShadow` so the local fire can produce a Ranger silhouette; those flags are restored when the torch is put away or expires;
- static forest tree instancing remains shadow-capable before and after world chunk splitting: pre-split `forest-tree-batch-*` meshes and runtime `chunkedTreeBatch` / `forest-tree-chunk-*` meshes cast and receive shadows;
- lightweight instanced understory, grass/fern presentation, transparent water, build previews, celestial visuals, smoke/flame/spark effects, trails, and distant mountains stay out of the shadow pass.

The PCFSoft filter deliberately softens the sampled edge of tree and building shadows while preserving the existing 512px map, 56m local coverage, one-celestial-light architecture, and 10 Hz redraw ceiling. This addresses visibly blocky/pixelated shadow borders without increasing the directional shadow-map resolution or adding another celestial render pass.

The Ranger contact shadow deliberately replaces a full animated Ranger caster in the ordinary throttled celestial map. This prevents a 10 Hz sun/moon silhouette from visibly trailing a character that is rendered and moved every frame, while keeping the character's standard materials fully responsive to the day/night rig and local torch light. The active-torch exception is scoped to the period in which a local fire shadow is explicitly required.

Forest trees are a bounded exception to the generic instanced-vegetation exclusion. They remain static and are split into chunk-local `InstancedMesh` batches for world streaming. Those runtime chunks retain a semantic `chunkedTreeBatch` marker, allowing the centralized shadow policy to keep them in the low-frequency celestial pass and make the same caster flags available to the torch without turning 540 trees into hundreds of separate draw calls. Small understory remains excluded. Player-built structures continue through the normal opaque-mesh policy, so their standard materials receive the same celestial and torch lighting without construction-specific shadow logic.

## Mobile rendering policy

Lighting transitions continuously through night, dawn, day, and dusk. Night remains dark enough to read as night but retains cool hemisphere/sky fill so mobile gameplay is not reduced to a black screen.

The sun and moon use small procedural Three.js sphere meshes and lightweight basic materials. They require no downloaded textures, volumetric atmosphere, post-processing, or additional animation loop. Their glow is a low-cost transparent halo and they reuse the existing world-time runtime frame.

Baseline dynamic shadows remain bounded by `CelestialShadowSystem`: the renderer does not continuously redraw a full-island shadow map. The Ranger's contact shadow is two tiny transparent discs and does not require a shadow-map redraw, so ordinary movement stays visually smooth while the expensive celestial map remains capped at 10 Hz.

The handheld torch is a deliberate temporary exception because fire must radiate around the flame and cast local Ranger/tree silhouettes. It uses one `PointLight`, a **256 × 256** local point-light shadow map, and a **10 Hz maximum** shadow refresh while equipped. The point light and visible flame flicker every presentation update, but shadow-map refresh remains bounded; putting the torch away disables the source and restores the Ranger's normal receiver-only caster state. No second animation loop, world clock, renderer, or independent tree-shadow policy is introduced.

## Integration contract for later systems

Gameplay systems that need time should read or subscribe to `game.worldTime`; they should not infer time from sun position, moon position, sky colors, renderer values, or their own timers. Phase changes are observable through `WorldTimeSystem.subscribe()` without coupling the clock to HUD, NPC, wildlife, or survival implementations.

The celestial bodies are therefore a player-facing time cue, not gameplay authority.

Construction and world systems do not need shadow-specific logic for ordinary opaque meshes. `CelestialShadowSystem` periodically discovers newly added scene meshes and applies the centralized rendering policy. Static forest tree batches are recognized centrally from either the pre-split `forest-tree-batch-*` identity or the world-streaming `chunkedTreeBatch` semantic marker, with the `forest-tree-chunk-*` name retained as a compatibility fallback; other instanced/effect presentation remains outside the expensive caster path. Portable lights should consume those established caster flags rather than maintaining their own competing world-object registry.

The current cycle deliberately does **not** change animal behavior, villager behavior, hunger, damage, campfire rules, or tutorial progression.

## Planned Day 1 continuation

The existing design still calls for the first night to unlock sleeping near a valid active campfire and advance to morning. That sleep interaction should use this shared clock when implemented rather than adding a separate Day 1 timer.

## Verification

`scripts/verify-day-night-cycle.mjs` protects:

- the Day 1 22:00 narrative start, explicit 08:00 legacy-save fallback, and 24-minute baseline;
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

- the 512px celestial map, local camera extent, and 10 Hz refresh ceiling;
- PCFSoft shadow filtering and disabled per-frame auto-update;
- exactly one shadow-casting celestial key light;
- sun direction by day and moon direction at night;
- Ranger-relative key-light targeting;
- opaque building/dynamic receiver enrollment;
- receiver-only default animated Ranger policy plus per-frame ground-following contact shadow;
- pre-split and runtime chunked forest-tree caster/receiver enrollment while understory stays excluded;
- the `WorldChunkSystem` semantic tree-batch marker consumed by the centralized shadow policy;
- transparent/effect exclusions;
- delayed discovery of newly built meshes without construction-system coupling;
- boot wiring and inclusion in the full repository check suite.

`scripts/verify-torch-system.mjs` separately protects the active-torch exception: omnidirectional flame-anchored point lighting, bounded fire flicker, the 256px/10 Hz local shadow budget, temporary Ranger caster promotion/restoration, and continued use of centralized forest-tree caster enrollment.
