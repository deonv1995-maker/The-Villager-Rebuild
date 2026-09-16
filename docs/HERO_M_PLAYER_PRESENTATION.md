# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The KayKit Ranger remains the sole gameplay and animation authority for traversal, collision, locomotion, camera modes, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMArmMotionPresentation`, which layers the final Hero M hand-endpoint arm retarget above `HeroMVisibleSoleGroundingPresentation` and `HeroMPresentation`. The grounding compatibility class exposes rendering-only foot contacts; it does not own movement or terrain authority.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7bacc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB, gzip-compressed, then stored as three base64 text segments:

- `public/assets/player/hero_m.glb.gz.part0.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part1.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part2.b64` — decoded payload 5,194 bytes;
- combined gzip payload — 15,594 bytes — SHA-256 `55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8`;
- decompressed compact GLB — 40,052 bytes — SHA-256 `c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c`.

The source FBX animation stacks are deliberately omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. Pelvis, spine, head and segmented legs remain driven by the established compact bind-delta retarget in `HeroMPresentation`. The Hero M pelvis additionally receives the KayKit hip's animated local translation, scaled from source hip-to-head height to Hero M pelvis-to-head height and clamped to the same `0.75–1.35` proportional range already used by the proven retargeting path. This is presentation-only skeletal motion; the Ranger gameplay root still owns world translation, support height, collision and jump physics.

### Torso-blended arm endpoint adaptation

The shipped Hero M arm rig is not a conventional shoulder → upper arm → elbow → forearm → wrist chain. Production-asset inspection establishes this structure:

- `DEF_hand_L` and `DEF_hand_R` are both direct children of `DEF_spine`;
- their authored pivots are approximately `x = ±0.8`, `y = 1.75`, near the raised outer-arm endpoints of the source pose;
- each endpoint influences 42 visible vertices concentrated in the outer arm/hand region;
- the inner shoulder/upper-arm transition is blended into torso/spine-owned geometry;
- there are no separate shoulder, upper-arm, elbow or forearm deform bones in the compact Hero M runtime rig.

This means `DEF_hand_L/R` must be treated as **movable arm endpoints**, not shoulder pivots. Rotating them in place is structurally wrong: it mainly twists the outer arm/wrist around the authored raised endpoint and cannot produce real hand travel. That was the root cause of the device-visible failure where the arms stayed raised and only the wrists appeared to rotate.

`HeroMArmMotionPresentation` therefore maps the live KayKit **hand trajectories** into the Hero M endpoints. At load time, each side gets one bind-pose correction that aligns the two rigs without inventing a hip anchor. Every frame, after the base Hero M body retarget runs, the final arm layer:

1. reads both live KayKit hand positions relative to the KayKit hip;
2. scales those vectors using the shared Hero M pelvis/body proportion scale;
3. preserves the bilateral hand midpoint while applying a restrained locomotion-only gain to each hand's opposed vertical/fore-aft displacement;
4. applies the resulting vector relative to the current Hero M pelvis plus the side-specific bind correction;
5. translates `DEF_hand_L/R` to that mapped endpoint position;
6. applies the live KayKit hand orientation delta as a secondary orientation layer.

The current presentation-only travel gain is `1.12` for `Walking_A`, `1.16` for `Running_A`, and `1.0` for idle/other states. Only the opposed Y/Z component is amplified. Lateral X placement and the two-hand midpoint remain source-authored, so the extra energy does not widen the arms or add a second body-bounce authority.

Because the arm mesh is blended between the torso/spine region and the movable outer endpoint, translating the endpoint deforms the visible arm through space while the inner shoulder region remains attached to the torso. Walking and running therefore use the source animation's real opposed fore/aft hand paths and vertical bounce, with a small bounded emphasis for readability, instead of a hand-authored sine wave or a fake fixed shoulder pivot.

The final endpoint layer intentionally writes the endpoint position directly after the base retarget. `HeroMPresentation` restores compact-rig joint positions every frame; smoothing from that freshly reset position would permanently attenuate the source hand travel and recreate the pinned-wrist failure. This direct write is still presentation-only and does not add a second mixer, locomotion state, root-motion source or collision authority.

The fixed-pivot arm model is retired. Do not reintroduce `DEF_hand_L/R` as shoulder joints, a procedural shoulder-pivot swing axis, or a rule that their authored local positions must remain fixed during locomotion.

## Tool grip and steady carry

Hero M does not expose a conventional finger/palm chain. The visible right-hand tool socket is calibrated from the actual skinned vertices influenced by `DEF_hand_R` and remains parented to that endpoint. Tools therefore follow the translated right hand automatically. `RangerToolPresentation`, tool-action timing and gameplay ownership are unchanged.

The arm endpoint layer follows the same KayKit hand transform used by the hidden animation authority, so tool orientation remains source-driven rather than being independently synthesized by the Hero M presentation.

For handheld items that should remain visually steady while the Ranger walks or runs, `HeroMArmMotionPresentation` exposes a **semantic right-hand carry profile** rather than allowing each item to rewrite Hero M bones. The current `steady-upright` profile keeps the common pelvis/body motion and the free left-arm gait, but reduces the right hand's opposed fore/aft/vertical locomotion swing to 24% and its orientation delta to 34%. The profile blends in and out exponentially so selecting or putting away an item does not pop the arm pose.

The torch runtime is currently the only consumer of this profile. It requests `steady-upright` only while the torch is actively equipped/burning and releases the profile when the torch is no longer active or its runtime is disposed. This keeps ownership clean: the torch knows **that** a steady carry is required; Hero M presentation knows **how** that semantic carry changes the visible arm. Fuel, light, inventory, player movement, collision and KayKit locomotion remain outside the carry layer.

## Scale and visual grounding

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Collision dimensions and traversal physics are unchanged.

Hero M load grounding is calibrated while the candidate character is detached from the gameplay hierarchy. This keeps `Box3` bounds in a neutral presentation-local frame and prevents the Ranger's current world elevation from being baked into the model's local grounding offset. The resulting calibration is tagged `presentation-local-v1`.

After that load-space correction, the existing bounded center-support compensation remains responsible only for the legitimate difference between the gameplay root's footprint support and walkable support directly beneath the character center. It is presentation-only and never changes the Ranger root, terrain, collision, movement state or jump velocity.

`HeroMVisibleSoleGroundingPresentation` remains in the inheritance chain because other rendering systems use its paired visible-foot contact anchors. Those anchors affect contact shading only; they do not drive character height.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. A smooth tuck envelope compresses the presentation during the middle of the rotation and restores it before completion. The flip/tuck is applied above the authored rig and does not modify gameplay root motion, jump velocity, collision, camera, landing logic or KayKit animation ownership.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. Previous Quaternius comparison assets remain in the repository as rollback/audit material but are not the active runtime presentation.

## Stable systems deliberately unchanged

This presentation tuning does not change movement speed, jump or double-jump physics, collision, terrain generation, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes Hero M verification through `verify:prisma-native`. `verify:hero-m-player` runs four relevant contracts:

- `verify:hero-m-arm-rig` loads the shipped production Hero M asset and verifies the compact 16-joint layout, the spine-parented left/right hand endpoints, their lateral authored pivots, their compact outer-arm/hand skin ownership, the central spine-owned torso region and the absence of a conventional shoulder/elbow/forearm deform chain.
- `verify-hero-m-presentation.mjs` pins the segmented runtime asset, presentation scale, base compact retarget, double-jump presentation, tool transfer, first-person visibility and Prisma fallback.
- `verify-hero-m-visible-sole-grounding.mjs` protects presentation-local grounding, rendering-only foot contacts, translated hand-endpoint ownership and gameplay-root isolation. It rejects the retired fixed-pivot arm model and pins the modest `Walking_A`/`Running_A` travel gains.
- `verify-hero-m-arm-motion.mjs` reconstructs the shipped Hero M and KayKit assets and verifies the actual `DEF_hand` endpoint positions, not merely a tool socket or inferred arc. It requires idle endpoints to leave the authored raised source pose, exact gain-adjusted mapping from both live KayKit hand-relative-to-hip trajectories, opposed left/right locomotion, measurable fore/aft translation, vertical bounce, finite matrices and zero gameplay-root motion. It also enables `steady-upright`, verifies that the carried right hand has substantially reduced fore/aft/vertical swing while the left arm remains unchanged, then clears the profile and verifies the blend returns to the free-arm gait.

The regression explicitly pins the locomotion travel profile at `1.12` for walking and `1.16` for running. Because that gain is applied around the bilateral hand midpoint, a future change cannot silently convert this emphasis into arm widening, extra root/body translation or a new procedural swing authority while still satisfying the endpoint contract.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear. In idle, both arms should hang below the raised source-pose position and remain attached cleanly through the shoulder/torso blend. While walking with empty/free hands, the hands and outer arms should visibly travel forward and backward with opposite phases, not merely rotate at the wrists. The motion should remain energetic without looking exaggerated. Running should show a larger fore/aft swing and stronger vertical bounce than walking.

Then equip the torch and repeat walking, running, turning and stop/start transitions. The right hand should hold the torch steadily enough to read as a deliberate carry instead of swinging it like an empty arm; it should still inherit natural body motion rather than looking frozen. The left arm should continue its normal gait. Putting the torch away should blend back into the normal two-arm locomotion without a visible pop.

Also verify that the shoulder region does not detach or stretch unnaturally at stride extremes, tools remain attached to and follow the visible right hand, first-person visibility still behaves correctly, and movement/collision/construction behavior is unchanged.