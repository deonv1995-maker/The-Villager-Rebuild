# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The choice intentionally moves the game's protagonist toward a more playful, readable low-poly style while preserving the established player architecture.

This is a presentation-only change. The KayKit Ranger remains the sole gameplay and animation authority for traversal, grounding, collision, camera modes, locomotion, jumping, tool actions and combat timing. `RangerAppearancePresentation` now resolves to `HeroMPresentation`, which retargets the already-running KayKit motion onto Hero M's compact deform rig. The proven masculine Prisma presentation remains the immediate visual fallback if Hero M cannot load or validate.

## Source and runtime derivative

The source asset was supplied by the project owner in `FBX Assets.zip` as `Characters/hero_m.fbx` on 2026-09-15. The source FBX is 5,525,356 bytes with SHA-256 `869f0dfdcc02c5ebd82b4bf26ddeb34b19a7f7b7acc41603fa9eeeb11353acbe`.

For the browser/PWA build, the source was converted to a compact skinned GLB and then gzip-compressed for repository/runtime delivery. The runtime derivative is stored as:

- `public/assets/player/hero_m.glb.gz` — 28,058 bytes — SHA-256 `f796af888bc53616095121dd78ff65772950e3b673dd0dbea8da0156c6015bbf`;
- decompressed GLB — 244,132 bytes — SHA-256 `ae0d4a49a68412edba8e56fdc1f2c46f73c8188ee5eacd916f54709e794799b4`.

The original FBX contained its own animation stacks. They are deliberately omitted from the runtime derivative so there is still exactly one animation authority: the existing KayKit player rig.

## Rig and retarget boundary

Hero M uses a compact 16-joint deform skeleton. The presentation maps the gameplay-facing body regions onto that authored rig rather than adding another controller or mixer. Pelvis, spine, head, both arm/hand pieces and the segmented leg chains receive bounded bind-delta rotations derived from the current KayKit pose. Authored Hero M joint positions and scales remain unchanged.

Because Hero M's arm construction is intentionally chunky and simplified, the presentation maps each complete arm/hand piece from the corresponding KayKit upper-arm motion instead of inventing unsupported elbow/wrist joints. This keeps the playful authored proportions intact while still giving idle/walk/run/jump/tool motion from the proven gameplay rig.

## Scale and grounding

The authored Hero M is approximately 2.754 m tall in source units. A presentation-only uniform scale of `0.73` brings the rendered height to roughly 2.01 m, close to the established player-world scale. Collision dimensions, terrain grounding authority and traversal physics are unchanged.

Grounding is calculated from the scaled rendered bounds and applied only to the Hero M presentation root.

## Tool grip

Hero M does not expose a conventional finger/palm bone chain. The visible right-hand tool socket is therefore calibrated from the actual skinned vertices influenced by `DEF_hand_R`. The presentation selects the outer region of that weighted hand geometry, places the mount there, and aligns the tool axis from the hand joint toward the visible grip point.

`RangerToolPresentation` and the existing tool-action timing remain unchanged. They continue to ask the appearance presentation for one right-hand mount, so no competing tool system is introduced.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. The previous Quaternius peasant/ranger comparison assets remain in the repository as rollback/audit material, but they are no longer the active runtime presentation.

## Stable systems deliberately unchanged

This pass does not change traversal, speed, jump/double-jump, collision, terrain, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes the Hero M verification through `verify:prisma-native`. The regression gate pins the compressed and decompressed runtime bytes, validates the 16-joint rig, checks the calibrated scale, exercises KayKit movement retargeting, verifies finite animated bounds, confirms visible-hand tool transfer, checks first-person visibility, and proves that an intentional Hero M load failure falls back to Prisma.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear in idle, walk, run, jump and double-jump. Confirm that the playful proportions read clearly, the segmented arms and legs move acceptably, the character is grounded at the expected scale beside Sprout/buildings, tools sit in the visible right hand, first-person still hides the body correctly, and no existing gameplay interaction changed because of the visual swap.
