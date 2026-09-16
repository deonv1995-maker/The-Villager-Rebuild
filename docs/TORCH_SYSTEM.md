# Crafted Torch System

## Scope

The torch is the first portable and placeable night-lighting item layered onto the shared day/night clock. It remains deliberately isolated from ordinary tool durability: axes, hammers, pickaxes, shovels, spears and swords keep their established per-use durability behavior. A handheld torch consumes fuel only while it is actively held, while a torch transferred into the world as a mounted light continues burning independently until its own fuel expires.

## Gameplay contract

- The torch is crafted from **1 Stick + 2 Grass**.
- Crafted torches are inventory-backed and occupy a normal tool-belt slot.
- Every real tool-belt slot displays its available quantity. The Hand pseudo-slot is the only slot without a quantity badge.
- Equipping a torch shows a simple handheld torch prop in third-person view and creates a warm local light whose origin follows the flame itself rather than the Ranger root.
- While the handheld torch is active, the visible player presentation requests the semantic `steady-upright` right-hand carry profile. Hero M therefore keeps natural common body motion and a free left-arm gait while restraining the right hand's empty-arm swing; selecting/putting away the torch blends this profile in/out instead of popping the pose.
- Torch illumination radiates in **all directions** from the flame. A burning torch is a local fire source, not a forward-facing flashlight or modern spotlight.
- The handheld torch is a practical night-navigation tool, not only a close-range glow. Its configured reach is **15 world units**, while base intensity remains **58** and physically natural inverse-square-style decay remains **2**.
- The flame visibly flutters while held, while emitted light intensity/reach use a damped version of the same bounded fire signal so the environment does not pulse harshly.
- The handheld light position follows the animated flame anchor through a short exponential presentation damper. This removes frame-to-frame hand-bob jitter from the illuminated world while still keeping the source visually attached to the torch.
- The handheld local light casts softened shadows from nearby opaque world geometry. The Ranger is promoted to a local shadow caster only while the handheld torch is burning, then restored to the normal celestial receiver-only policy when the torch is put away or expires.
- Handheld torch fuel decreases only while `torch` is the equipped tool. Switching to another tool or the Hand pauses the active inventory unit.
- A torch lasts **half of the configured night phase**. With the current 20:00–05:00 night, that is 270 in-game minutes (4.5 in-game hours). The duration remains derived from `WORLD_TIME` rather than hard-coded real seconds.
- When a handheld torch expires, exactly one torch inventory unit is consumed. If another torch is available while the player is still holding the torch slot, the next unit takes over at full fuel. When the final torch expires, the tool belt falls back to the Hand.
- The existing belt durability bar is reused as a fuel meter for the handheld torch. The tool-belt model marks this meter as `fuel`, keeping the runtime state distinct from conventional durability.
- With a torch equipped, aiming at a valid nearby mount exposes the existing contextual action as **PLACE**. No separate torch-build menu is introduced.
- Valid current mounts are solid semantic construction walls, existing physical split-log walls, and existing vertical frame/support posts. One torch may occupy a mount at a time.
- Door and window openings are not treated as flat wall mounts. Jamb-specific mounting should be added only when those semantic geometry anchors are explicitly exposed.
- The repository currently has no independent fence-post subsystem. Existing vertical frame/support posts provide the current post-mount contract. A future fence system should expose compatible wall/post mount targets instead of adding torch-specific fence logic.
- Mounting transfers the currently burning inventory unit into the world, preserving that unit's remaining fuel and reducing the available tool-belt quantity by one. If another inventory torch remains, it becomes the next full handheld unit.
- Mounted torches burn continuously on the same authoritative world clock even when the player equips another tool or leaves the area. Each mounted torch has independent remaining fuel.
- When a mounted torch burns out, its visual and local light are removed. It does not silently consume a second inventory torch.
- Mounted torches persist through Save/Continue inside the existing dedicated torch save state, including position, mount identity, orientation and remaining fuel.

## Architecture

`TorchRuntimeController` remains the single authority for torch burn state, handheld presentation, mounted presentation, fire flicker and torch-owned lights. It does **not** own an animation frame or gameplay wall-clock timer. `WorldTimeRuntime` fans the same authoritative `WorldTimeSystem` snapshot into visual presentations and gameplay time consumers, so handheld and mounted fuel advance from one clock and cannot silently burn while world time is stopped.

`VisibleHandTorchRuntimeController` is the presentation adapter above that runtime. It owns the visible-palm mounting offset and, while the authoritative torch snapshot reports `burning`, requests `steady-upright` through the active appearance presentation's `setRightHandCarryProfile(...)` seam. It releases that request when the torch stops burning or the adapter is disposed. The adapter does not manipulate Hero M bones directly.

`HeroMArmMotionPresentation` owns the meaning of `steady-upright`: it blends down only the carried right hand's opposed locomotion swing/orientation while preserving common body translation and the free left-arm animation. This keeps item semantics and character rig implementation separated. The torch runtime does not become a second animation system, and Hero M does not gain fuel/light/inventory authority.

`TorchPlacementTargetResolver` owns mount discovery. It reads semantic solid-wall geometry from `PanelStructureRegistry.wallPlacementWorld(...)`, allowing wall position, side normal and height to come from the construction source of truth. During the transition from legacy physical construction, it also exposes active physical wall entries and vertical `frame` entries as wall/post mounts. The resolver applies one centralized reach/aim policy and excludes mount ids already occupied by a placed torch.

`EquipmentRuntimeController` owns only the player-facing contextual **PLACE** action. It asks `TorchRuntimeController` for the currently valid mount and delegates placement back to the torch runtime. This keeps HUD interaction, structural target resolution and torch fuel/light state as separate responsibilities.

The handheld torch contains a dedicated flame anchor. Each runtime update resolves that anchor to world space. Its point light follows that target through centralized `TORCH.light.follow` response, delta clamp and snap-distance tuning instead of copying every small animated hand displacement directly. This remains the authoritative portable fire source: there is no competing forward cone, Ranger-root glow or second motion system.

Flicker is deterministic and bounded. Three phase-offset waves produce the fire signal. The handheld visible flame uses the raw signal for life, while handheld illumination intensity and reach use a low-pass version controlled by `TORCH.light.flicker.smoothingResponse`. Base intensity, reach, decay, frequency, variance and smoothing remain centralized under `TORCH.light`.

Mounted torches reuse the same visual assets and fire-wave family but have independent deterministic phase offsets so a group of wall lights does not pulse in lockstep. Mounted-light tuning lives under `TORCH.placement.light`, while targeting and mobile budget values live under `TORCH.placement`.

Torch shadows reuse the renderer shadow pipeline already owned by `CelestialShadowSystem`; the torch does not create a second renderer or shadow manager. The handheld torch owns a **128 × 128** point-light shadow map with shadow intensity **0.72** and a bounded **30 Hz** refresh cadence. The shadow camera far plane remains **16 world units**, covering the handheld 15-unit light radius plus bounded reach flicker.

The renderer remains globally gated with `shadowMap.autoUpdate = false`, while both the celestial key light and handheld torch opt into explicit per-light invalidation through `LightShadow.autoUpdate = false` and `LightShadow.needsUpdate`. A handheld refresh therefore invalidates the local torch shadow plus the shared renderer gate without forcing the 512px celestial shadow map to redraw at torch cadence.

Mounted torches intentionally do **not** allocate point-light shadow maps. Permanent stronghold/workspace lighting can contain many fire sources, and six-face point-light shadows would multiply mobile GPU work rapidly. The nearest bounded set of mounted torches emits active point lights; more distant mounted torches retain their visible flame but do not add another active local light until they become one of the nearest sources.

While the handheld torch burns, `TorchRuntimeController` temporarily enables `castShadow` on the Ranger's render meshes, excluding the torch prop itself. Existing centralized shadow enrollment keeps static/chunked forest tree batches and ordinary opaque world meshes eligible as casters and receivers. Ranger caster flags are restored when the handheld torch is no longer active.

The generic `RangerToolPresentation` intentionally ignores the `torch` identifier so it cannot create a competing prop. Torch presentation remains owned by `TorchRuntimeController` plus the thin visible-hand adapter; the generic Hero M semantic carry seam is responsible only for arm pose.

`SaveGameController` continues to persist torch state separately from ordinary equipment durability. The same `state.torch` boundary now contains the active inventory unit's remaining minutes plus mounted-torch records. Restore reconstructs mounted visuals/lights without consuming inventory again, then resets the previous-clock sample so save/load or background time is not charged as fuel.

## Mobile performance and HUD

The handheld torch retains one omnidirectional point light and one local point-light shadow map. Its current **128px / 30 Hz** shadow policy remains below the previous local shadow-work budget and trades excess spatial sharpness for softer edges and smoother motion on mobile.

Mounted torches use a softer local ambient baseline than the navigation torch: **42** intensity, **10.5 world-unit** reach and physical decay **2**. They cast no dynamic point-light shadows. At most the nearest **8** mounted point lights are active at once; mounted flames remain rendered beyond that limit so a larger stronghold still reads as populated with fire sources without unbounded lighting cost.

The full eight-slot tool belt retains its narrow-screen sizing rule. Quantity badges now use the already-existing badge element for spear, axe, hammer, pickaxe, shovel, sword and torch; no parallel inventory counter UI was introduced.

## Regression coverage

`scripts/verify-torch-system.mjs` protects the established portable-torch contracts, including:

- half-night duration remains derived from configured night boundaries;
- primitive recipe and tool-belt registration remain intact;
- handheld fuel advances only while held;
- one unit is consumed at handheld expiry and spare torches roll over cleanly;
- the belt meter reports fuel percentage;
- partial handheld fuel persists across save/restore without offline burn;
- the torch uses the shared world-time runtime rather than a second timer loop;
- the handheld light is a flame-anchored omnidirectional `PointLight`;
- navigation reach, decay and bounded flicker stay centralized;
- local point-light shadows stay soft and within the mobile work budget;
- handheld shadow refresh uses bounded per-light invalidation;
- Ranger and forest shadow-caster policies remain intact;
- the eight-slot belt retains its narrow-screen layout contract.

`verify-character-presentation-polish.mjs` additionally verifies that an active torch requests `steady-upright` from the appearance presentation and releases it on disposal. `verify-hero-m-arm-motion.mjs` proves that this semantic profile substantially restrains the carried right-hand walk/run swing while leaving the free left-arm path unchanged and blending back to normal when cleared.

`scripts/verify-placeable-torches.mjs` protects the mounted-light additions:

- vertical frame/support posts and walls resolve as mount targets;
- occupied mounts cannot stack duplicate torches;
- placement transfers exactly one inventory torch and preserves the active unit's remaining fuel;
- mounted torches burn independently on the shared game clock;
- fixed torches do not allocate shadow maps;
- only the nearest configured number of mounted point lights are active;
- mounted torch state survives capture/restore without consuming inventory again;
- semantic wall targeting remains tied to `PanelStructureRegistry`;
- all actual tool slots display their available quantity;
- mounted state stays inside the dedicated torch persistence boundary.

`scripts/verify-celestial-shadows.mjs` protects the complementary renderer contract: the celestial key light is explicitly invalidated per light and remains on its established 512px / 10 Hz policy.

## Device verification

After merge/deploy, verify on a physical phone that every crafted tool slot shows the correct available quantity without obscuring the icon, durability/fuel meter or tap target, including the torch slot after mounting one or more torches.

At night, equip a torch and approach several solid building walls and vertical frame/support posts. Confirm that **PLACE** appears only for a sensible nearby aimed mount, that placing consumes exactly one available torch, the mounted flame sits against the expected wall/post side, and the next inventory torch remains usable when available. Confirm that the same mount does not accept a second torch.

While the torch is held, walk, run, turn, stop and start repeatedly. The right arm should read as deliberately carrying an upright torch instead of swinging through the full empty-hand gait; it should still move naturally with the body rather than becoming rigid. The left arm should continue its normal walk/run swing. Putting the torch away should blend smoothly back to normal two-arm locomotion without a visible pose snap.

Build a larger lit workspace/stronghold and place enough torches to exceed the eight-active-light budget. Walk through it and confirm that nearby areas remain warmly illuminated as the nearest active-light set changes without obvious popping, while distant mounted flames remain visible and frame rate stays comfortable on the target Android device.

Save and Continue with several mounted torches at different fuel levels. Confirm that every torch returns at the same position/orientation and resumes from its saved fuel rather than burning offline. Let a mounted torch expire and confirm that its world light/visual disappears without consuming another inventory torch.

For the handheld light, retain the established checks: flame-follow should not visibly snap on each walking step; illumination should spread naturally around the Ranger rather than forming a flashlight cone; terrain and nearby structures should remain readable at night; and softened handheld shadows should remain stable without acne, detached trails or distracting low-resolution blocks.