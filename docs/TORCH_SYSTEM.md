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
- The local torch light casts shadows from nearby opaque world geometry, including the Ranger and shadow-enabled forest tree batches. The Ranger is promoted to a local shadow caster only while the torch is burning, then restored to the normal celestial receiver-only policy when the torch is put away or expires.
- Torch fuel decreases only while `torch` is the equipped tool. Switching to another tool or the hand pauses the remaining burn time.
- A torch lasts **half of the configured night phase**. With the current 20:00–05:00 night, that is 270 in-game minutes (4.5 in-game hours). The duration is derived from `WORLD_TIME` rather than hard-coded to real seconds, so future day-length tuning preserves the half-night rule.
- When a torch expires, exactly one torch inventory unit is consumed. If another torch is available while the player is still holding the torch slot, the next unit takes over at full fuel. When the final torch expires, the tool belt falls back to the hand.
- The existing belt durability bar is reused as a fuel meter for the torch. The tool-belt model marks this meter as `fuel`, keeping the runtime state distinct from conventional durability.

## Architecture

`TorchRuntimeController` owns torch burn state, handheld presentation, fire flicker, light-follow smoothing, and the local light. It does **not** own an animation frame or gameplay wall-clock timer. `WorldTimeRuntime` fans the same authoritative `WorldTimeSystem` snapshot into both visual presentations (lighting/celestial systems) and gameplay time consumers. The torch therefore advances in game-time and cannot silently burn while the world clock is stopped or before the beach-arrival intro completes.

The handheld torch contains a dedicated flame anchor. Each runtime update resolves that anchor to world space. The point light follows that target through centralized `TORCH.light.follow` response, delta clamp, and snap-distance tuning instead of copying every small animated hand displacement directly. This remains the authoritative portable fire source: there is no competing forward cone, Ranger-root glow, or second motion system.

Flicker is deterministic and bounded. Three phase-offset waves produce the fire signal. The visible flame uses the raw signal for life, while illumination intensity and reach use a low-pass version controlled by `TORCH.light.flicker.smoothingResponse`. Base intensity, reach, frequency, variance and smoothing all live under `TORCH.light`, so the effect can be tuned without duplicating presentation constants in runtime code. The current softer baseline deliberately reduces intensity from the previous 72 to **58** and intensity variance from 18% to **8%**.

Torch shadows reuse the renderer shadow pipeline already owned by `CelestialShadowSystem`; the torch does not create a second renderer or shadow manager. The point light owns a small local shadow map with a softened local shadow radius. While the torch burns, `TorchRuntimeController` temporarily enables `castShadow` on the Ranger's render meshes, excluding the torch prop itself. Existing centralized shadow enrollment keeps static/chunked forest tree batches and ordinary opaque world meshes eligible as casters and receivers. Ranger caster flags are restored when the torch is no longer active.

The generic `RangerToolPresentation` intentionally ignores the `torch` identifier so it cannot create a competing prop. Torch presentation remains owned by `TorchRuntimeController`.

`SaveGameController` persists the active unit's remaining game minutes separately from ordinary equipment durability. Restore resets the torch runtime's previous-clock sample before the world clock resumes, preventing save/load or background time from being charged as burn time.

## Mobile performance and HUD

The torch retains one omnidirectional point light and one **256 × 256** point-light shadow map. Because point-light shadows render multiple cube faces, their refresh remains capped at **10 Hz** rather than updating every rendered frame. The smoother result comes from damping light movement and brightness, not from increasing the expensive shadow refresh rate. This preserves the established mobile rendering budget while reducing the apparent stepping caused by animated hand movement.

The global celestial shadow system remains unchanged: its directional map, tree enrollment, local coverage and refresh policy are still centrally owned. The Ranger remains receiver-only for the normal celestial policy; torch runtime promotion is temporary and scoped to the period in which a torch is actively burning.

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
- local point-light shadows are enabled with a 256px map and at most 10 Hz refresh;
- the Ranger temporarily casts while the torch burns and returns to the normal non-caster state when it is put away;
- centralized forest-tree batches remain eligible shadow casters;
- the eight-slot belt retains a narrow-screen layout contract.

## Device verification

After merge/deploy, verify on a physical phone that the eighth tool-belt slot remains comfortable to tap, the light visibly stays with the torch flame without visibly snapping on each walking step, illumination spreads naturally around the Ranger instead of forming a flashlight cone, and the softer brightness/flicker reads as fire rather than electronic pulsing. Also verify that Ranger/tree shadows remain acceptable while walking, the added smoothing does not create an obvious light trail during normal turning, the point-light shadow cost remains smooth on the target Android device, the night scene is not washed out, and first-person navigation remains readable while the handheld prop itself is hidden.
