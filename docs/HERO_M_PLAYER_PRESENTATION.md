# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The KayKit Ranger remains the sole gameplay and animation authority for traversal, collision, locomotion, camera modes, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves through `HeroMVisibleSoleGroundingPresentation`, which now serves as a stable compatibility/contact-anchor layer above `HeroMPresentation`; it no longer owns a sampled-sole grounding controller.

The masculine Prisma presentation remains the immediate visual fallback if Hero M cannot load or validate. Previous Quaternius comparison assets remain in the repository only as rollback/audit material.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7bacc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB, gzip-compressed, then stored as three base64 text segments:

- `public/assets/player/hero_m.glb.gz.part0.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part1.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part2.b64` — decoded payload 5,194 bytes;
- combined gzip payload — 15,594 bytes — SHA-256 `55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8`;
- decompressed compact GLB — 40,052 bytes — SHA-256 `c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c`.

The source FBX animation stacks are intentionally omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. The presentation maps gameplay-facing body regions onto that authored rig instead of creating a second controller or mixer. Pelvis, spine, head, both complete arm/hand pieces and the segmented leg chains receive bounded bind-delta rotations derived from the current KayKit pose.

The Hero M pelvis also receives the KayKit hip's animated local translation. That translation is scaled from source hip-to-head height to Hero M pelvis-to-head height and clamped to the proven `0.75–1.35` proportional range. This presentation-only skeletal motion preserves vertical body bob and local sway so idle, walking and running move the torso together with the legs. The gameplay root still owns world translation, collision, support height and jumping.

Hero M does not contain a conventional upper-arm/elbow/forearm/hand chain. Each complete arm is driven from the corresponding KayKit upper-arm motion. A geometry-calibrated rest orientation keeps the hands naturally down beside the body at idle; walk and run reuse the existing KayKit arm swing, with a modest run gain for readability.

## Scale

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Gameplay collider dimensions and traversal physics are unchanged.

## Grounding architecture

### Root cause confirmed by physical-device review

The persistent device-visible hover was not primarily a terrain, collision or animated-foot problem. It originated during Hero M asset initialization.

`HeroMPresentation` previously added the fresh `candidateRoot` underneath `visualRoot` **before** measuring `new THREE.Box3().setFromObject(candidateRoot)`. Because `visualRoot` is already parented to the gameplay Ranger root, those bounds included the player's current world-space Y elevation. The code then calculated:

`groundingOffsetY = -bounds.min.y - HERO_M_GROUND_SETTLE`

and later reused that value as a **local** `candidateRoot.position.y` offset.

That mixed coordinate spaces. If Hero M finished loading while the Ranger stood at world Y = `-0.34`, the local presentation inherited roughly `+0.34 m` of unwanted lift and the entire character appeared suspended above the terrain. If it loaded above world zero, the same bug could bias the character downward. Earlier automated checks normally constructed the test Ranger at world Y = `0`, so they could pass while a physical phone showed the character floating elsewhere in the island.

### Correct calibration order

Hero M grounding is now calibrated entirely in presentation-local space:

1. Load the Hero M body beneath an unattached `candidateRoot` and apply the production presentation scale.
2. Capture the compact rig bind data and pelvis-motion scale.
3. Keep `candidateRoot` detached from the gameplay/player hierarchy.
4. Measure `candidateRoot` bounds while detached, so `bounds.min.y` contains only authored presentation geometry and scale.
5. Calculate the existing 3 cm settle offset from those local bounds.
6. Build the centered Hero M motion pivot and only then attach that completed presentation beneath `visualRoot`.

The candidate is no longer temporarily attached and removed. `candidateRoot.userData.groundingReferenceSpace` is recorded as `presentation-local-v1` so the coordinate-space decision is explicit and regression-testable.

This is a one-time authored-presentation calibration. It does not inspect world terrain, mutate gameplay root height, add collision logic, or accumulate a correction over time.

### Runtime support compensation

After local calibration, the existing `HeroMPresentation` center-support compensation remains responsible for small presentation-only differences between the gameplay root's highest sampled footprint support and the walkable surface at the character center. That correction is bounded and only recalculates while gameplay reports the Ranger as grounded; while airborne it retains the established offset so the gameplay root owns jump motion.

The previously added skinned-boot sampling/median correction is retired from the final grounding authority. It was useful diagnostically, but it was compensating downstream for a character whose base local transform could already be wrong. Keeping both systems would create competing height logic.

### Ground-contact rendering

`HeroMVisibleSoleGroundingPresentation` retains its class name for compatibility with existing player/tool imports, but its only Hero-M-specific responsibility beyond the corrected base presentation is exposing two rendering-only contact anchors. X/Z follows the animated left/right foot bones and Y uses the existing walkable-support seam. `CelestialShadowSystem` uses those anchors for compact foot-local ambient contact layers.

The contact anchors do not affect collision, movement, character height or animation authority.

## Historical fixes retained

Two earlier device findings remain valid and are intentionally preserved:

- Hero M originally discarded KayKit hip translation, making the feet animate under an unnaturally fixed pelvis. The pelvis translation retarget remains active.
- A later sampled-sole correction fed fresh-pose clearance into previous-frame correction state and could ratchet vertically. That temporal feedback path is now removed entirely from production grounding.

The 2026-09-16 screenshots established the more fundamental initialization issue: the complete character could start with the wrong local Y because world-space bounds were used to build a local transform. Fixing that boundary removes the large persistent hover without changing terrain or gameplay grounding.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. A smooth tuck envelope compresses the silhouette through the middle of the rotation and returns it to normal before landing. At maximum tuck the centered motion pivot scales to `0.84` horizontally/depth-wise and `0.62` vertically.

The flip/tuck remains above the authored rig on the Hero M motion pivot. It does not modify gameplay root position, jump velocity, collision, camera, landing logic, KayKit animation ownership or calibrated base scale. If the character lands or jump stage resets early, the presentation clears the flip/tuck immediately.

## Tool grip

Hero M does not expose a conventional finger/palm chain. The visible right-hand tool socket is calibrated from skinned vertices influenced by `DEF_hand_R`. The presentation places the mount on the visible outer hand region and aligns the tool axis from the arm joint toward the grip point.

`RangerToolPresentation` and existing tool-action timing remain unchanged. They continue to request one right-hand mount from the appearance presentation.

## Stable systems deliberately unchanged

This grounding correction does not modify movement speed, controller radius/height, jump or double-jump physics, collision resolution, terrain generation, construction terrain, camera behavior, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership. No new terrain-height system is introduced.

## Automated verification

`npm run check` includes Hero M verification through `verify:prisma-native`.

The grounding regression now pins the calibration order directly: `candidateRoot` must remain detached while bounds are measured, the motion pivot may only be attached afterward, and no temporary `visualRoot.add(candidateRoot)`/`removeFromParent()` sequence is allowed. It also rejects the retired per-frame skinned-sole feedback authority and guards against gameplay-root/jump mutation.

The production runtime probe reconstructs the shipped segmented Hero M asset and loads the real KayKit Ranger plus movement/general animation GLBs. It deliberately initializes the gameplay root and terrain support at world Y = `-0.34 m`, reproducing the coordinate-space condition that previously lifted the presentation toward world zero. The test requires Hero M's visible bounds to remain relative to that negative terrain elevation rather than world zero, exercises production `Idle_A`, `Walking_A` and `Running_A`, preserves KayKit-to-Hero-M pelvis translation, verifies both foot-local rendering anchors, then moves the same gameplay root upward by `0.8 m` and requires Hero M to follow one-for-one. An airborne check confirms a later jump still follows the gameplay root without changing the authored local calibration.

## Device verification required after deployment

On a physical phone, revisit the locations shown in the 2026-09-16 screenshots and verify Hero M from front, side and rear views. The entire character should now remain attached to the gameplay root's actual terrain elevation instead of hovering toward a fixed world-height reference. In idle, confirm the boots/body no longer show the large persistent air gap. Walk and run through the same meadow/crash-site area, then test slopes and raised construction floors. Finally verify the first jump and second-jump flip/tuck still leave the ground normally and land cleanly, tools remain aligned to the visible right hand, first-person still hides the body/contact cue correctly, and no gameplay collision or interaction behavior changed.
