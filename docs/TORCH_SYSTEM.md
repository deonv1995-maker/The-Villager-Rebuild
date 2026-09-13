# Crafted Torch System

## Scope

The torch is the first portable night-navigation item layered onto the shared day/night clock. It is deliberately isolated from ordinary tool durability: axes, hammers, pickaxes, shovels, spears and swords keep their established per-use durability behavior, while a torch consumes time only while it is actively held.

## Gameplay contract

- The torch is crafted from **1 Stick + 2 Grass**.
- Crafted torches are inventory-backed and occupy a normal tool-belt slot.
- Equipping a torch shows a simple handheld torch prop in third-person view and creates a warm local light whose origin follows the flame itself rather than the Ranger root.
- Torch illumination radiates in **all directions** from the flame. A burning torch is a local fire source, not a forward-facing flashlight or modern spotlight.
- The flame visibly flutters while held, while emitted light intensity/reach use a damped version of the same bounded fire signal so the environment does not pulse harshly.
- The light position follows the animated flame anchor through a short exponential presentation damper. This removes frame-to-frame hand-bob jitter from the illuminated world while still keeping the source visually attached to the handheld torch. Large discontinuities snap immediately so teleports/restores do not create a trailing light.
- The local torch light casts softened shadows from nearby opaque world geometry, including the Ranger and shadow-enabled forest tree batches. Torch shadow opacity is intentionally below full strength so nearby occlusion reads naturally instead of becoming a hard black cutout. The Ranger is promoted to a local shadow caster only while the torch is burning, then restored to the normal celestial receiver-only policy when the torch is put away or expires.
- Torch fuel decreases only while `torch` is the equipped tool. Switching to another tool or the hand pauses the remaining burn time.
- A torch lasts **half of the configured night phase**. With the current 20:00–05:00 night, that is 270 in-game minutes (4.5 in-game hours). The duration is derived from `WORLD_TIME` rather than hard-coded to real seconds, so future day-length tuning preserves the half-night rule.
- When a torch expires, exactly one torch inventory unit is consumed. If another torch is available while the player is still holding the torch slot, the next unit takes over at full fuel. When the final torch expires, the tool belt falls back to the hand.
- The existing belt durability bar is reused as a fuel meter for the torch. The tool-belt model marks this meter as `fuel`, keeping the runtime state distinct from conventional durability.

## Architecture

`TorchRuntimeController` owns torch burn state, handheld presentation, fire flicker, light-follow smoothing, and the local light. It does **not** own an animation frame or gameplay wall-clock timer. `WorldTimeRuntime` fans the same authoritative `WorldTimeSystem` snapshot into both visual presentations (lighting/celestial systems) and gameplay time consumers. The torch therefore advances in game-time and cannot silently burn while the world clock is stopped or before the beach-arrival intro completes.

The handheld torch contains a dedicated flame anchor. Each runtime update resolves that anchor to world space. The point light follows that target through centralized `TORCH.light.follow` response, delta clamp, and snap-distance tuning instead of copying every small animated hand displacement directly. This remains the authoritative portable fire source: there is no competing forward cone, Ranger-root glow, or second motion system.

Flicker is deterministic and bounded. Three phase-offset waves produce the fire signal. The visible flame uses the raw signal for life, while illumination intensity and reach use a low-pass version controlled by `TORCH.light.flicker.smoothingResponse`. Base intensity, reach, frequency, variance and smoothing all live under `TORCH.light`, so the effect can be tuned without duplicating presentation constants in runtime code. The current softer baseline keeps intensity at **58** and emitted-light intensity variance at **8%**.

Torch shadows reuse the renderer shadow pipeline already owned by `CelestialShadowSystem`; the torch does not create a second renderer or shadow manager. The shared renderer uses `PCFSoftShadowMap`. Under Three.js r180, `LightShadow.radius` does not provide the intended softness with this renderer mode, so torch softness is controlled by the local shadow-map resolution and shadow intensity instead of relying on a misleading radius tuning value.

The torch now owns a **128 × 128** point-light shadow map with shadow intensity **0.72** and a bounded **30 Hz** refresh cadence. The lower map resolution broadens the PCF-soft edge while the higher temporal cadence reduces visible stepping as the handheld source moves. These values remain centralized under `TORCH.light.shadow`.

The renderer remains globally gated with `shadowMap.autoUpdate = false`, while both the celestial key light and torch opt into explicit per-light invalidation through `LightShadow.autoUpdate = false` and `LightShadow.needsUpdate`. A torch refresh therefore invalidates the torch shadow plus the shared renderer gate without forcing the 512px celestial shadow map to redraw at torch cadence. The celestial system keeps its established 10 Hz refresh contract.

While the torch burns, `TorchRuntimeController` temporarily enables `castShadow` on the Ranger's render meshes, excluding the torch prop itself. Existing centralized shadow enrollment keeps static/chunked forest tree batches and ordinary opaque world meshes eligible as casters and receivers. Ranger caster flags are restored when the torch is no longer active.

The generic `RangerToolPresentation` intentionally ignores the `torch` identifier so it cannot create a competing prop. Torch presentation remains owned by `TorchRuntimeController`.

`SaveGameController` persists the active unit's remaining game minutes separately from ordinary equipment durability. Restore resets the torch runtime's previous-clock sample before the world clock resumes, preventing save/load or background time from being charged as burn time.

## Mobile performance and HUD

The torch retains one omnidirectional point light and one local point-light shadow map. The previous configuration used a 256px map at 10 Hz; the current configuration uses a 128px map at 30 Hz. Because shadow-map work scales with map area, the centralized `mapSize² × refreshHz` guard remains below the previous local-shadow budget even though temporal refresh is three times faster. This intentionally trades excess spatial sharpness for softer edges and smoother motion on mobile.

The 512px celestial shadow map remains independently capped at 10 Hz through per-light invalidation, so improving the moving torch shadow does not multiply the sun/moon shadow workload. The Ranger remains receiver-only for the normal celestial policy; torch runtime promotion is temporary and scoped to the period in which a torch is actively burning.

The current crafting menu reuses the existing campfire fire glyph for the torch recipe, while the belt uses the approved dedicated torch artwork. The eight-slot belt retains the narrow-screen sizing rule so the full belt remains inside the viewport on small mobile widths.

## Regression coverage

`scripts/verify-torch-system.mjs` protects the following contracts:

- half-night duration remains derived from configured night boundaries;
- primitive recipe and tool-belt registration remain intact;
- fuel advances only while held;
- one unit is consumed at expiry and spare torches roll over cleanly;
- the belt meter reports fuel percentage;
- partial fuel persists across save/restore without offline burn;
- the torch uses the shared world-time runtime rather than a second timer loop;
- the local light is a flame-anchored omnidirectional `PointLight`;
- intensity/reach/flame flutter remains bounded by centralized tuning;
- local point-light shadows remain soft, partially transparent, and within the previous mobile map-size × refresh-rate work budget;
- local torch refresh uses per-light invalidation at 24–30 Hz rather than forcing the celestial map to the same cadence;
- the Ranger temporarily casts while the torch burns and returns to the normal non-caster state when it is put away;
- centralized forest-tree batches remain eligible shadow casters;
- the eight-slot belt retains a narrow-screen layout contract.

`scripts/verify-celestial-shadows.mjs` also protects the complementary renderer contract: the celestial key light is explicitly invalidated per light and remains on its established 512px / 10 Hz policy.

## Device verification

After merge/deploy, verify on a physical phone that the eighth tool-belt slot remains comfortable to tap, the light visibly stays with the torch flame without visibly snapping on each walking step, illumination spreads naturally around the Ranger instead of forming a flashlight cone, and the softer brightness/flicker reads as fire rather than electronic pulsing.

For the shadow refinement specifically, walk and turn near the Ranger, trees, building walls and uneven terrain at night. Confirm that torch-cast shadows are visibly lighter, their edges read softer rather than hard-cut, and motion no longer advances in obvious 10 Hz steps. Also verify that no shadow acne, detached shadow trails, or distracting low-resolution blocks appear at normal phone viewing distance, that the point-light shadow cost remains smooth on the target Android device, that the night scene is not washed out, and that first-person navigation remains readable while the handheld prop itself is hidden.
