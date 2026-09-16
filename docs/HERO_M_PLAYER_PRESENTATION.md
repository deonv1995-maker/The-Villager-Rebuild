# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The KayKit Ranger remains the sole gameplay and animation authority for traversal, collision, locomotion, camera modes, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMArmMotionPresentation`, which layers fixed-pivot locomotion arm presentation polish above `HeroMVisibleSoleGroundingPresentation` and `HeroMPresentation`. The grounding compatibility class no longer uses sampled boot vertices as an authority; it only exposes rendering-only foot contact anchors.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7bacc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB, gzip-compressed, then stored as three base64 text segments so GitHub delivery remains reliable:

- `public/assets/player/hero_m.glb.gz.part0.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part1.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part2.b64` — decoded payload 5,194 bytes;
- combined gzip payload — 15,594 bytes — SHA-256 `55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8`;
- decompressed compact GLB — 40,052 bytes — SHA-256 `c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c`.

The original FBX contained its own animation stacks. They are deliberately omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. The presentation maps the gameplay-facing body regions onto that authored rig rather than adding another controller or animation mixer. Pelvis, spine, head, both complete arm/hand pieces and the segmented leg chains receive bounded bind-delta rotations derived from the current KayKit pose. In addition, the Hero M pelvis receives the KayKit hip's animated local translation, scaled from source hip-to-head height to Hero M pelvis-to-head height and clamped to the same `0.75–1.35` proportional range already used by the proven Prisma retargeter. All other authored Hero M joint positions and scales remain unchanged at the base retarget layer.

That pelvis translation is presentation-only skeletal motion, not gameplay root motion. It preserves the source animation's vertical body bob and small local sway so idle, walk and run move the torso together with the legs instead of making the feet animate underneath a frozen body. The Ranger gameplay root still owns world translation, collision, support height and jump physics.

### One-bone arm adaptation

Hero M does not contain a conventional upper-arm/elbow/forearm/hand chain. Each side has one deform joint that drives the complete visible arm/hand piece. There is therefore no separate elbow or wrist joint available to reproduce the complete KayKit arm chain. The final presentation treats each side as one rigid arm piece driven around its authored deform-joint pivot.

The first arm-polish pass moved each complete-arm joint toward a hip-level rest anchor and then translated those joints through a small walk/run arc. Physical-device testing exposed the structural problem with that approach: relocating the only deform joint toward the hip makes the wrist appear attached to that area even when a small positional arc is added. The visible hand therefore reads as pinned instead of swinging freely with locomotion.

The corrected boundary removes that translated hip anchor entirely. `HeroMPresentation` remains the single owner of the relaxed arm rest orientation; its existing geometry calibration measures the actual weighted arm vertices and derives a mostly downward, slightly outward rest axis. `HeroMArmMotionPresentation` does not perform a second rest calibration. It preserves the base rest pose and allows the base retargeter to restore each arm joint to its authored parent-local position every frame.

Walking and running continue to consume the established KayKit retargeted upper-arm rotation. The final arm layer additionally samples the live KayKit left/right hand positions relative to their shoulders and converts their opposed fore/aft difference into a bounded locomotion phase. A small extra rotation is then applied around the character-local arm-swing axis: approximately `10°` at full walking phase and `17°` at full running phase, with opposite signs on the two sides. Idle adds no supplemental swing. Because the visible arm now rotates around its fixed authored pivot instead of being translated toward the hip, the hand describes a circular path with clear forward/backward travel and a small natural vertical bounce near the ends of the stride.

The supplemental swing is exponentially smoothed. During tool actions its target returns to zero so the established KayKit/tool-action rotation remains authoritative. The arm joints themselves are never translated by this adapter in idle, locomotion or tool use.

This remains a presentation-only correction. No new mixer, locomotion state, root motion, collision authority or gameplay timing is introduced. KayKit remains the sole animation source, the base Hero M presentation remains the sole rest-pose owner, and the Ranger gameplay root remains the sole movement/collision authority.

## Scale and visual grounding

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Collision dimensions and traversal physics are unchanged.

### Root cause: world-space load calibration leaking into local space

The persistent device-reported hover was ultimately traced to the Hero M load path rather than to the terrain or locomotion controller. `HeroMPresentation` temporarily attached the newly loaded Hero M candidate to `visualRoot`, then used `Box3.setFromObject()` to calculate its grounding offset. `Box3.setFromObject()` returns world-space bounds. The code then treated `bounds.min.y` as though it were local-space geometry and wrote that value back into `candidateRoot.position.y`.

That coordinate-space mismatch meant the Ranger's world Y at the exact moment Hero M finished loading could be baked into Hero M's local grounding offset. If the player happened to stand below world Y=0, the negative world elevation was subtracted a second time and the visible character was lifted above the Ranger root by approximately that elevation. The resulting gap was stable across idle, walking and running, which is why repeated per-frame boot/terrain compensation could not reliably eliminate it.

The corrected loader calibrates Hero M while the candidate is still detached from the gameplay/player hierarchy. Its bounds are therefore measured in a neutral presentation-local frame where world Y equals model-local Y. Only after `groundingOffsetY` and presentation height have been calculated is the candidate placed under the centered motion pivot and attached to `visualRoot`. The resulting calibration is explicitly tagged `presentation-local-v1`.

This is the authoritative fix for the load-time vertical bias. No second terrain-height model or continuously accumulating sole offset is allowed to compensate for it.

### Runtime support compensation

After the load-space correction, the existing bounded center-support compensation remains responsible only for the legitimate difference between the gameplay root's footprint support and the walkable support directly beneath the character center. That compensation is presentation-only and never changes the Ranger root, collision, terrain, movement state or jump velocity.

`HeroMVisibleSoleGroundingPresentation` remains in the inheritance chain because other systems use its rendering contact contract. Its former sampled-sole feedback authority has been removed. It now provides foot-local rendering anchors for contact shading while the Hero M base presentation owns the character's actual vertical calibration.

Contact readability is handled separately by the celestial shadow/contact system. The compatibility presentation exposes two ground-contact anchors from the actual Hero M foot bones, with Y resolved from the same walkable support seam already used by the player world. Those anchors affect only contact shading and never drive character movement or presentation Y.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. During the flip, a smooth tuck envelope pulls the complete Hero M presentation into a compact ball-like silhouette: the tuck builds from zero at takeoff, reaches maximum compression at the middle of the rotation, then releases back to the normal silhouette before the flip completes. At maximum tuck the centered motion pivot scales to `0.84` horizontally/depth-wise and `0.62` vertically.

The flip and tuck are both applied above the authored rig on the centered Hero M motion pivot. They do not modify the gameplay root, jump velocity, collision, camera, landing logic, KayKit animation ownership or Hero M's calibrated base scale. If the character lands or jump stage resets early, the flip and tuck are immediately cleared so the grounded silhouette cannot remain compressed.

## Tool grip

Hero M does not expose a conventional finger/palm bone chain. The visible right-hand tool socket is calibrated from the actual skinned vertices influenced by `DEF_hand_R`. The presentation selects the outer region of that weighted hand geometry, places the mount there, and aligns the tool axis from the arm joint toward the visible grip point.

The final locomotion arm layer does not recalibrate or relocate that grip. `RangerToolPresentation` and the existing tool-action timing remain unchanged. Tools continue to ask the appearance presentation for one right-hand mount, so they follow the base KayKit action rotation plus any active walking/running arm swing automatically. During a tool action the extra locomotion swing decays to zero rather than competing with the action animation.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. The previous Quaternius peasant/ranger comparison assets remain in the repository as rollback/audit material, but they are no longer the active runtime presentation.

## Stable systems deliberately unchanged

This presentation fix does not change movement speed, jump or double-jump physics, collision, terrain generation, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes Hero M verification through `verify:prisma-native`. `verify:hero-m-player` explicitly runs `verify-hero-m-arm-motion.mjs` so the fixed-pivot arm regression is part of the normal CI path.

The static Hero M presentation verifier pins the segmented runtime asset, validates the compact 16-joint rig and visual scale, checks presentation-local grounding, center-support compensation, idle/run rotational retargeting, the double-jump flip/tuck, finite animated bounds, tool transfer, first-person visibility and Prisma fallback.

The load-space runtime regression reconstructs the shipped Hero M and Ranger assets and deliberately loads Hero M while the Ranger root is at world Y `-0.34`. It requires the final Hero M local grounding calibration and motion-pivot baseline to remain independent of world zero, then checks `Idle_A`, `Walking_A`, `Running_A`, elevation changes and airborne root following.

The arm-motion runtime regression reconstructs the shipped Hero M and KayKit Ranger assets through `HeroMArmMotionPresentation`. It requires both complete-arm joint positions to remain equal to their authored local positions during idle, walking, running and tool suppression. It also requires the idle visible grip to retain the proven base geometry-calibrated downward arm direction, verifies measurable walk fore/aft hand travel, stronger run travel, vertical hand bounce from the circular fixed-pivot arc, opposed left/right motion, decay of the supplemental swing during tool actions, finite Hero M matrices and complete gameplay-root isolation.

The compatibility verifier rejects any return of translated hip-area arm pivots, a duplicate final-layer rest calibration, animated-vertex sole grounding or a parallel rendered-terrain grounding authority. It also requires the stable Ranger import to resolve through the final arm-motion layer.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear. The boots should remain aligned with the terrain while idle, walking and running without the whole character hovering at a fixed distance above the floor.

For the arms, confirm the relaxed idle pose still looks natural, neither complete-arm joint visibly shifts toward the hips, and the hands do not look locked to the body during locomotion. During walking, each hand should swing clearly forward and backward and rise slightly near the ends of the arc. During running, that swing and bounce should be more pronounced, with the two sides moving in opposition. Then confirm tools still follow the visible right hand, tool actions do not retain the extra locomotion swing, first-person still hides the presentation correctly, and no movement/collision/construction behavior changed.
