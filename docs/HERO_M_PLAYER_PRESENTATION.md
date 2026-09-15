# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The choice intentionally moves the game's protagonist toward a more playful, readable low-poly style while preserving the established player architecture.

This remains a presentation-layer system. The KayKit Ranger is still the sole gameplay and animation authority for traversal, collision, camera modes, locomotion, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMVisibleSoleGroundingPresentation`, which extends `HeroMPresentation`: the base presentation retargets the already-running KayKit pose onto Hero M's compact deform rig, while the final grounding seam measures the posed visible boot soles and removes residual visual hover without moving the gameplay root. The proven masculine Prisma presentation remains the immediate visual fallback if Hero M cannot load or validate.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7b7acc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB, gzip-compressed, then stored as three base64 text segments so GitHub delivery remains reliable:

- `public/assets/player/hero_m.glb.gz.part0.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part1.b64` — decoded payload 5,200 bytes;
- `public/assets/player/hero_m.glb.gz.part2.b64` — decoded payload 5,194 bytes;
- combined gzip payload — 15,594 bytes — SHA-256 `55416d924d90821f0a559ed7f322bd7c341638422a68a5d0f63222b5738c48b8`;
- decompressed compact GLB — 40,052 bytes — SHA-256 `c8355855a6c409ed0f3459a83fa0bc43958dfcbbd47d2f1dca1dc7dc3002f79c`.

The original FBX contained its own animation stacks. They are deliberately omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. The presentation maps the gameplay-facing body regions onto that authored rig rather than adding another controller or animation mixer. Pelvis, spine, head, both complete arm/hand pieces and the segmented leg chains receive bounded bind-delta rotations derived from the current KayKit pose. Authored Hero M joint positions and scales remain unchanged.

Hero M does not contain a conventional upper-arm/elbow/forearm/hand chain. Each complete arm is driven by the corresponding KayKit upper-arm motion. A geometry-calibrated rest orientation is applied first so the hands sit naturally down beside the body while idle. Walk and run then apply the existing KayKit arm swing around that relaxed base, with a modest run gain for readability. Tool and jump motions continue through the same retarget seam.

## Scale and visual grounding

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Collision dimensions and traversal physics are unchanged.

Gameplay grounding deliberately uses the highest support sampled under the player's footprint so the controller does not clip into uneven terrain. The first Hero M grounding pass compensated from that controller support toward the walkable surface at the player's center. Physical-device review first exposed a remaining retarget gap at the visible boot soles. A later device screenshot on the sloped crash-site shoreline exposed a second issue: the sole-grounding edge guard was comparing walkable support against the higher max-footprint gameplay root, so legitimate steep terrain could be misclassified as unsupported space and the character could remain visibly suspended above the rendered ground.

A subsequent phone screenshot after that slope fix exposed a third calibration problem. The visible-sole pass was choosing the absolute lowest clearance from its sampled lower-leg/boot vertices. A single unusually low toe/internal vertex could already sit near the terrain while the broad visible boot mass was still clearly floating. Because that one point became the contact authority, the residual correction could collapse to zero even though both boots visibly remained above the ground.

The production presentation therefore has two presentation-only grounding stages. `HeroMPresentation` keeps the bounded center-support compensation used for uneven terrain. `HeroMVisibleSoleGroundingPresentation` then samples a calibrated lower band of posed skinned vertices from both boots. The bounded sample set is distributed through that whole lower band instead of taking only the absolute lowest vertices. While grounded and idle, the runtime calculates a median clearance independently for each boot and uses the nearer boot as the contact authority. This rejects isolated low geometric outliers without forcing the higher boot through uneven terrain. The learned correction is applied only to Hero M's motion pivot and is retained through locomotion and airborne states so running and jumping do not acquire frame-by-frame vertical jitter.

The sole-support edge guard remains anchored to the walkable surface at the player's center rather than the max-footprint gameplay root. This keeps genuine downhill/shoreline support valid even when the collision root is substantially higher, while still rejecting a foot sample that projects far below the center support at the edge of a raised floor. The sole correction never raises the character, is capped at 0.68 m so steep-footprint residual gaps can be closed, and never changes the gameplay root, collision, terrain or jump physics.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. During the flip, a smooth tuck envelope pulls the complete Hero M presentation into a compact ball-like silhouette: the tuck builds from zero at takeoff, reaches maximum compression at the middle of the rotation, then releases back to the normal silhouette before the flip completes. At maximum tuck the centered motion pivot scales to `0.84` horizontally/depth-wise and `0.62` vertically.

The flip and tuck are both applied above the authored rig on the centered Hero M motion pivot. They do not modify the gameplay root, jump velocity, collision, camera, landing logic, KayKit animation ownership or Hero M's calibrated base scale. If the character lands or jump stage resets early, the flip and tuck are immediately cleared so the grounded silhouette cannot remain compressed. The visible-sole correction is retained while airborne and is applied after the base flip/tuck presentation update, so the grounding fix does not compete with the second-jump animation.

## Tool grip

Hero M does not expose a conventional finger/palm bone chain. The visible right-hand tool socket is calibrated from the actual skinned vertices influenced by `DEF_hand_R`. The presentation selects the outer region of that weighted hand geometry, places the mount there, and aligns the tool axis from the arm joint toward the visible grip point.

`RangerToolPresentation` and the existing tool-action timing remain unchanged. They continue to ask the appearance presentation for one right-hand mount, so no competing tool system is introduced.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. The previous Quaternius peasant/ranger comparison assets remain in the repository as rollback/audit material, but they are no longer the active runtime presentation.

## Stable systems deliberately unchanged

This presentation polish does not change movement speed, jump or double-jump physics, collision, terrain generation, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes the Hero M verification through `verify:prisma-native`. The existing regression gate pins the segmented runtime asset, validates the 16-joint rig and calibrated scale, checks center-support grounding, idle/run arm behavior, verifies that the first jump remains untucked, verifies the stage-2 360-degree front flip reaches its full compact tuck at mid-rotation and returns to normal scale afterward, exercises KayKit retargeting, checks finite animated bounds, confirms visible-hand tool transfer, checks first-person visibility and proves Prisma fallback. The visible-sole grounding verifier additionally pins the production compatibility boundary to the sole-grounded Hero M class, checks bounded/no-raise correction policy, requires posed skinned-vertex sampling, reproduces the steep-slope case where center support sits well below the max-footprint gameplay root, preserves the raised-floor edge guard, reproduces the device case where one or two low vertices masked a roughly 22 cm visible boot gap, verifies the per-foot median contact policy, and rejects gameplay-root or jump-physics mutation.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear. Confirm the broad visible boot soles now meet flat ground and sloped terrain without a persistent gap; check that the boots do not sink noticeably into the surface; idle hands rest naturally; walk/run arms swing rather than staying raised; the first jump stays normal; the second jump visibly tucks into a compact ball through the forward flip and opens cleanly before landing; tools remain aligned to the visible right hand; first-person still hides the body correctly; and no existing gameplay interaction changed because of the presentation polish.
