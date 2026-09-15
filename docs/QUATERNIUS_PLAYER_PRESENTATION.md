# Quaternius Player Presentation Trial

## Status

The current phone-facing comparison uses the authored Quaternius `Male_Ranger` outfit with the shared Quaternius male head. The preceding `Male_Peasant` pass proved the authored-body approach, but device screenshots still read more like a generic villager than the game's stranded survival lead. The ranger is therefore the next controlled visual candidate.

This remains a presentation change only. The established KayKit Ranger controller, collision, grounding, camera, movement state, animation mixer and gameplay systems remain authoritative. `RangerAppearancePresentation` still resolves through the historical `QuaterniusPeasantPresentation` class name during the comparison so gameplay-facing imports do not churn every time candidate artwork changes. The masculine Prisma implementation remains the immediate visual fallback.

## Why the male ranger is the next candidate

The inspected `male_ranger.glb` is from the same CC0 Quaternius modular-character family and uses the same universal 65-joint skeleton as the peasant candidate. It therefore lets the project compare a substantially different authored silhouette without changing the retargeting architecture.

Repository-side inspection confirmed ten skinned meshes on one 65-joint skeleton, including authored ranger bracers, belts, boots, pauldron and a hood. The required pelvis/spine/neck/head, clavicle/arm/hand/finger and thigh/calf/foot/toe joints are all present. Authored bounds are approximately 1.869 m tall before the existing presentation scale.

The ranger body already owns `Male_Ranger_Head_Hood`, so the separate `hair_simpleparted` module is intentionally not rendered in this comparison. The shared male face/head remains a separate authored module underneath the hood. This avoids a new hair-versus-hood clipping seam and keeps the comparison focused on the outfit/body choice.

## Runtime assets and provenance

Active comparison assets under `public/assets/quaternius/player/` are:

- `male_ranger.glb` — 1,617,696 bytes — SHA-256 `513203b0eadc4849aeba0e24effd5dc85b0b072ddc0d0b14b6242c0ba1847eea`;
- `male_head.glb` — 232,884 bytes — SHA-256 `576e31b92bc2fab0b8ca6265d880d546370c3a4b80d797858cda121958c09569`.

The previous `male_peasant.glb` and `hair_simpleparted.glb` remain in the repository temporarily as comparison/rollback assets until one authored character is accepted on device. All are CC0 Quaternius derivatives from Modular Character Outfits - Fantasy and Universal Base Characters, with provenance pinned in `licenses/quaternius-player-candidate.md`.

## Animation boundary

No second character controller or animation mixer exists. For each mapped Quaternius joint, the presentation reads the current KayKit joint rotation, calculates the delta from the captured KayKit bind rotation, applies the existing small bounded presentation gain, applies that delta to the authored Quaternius bind rotation, preserves the existing five-degree lower-arm relaxation, then restores authored local positions and scales unchanged.

The ranger candidate deliberately keeps the same `1.08` presentation scale, retarget gains and palm/tool socket calibration as the peasant comparison. Holding those values constant means the next device test is primarily judging the character artwork and silhouette instead of mixing a body swap with another scale/animation experiment.

## Scale, grounding and tools

The `Male_Ranger` authored bounds are roughly 1.869 m tall. At the unchanged uniform presentation scale of `1.08`, the rendered candidate is roughly 2.02 m tall. This remains visual only: player collision, controller dimensions, terrain grounding and traversal are unchanged. Grounding is derived from the scaled authored bounding-box minimum.

The right-hand work-tool socket remains the existing palm-centered, forearm-aligned presentation mount. The current screenshots also show that the temporary generated work-tool models themselves are still oversized/roughly proportioned, especially the hammer. That prop-shape issue is intentionally not solved in this character-comparison pass; fitting or replacing tool props should happen after the player body is chosen so tool calibration is not repeated for discarded candidates.

## Failure behavior

If the ranger body or shared head fails to load, lacks required joints, produces invalid bounds or otherwise fails validation, the presentation leaves the proven Prisma character visible. The Simple humanoid fallback remains below Prisma.

## Stable systems deliberately unchanged

This comparison does not modify traversal, walk/run speed, jump/double-jump, collision, terrain, camera modes, KayKit locomotion/tool clips, tool timing, spear behavior, harvesting, construction, ecology, world generation, day/night, UI, save data or PWA/install behavior.

## Automated verification

`npm run check` still includes `scripts/verify-quaternius-peasant-presentation.mjs` under its historical filename. The verification now pins the exact ranger-body bytes/hash, confirms the ranger hood and bracer meshes, validates the 65-joint universal skeleton on both active modules, confirms no separate hair module is attached, checks scale/grounding, bounded motion gain, relaxed forearms, palm-centered work-tool transfer, first-person visibility, finite animation bounds and Prisma fallback behavior.

## Device verification required after deployment

On a physical phone, compare the ranger candidate against the screenshots from the male-peasant pass at the same normal gameplay distance. Check front, side and rear idle plus walk/run. In particular judge overall silhouette, shoulders/arms, hood/head fit, face readability, boots/legs, door scale and how well the outfit belongs beside Sprout and the cabin. Do not use the current hammer head as the deciding factor for the character; its prop proportions are a separate presentation task. If this ranger reads better, the next pass can promote/rename the generic Quaternius seam and then calibrate the work-tool models once against the chosen body.
