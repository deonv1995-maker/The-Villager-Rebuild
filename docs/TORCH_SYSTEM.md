# Crafted Torch System

## Scope

The torch is a carried placeable item whose world illumination begins only after it is mounted. Torches are persistent construction lights: they do not consume fuel, burn out, disappear overnight, or degrade while carried. Ordinary tool durability remains unchanged for axes, hammers, pickaxes, shovels, spears and swords.

## Gameplay contract

- The torch is crafted from **1 Stick + 2 Grass**.
- Crafted torches are inventory-backed and occupy a normal tool-belt slot.
- Every real tool-belt slot displays its available quantity. The Hand pseudo-slot is the only slot without a quantity badge.
- Equipping a torch shows the handheld torch prop in third-person view, but the carried torch does **not** add a world `PointLight` or local torch shadow pass.
- While the handheld torch is active, the visible player presentation requests the semantic `steady-upright` right-hand carry profile. Hero M therefore keeps natural common body motion and a free left-arm gait while restraining the right hand's empty-arm swing; selecting/putting away the torch blends this profile in/out instead of popping the pose.
- The handheld flame presentation may continue to animate as an item/readability cue, but it does not illuminate terrain, structures, vegetation or the Ranger while carried.
- Carrying or equipping a torch does not consume it. The torch remains available until the player places it.
- Torches have no fuel meter or burnout timer. The tool-belt slot shows quantity only.
- With a torch equipped, aiming at a valid nearby mount exposes the existing contextual action as **PLACE**. No separate torch-build menu is introduced.
- Valid current placement surfaces are solid semantic construction walls, existing physical split-log walls, existing vertical frame/support posts, ordinary playable world ground, natural cave floors, and natural cave walls. One torch may occupy a quantized surface/mount anchor at a time.
- Door and window openings are not treated as flat wall mounts. Jamb-specific mounting should be added only when those semantic geometry anchors are explicitly exposed.
- The repository currently has no independent fence-post subsystem. Existing vertical frame/support posts provide the current post-mount contract. A future fence system should expose compatible wall/post mount targets instead of adding torch-specific fence logic.
- Mounting transfers exactly one inventory torch into the world and reduces the available tool-belt quantity by one. Any remaining inventory torch can be equipped and placed normally.
- Once mounted, the torch becomes an actual local fire light. Mounted illumination radiates in all directions from the flame using the centralized fixed-light tuning.
- Mounted torches use a fixed **38° outward/upward lean** relative to the resolved mount normal instead of remaining vertical in the wall plane. Wall-mounted visuals receive an additional **0.14 world-unit presentation clearance** in front of the canonical wall mount so the handle and flame stay visibly outside the wall rather than clipping into it.
- Once placed, a mounted torch stays active indefinitely across day/night cycles and while the player is elsewhere.
- Mounted torches persist through Save/Continue inside the existing dedicated torch save state, including position, mount identity and orientation. Legacy save records that still contain `remainingGameMinutes` are accepted, but that obsolete value is ignored.

## Architecture

`TorchRuntimeController` remains the shared authority for handheld presentation data, mounted presentation, placement, fire flicker and persisted torch state. It has no torch-lifetime timer. The existing `WorldTimeRuntime` consumer callback remains the established presentation update cadence for flame/light animation, but world time no longer changes torch ownership or removes placed lights.

`VisibleHandTorchRuntimeController` is the production presentation adapter above that runtime. It owns the visible-palm mounting offset and, while the authoritative torch snapshot reports `burning`, requests `steady-upright` through the active appearance presentation's `setRightHandCarryProfile(...)` seam. It also enforces the placed-only lighting rule: the inherited handheld point light is kept detached from the world scene, marked invisible, prevented from casting local shadows, and prevented from forcing an otherwise-unnecessary renderer shadow refresh. Any temporary Ranger shadow-caster promotion made by the base runtime is restored immediately at this adapter boundary. The adapter does not manipulate Hero M bones directly and does not alter mounted-light ownership.

`HeroMArmMotionPresentation` owns the meaning of `steady-upright`: it blends down only the carried right hand's opposed locomotion swing/orientation while preserving common body translation and the free left-arm animation. This keeps item semantics and character rig implementation separated. The torch runtime does not become a second animation system, and Hero M does not gain fuel/inventory authority.

`TorchPlacementTargetResolver` owns mount discovery. It reads semantic solid-wall geometry from `PanelStructureRegistry.wallPlacementWorld(...)`, allowing wall position, side normal and height to come from the construction source of truth. During the transition from legacy physical construction, it also exposes active physical wall entries and vertical `frame` entries as wall/post mounts. The same resolver now asks the authoritative terrain/tunneling services for world-ground, cave-floor and cave-wall targets instead of inventing a second raycast geology model. The resolver applies one centralized reach/aim policy and excludes mount ids already occupied by a placed torch.

The resolver's returned position remains the canonical gameplay/save anchor. `TorchRuntimeController` derives the mounted presentation from that anchor: the saved yaw reconstructs the outward horizontal normal, the shared `TORCH.placement.outwardTiltDegrees` rotates the torch's local up axis toward that normal using explicit `YXZ` Euler order, and wall visuals alone receive `wallVisualOutwardOffset` along the same normal. This keeps anti-clipping presentation tuning out of target selection and means existing saves automatically receive the corrected wall presentation without changing their persisted coordinates.

`EquipmentRuntimeController` owns only the player-facing contextual **PLACE** action. It asks `TorchRuntimeController` for the currently valid mount and delegates placement back to the torch runtime. This keeps HUD interaction, structural target resolution and persistent torch-light state as separate responsibilities.

The handheld torch still contains its dedicated flame anchor and presentation assets so carry alignment and flame animation do not need a parallel item implementation. In the production `VisibleHandTorchRuntimeController` path, however, the handheld `PointLight` never participates in the scene graph. This makes the mounted state the single source of actual torch illumination without duplicating torch gameplay logic.

Flicker is deterministic and bounded. Three phase-offset waves produce the fire signal. The handheld visible flame may use that signal for presentation life, while mounted torches use the same wave family with independent deterministic phase offsets so a group of wall lights does not pulse in lockstep. Mounted-light tuning lives under `TORCH.placement.light`, while targeting and mobile budget values live under `TORCH.placement`.

Mounted torches intentionally do **not** allocate point-light shadow maps. Permanent stronghold/workspace lighting can contain many fire sources, and six-face point-light shadows would multiply mobile GPU work rapidly. The nearest bounded set of mounted torches emits active point lights; more distant mounted torches retain their visible flame but do not add another active local light until they become one of the nearest sources.

The generic `RangerToolPresentation` intentionally ignores the `torch` identifier so it cannot create a competing prop. Torch presentation remains owned by `TorchRuntimeController` plus the thin visible-hand adapter; the generic Hero M semantic carry seam is responsible only for arm pose.

`SaveGameController` continues to persist torch state separately from ordinary equipment durability. The `state.torch` boundary stores mounted-torch records and the next placement id. Restore reconstructs mounted visuals/lights without consuming inventory again. Legacy `remainingGameMinutes` fields are deliberately ignored so old nearly-expired torches migrate to the persistent-light model.

## Mobile performance and HUD

The production handheld torch contributes no active scene light and no active point-light shadow map while carried. This removes the moving six-face point-light shadow workload from ordinary torch carry and avoids spending local lighting budget before placement.

Mounted torches use the fixed local ambient baseline: **42** intensity, **10.5 world-unit** reach and physical decay **2**. They cast no dynamic point-light shadows. At most the nearest **8** mounted point lights are active at once; mounted flames remain rendered beyond that limit so a larger stronghold still reads as populated with fire sources without unbounded lighting cost.

The full eight-slot tool belt retains its narrow-screen sizing rule. Quantity badges use the already-existing badge element for spear, axe, hammer, pickaxe, shovel, sword and torch; no parallel inventory counter UI was introduced.

## Regression coverage

`scripts/verify-torch-system.mjs` protects the underlying persistent-torch and shared-runtime contracts, including:

- primitive recipe and tool-belt registration remain intact;
- torch definitions expose no finite burnout duration;
- carrying a torch across multiple nights does not consume inventory;
- persistent torches expose no fuel percentage or fuel meter;
- legacy handheld fuel data does not recreate a finite-lifetime state;
- the torch uses the established shared update runtime rather than a second timer loop;
- centralized flame/flicker/light definitions remain bounded;
- torch save state stays separated from ordinary tool durability.

`verify-character-presentation-polish.mjs` protects the production visible-hand path. In addition to grip and `steady-upright` carry behavior, it verifies that the handheld point light remains detached, invisible and non-shadow-casting across world-time updates, while a newly placed torch attaches its own light to the world scene and becomes visible.

`verify-hero-m-arm-motion.mjs` proves that the semantic carry profile substantially restrains the carried right-hand walk/run swing while leaving the free left-arm path unchanged and blending back to normal when cleared.

`scripts/verify-placeable-torches.mjs` protects the mounted-light system:

- vertical frame/support posts and walls resolve as mount targets;
- occupied mounts cannot stack duplicate torches;
- placement transfers exactly one inventory torch with no fuel/lifetime state;
- mounted post and wall torches keep a bounded upward/outward angle toward their resolved mount normal;
- wall-mounted visuals receive the configured anti-clipping clearance while the canonical saved mount position remains unchanged;
- mounted torches remain present and lit across long world-time jumps;
- fixed torches do not allocate shadow maps;
- only the nearest configured number of mounted point lights are active;
- mounted torch state survives capture/restore without consuming inventory again, ignores legacy fuel values, and reconstructs the same outward wall angle;
- semantic wall targeting remains tied to `PanelStructureRegistry`;
- all actual tool slots display their available quantity;
- mounted state stays inside the dedicated torch persistence boundary.

`scripts/verify-celestial-shadows.mjs` protects the complementary renderer contract for the shared celestial key light.

## Device verification

After merge/deploy, verify on a physical phone that every crafted tool slot shows the correct available quantity without obscuring the icon or tap target. The torch slot should no longer show a fuel countdown.

At night, equip a torch before placing it. Confirm that Hero M still visibly carries the torch and uses the steady upright carry pose, but the carried torch does **not** brighten the ground, nearby walls, vegetation or the Ranger and does not create a moving local torch shadow.

Approach several solid building walls and vertical frame/support posts, then repeat on open world ground, cave floors and cave walls. Confirm that **PLACE** appears only for a sensible nearby aimed surface, that ground torches stand upright, wall/cave-wall torches lean outward, that placing consumes exactly one available torch, and that illumination begins immediately from the mounted flame. Confirm that each mounted torch clearly leans outward and upward from the wall/post, that the handle is not buried inside the wall surface, that the flame stays visibly in front of the wall, and that the same mount does not accept a second torch.

While the torch is held, walk, run, turn, stop and start repeatedly. The right arm should read as deliberately carrying an upright torch instead of swinging through the full empty-hand gait; it should still move naturally with the body rather than becoming rigid. The left arm should continue its normal walk/run swing. Putting the torch away should blend smoothly back to normal two-arm locomotion without a visible pose snap.

Build a larger lit workspace/stronghold and place enough torches to exceed the eight-active-light budget. Walk through it and confirm that nearby areas remain warmly illuminated as the nearest active-light set changes without obvious popping, while distant mounted flames remain visible and frame rate stays comfortable on the target Android device.

Leave several mounted torches in the world through multiple nights, then Save and Continue. Confirm that every torch remains present, active and at the same position/orientation, with no overnight disappearance or burnout.


## World and cave placement — 2026-09-21

Torch placement remains one inventory/save/light system. `TorchPlacementTargetResolver`
now combines the existing construction anchors with authoritative environment targets:
surface ground comes from the island terrain authority and underground floor/wall hits come
from `UndergroundTunnelingSystem`'s density field. Cave ceilings are not valid mounts.
Environment mount ids are spatially quantized so the existing occupied-anchor rule prevents
stacking multiple torches into the same small patch.

Ground and cave-floor torches stand vertically. Building walls, posts and cave walls retain
the established outward/upward lean, and cave walls receive the same anti-clipping visual
clearance as built walls. Persistence remains the existing `state.torch` record; no second
camp/cave lighting save format is introduced. The nearest-eight active point-light budget
still applies globally to placed torches.
