# Hero M Player Presentation

## Status

Hero M is the selected player-facing character presentation. The choice intentionally moves the game's protagonist toward a more playful, readable low-poly style while preserving the established player architecture.

This remains a presentation-layer system. The KayKit Ranger is still the sole gameplay and animation authority for traversal, collision, camera modes, locomotion, jump physics, tool actions and combat timing. `RangerAppearancePresentation` resolves to `HeroMPresentation`, which retargets the already-running KayKit pose onto Hero M's compact deform rig. The proven masculine Prisma presentation remains the immediate visual fallback if Hero M cannot load or validate.

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

Gameplay grounding deliberately uses the highest support sampled under the player's footprint so the controller does not clip into uneven terrain. On sloped low-poly terrain that support height can sit above the terrain directly beneath the character's center, which made Hero M visibly hover. The Hero M presentation now compensates visually toward the center walkable support, bounded to a maximum 0.30 m downward correction, and settles the rendered boots 0.03 m into the surface. The gameplay root, collision and platform traversal remain untouched. The last grounded visual offset is retained while airborne so jumps do not pop vertically.

## Double-jump presentation

The first jump remains unchanged. When the existing controller enters jump stage 2, Hero M performs one presentation-only 360-degree forward flip over 0.58 seconds. The flip is applied around a centered Hero M motion pivot, so it does not alter the gameplay root, jump velocity, collision, camera or landing logic. After one full rotation the presentation returns to its normal upright basis while the existing second-jump physics continue normally.

## Tool grip

Hero M does not expose a conventional finger/palm bone chain. The visible right-hand tool socket is calibrated from the actual skinned vertices influenced by `DEF_hand_R`. The presentation selects the outer region of that weighted hand geometry, places the mount there, and aligns the tool axis from the arm joint toward the visible grip point.

`RangerToolPresentation` and the existing tool-action timing remain unchanged. They continue to ask the appearance presentation for one right-hand mount, so no competing tool system is introduced.

## Fallback and retained comparison assets

If Hero M fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the masculine Prisma body remains visible and playable. The previous Quaternius peasant/ranger comparison assets remain in the repository as rollback/audit material, but they are no longer the active runtime presentation.

## Stable systems deliberately unchanged

This presentation polish does not change movement speed, jump or double-jump physics, collision, terrain generation, camera behavior, construction, harvesting, ecology, world generation, day/night, save data, UI, PWA/install behavior, spear behavior, tool timing or KayKit animation ownership.

## Automated verification

`npm run check` includes the Hero M verification through `verify:prisma-native`. The regression gate pins the segmented compressed and decompressed runtime bytes, validates the 16-joint rig and calibrated scale, verifies center-support visual grounding, confirms a relaxed idle arm direction and meaningful running arm swing, verifies the stage-2 front flip and centered motion pivot, exercises KayKit movement retargeting, checks finite animated bounds, confirms visible-hand tool transfer, checks first-person visibility, and proves that an intentional Hero M load failure falls back to Prisma.

## Device verification required after deployment

On a physical phone, verify Hero M at normal gameplay distance from the front, side and rear. Confirm boots visually meet flat and sloped terrain; idle hands rest naturally; walk/run arms swing rather than staying raised; the first jump stays normal; the second jump performs a forward flip; tools remain aligned to the visible right hand; first-person still hides the body correctly; and no existing gameplay interaction changed because of the presentation polish.
