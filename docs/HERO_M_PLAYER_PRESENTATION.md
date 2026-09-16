# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The KayKit Ranger remains the sole gameplay and animation authority for traversal, collision, locomotion, camera modes, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMArmMotionPresentation`, which layers shoulder-pivot arm presentation polish above `HeroMVisibleSoleGroundingPresentation` and `HeroMPresentation`. The grounding compatibility class no longer uses sampled boot vertices as an authority; it only exposes rendering-only foot contact anchors.

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

Hero M does not contain a conventional upper-arm/elbow/forearm/hand chain. Each side has one deform joint that drives the complete visible arm/hand piece. That limitation means the arm must behave like a rigid pendulum around the authored shoulder pivot; there is no separate elbow or wrist joint available to reproduce the KayKit chain exactly.

The first arm-polish pass moved each complete-arm joint toward a hip-level rest anchor and then translated those joints through a small walk/run arc. Physical-device testing exposed the structural problem with that approach: because the complete arm rotates around that one joint, relocating the joint toward the hip makes the visible wrist read as though it is pinned to the hip. The hand can translate a little, but it no longer describes a convincing shoulder-driven pendulum arc.

`HeroMArmMotionPresentation` therefore keeps both complete-arm deform joints at their authored parent-local shoulder positions at all times. Idle hand placement is corrected through orientation instead of joint translation. After the base Hero M load finishes, the adapter reconstructs one deterministic rest pose, reads the existing calibrated visible right-hand grip plus pelvis/spine landmarks, and calculates the relaxed hip-level direction the hand should point toward. The right arm's rest quaternion is rotated toward that direction while the joint position remains unchanged. Hero M is authored symmetrically, so the current right-hand grip and target are mirrored through the torso center to derive the equivalent left-arm rest correction.

Walking and running continue to consume the established KayKit retargeted upper-arm rotation. The adapter then samples the live KayKit left/right hand positions relative to their shoulders and converts their opposed fore/aft difference into a bounded phase signal. A small additional rotation is applied around the character-local shoulder-swing axis: approximately `10°` at full walking phase and `17°` at full running phase, with only a subtle `1.5°` allowance in idle. The two sides receive opposite signs. Because the complete arm now rotates around the shoulder rather than a relocated hip pivot, the hand naturally travels forward/backward and rises slightly near each end of the circular arc, producing the requested swing and bounce without a second animation system.

The supplemental swing is exponentially smoothed. During tool actions its target returns to zero so the established KayKit/tool-action rotation remains authoritative. The arm joints themselves are never translated by this adapter in idle, locomotion or tool use.

This remains a presentation-only correction. No new mixer, locomotion state, root motion, collision authority or gameplay timing is introduced. KayKit remains the sole animation source, and the Ranger gameplay root remains the sole movement/collision authority.

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

The shoulder-pivot arm-rest correction deliberately uses this same visible grip as its right-hand landmark, but it only adjusts the arm's rest orientation. It does not relocate the right arm joint or tool socket toward the hip. `RangerToolPresentation` and the existing tool-action timing remain unchanged. Tools continue to ask the appearance presentation for one right-hand mount and automatically follow the visible arm swing and action rotation.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. The previous Quaternius peasant/ranger comparison assets remain in the repository as rollback/audit material, but they are no longer the active runtime presentation.

## Stable systems deliberately unchanged

This presentation fix does not change movement speed, jump or double-jump physics, collision, terrain generation, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes Hero M verification through `verify:prisma-native`. `verify:hero-m-player` explicitly runs `verify-hero-m-arm-motion.mjs` so the shoulder-pivot regression is part of the normal CI path rather than an orphaned script.

The static Hero M presentation verifier pins the segmented runtime asset, validates the compact 16-joint rig and visual scale, checks presentation-local grounding, center-support compensation, idle/run rotational retargeting, the double-jump flip/tuck, finite animated bounds, tool transfer, first-person visibility and Prisma fallback.

The load-space runtime regression reconstructs the shipped Hero M and Ranger assets and deliberately loads Hero M while the Ranger root is at world Y `-0.34`. It requires the final Hero M local grounding calibration and motion-pivot baseline to remain independent of world zero, then checks `Idle_A`, `Walking_A`, `Running_A`, elevation changes and airborne root following.

The arm-motion runtime regression reconstructs the shipped Hero M and KayKit Ranger assets through `HeroMArmMotionPresentation`. It requires both complete-arm joint positions to remain equal to their authored local shoulder positions during idle, walking, running and tool suppression. It verifies the right visible grip remains in a relaxed hip-region idle pose, walk produces measurable fore/aft hand travel, run produces a stronger arc, the circular shoulder motion produces measurable vertical hand bounce, the mirrored left/right endpoints travel in opposition, tool actions decay the extra locomotion swing, every Hero M matrix stays finite and the gameplay root never moves because of arm polish.

The compatibility verifier also rejects any return of animated-vertex sole grounding or a parallel rendered-terrain grounding authority, and requires the stable Ranger import to resolve through the final arm-motion layer.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear. The boots should remain aligned with the terrain while idle, walking and running without the whole character hovering at a fixed distance above the floor.

For the arms, confirm both shoulders remain visually attached in their authored positions and the hands rest naturally near the hips in idle without looking locked to them. During walking, each hand should swing clearly forward and backward from the shoulder and rise slightly near the ends of the arc. During running, that swing and bounce should be more pronounced, with the two sides moving in opposition. Confirm there is no appearance of either wrist being pinned to the hip. Then confirm tools still follow the visible right hand, tool actions do not retain the extra locomotion swing, first-person still hides the presentation correctly, and no movement/collision/construction behavior changed.
