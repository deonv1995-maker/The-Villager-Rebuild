# Prisma Native Humanoid Runtime

## Status

The Prisma3D humanoid is a player-facing presentation layer only. The established KayKit Ranger controller and medium rig remain the animation and gameplay authority.

The native Prisma mesh must not become a second movement, collision, tool, camera, or animation system.

## Runtime boundary

`RangerToolPresentation` continues to construct `RangerAppearancePresentation` after `RangerController.load()` completes.

`src/player/RangerAppearancePresentation.js` is the compatibility seam used by stable code. It resolves the historical Ranger-facing name to `PrismaRiggedHumanoidPresentation`.

`PrismaRiggedHumanoidPresentation` extends `SimpleHumanoidPresentation`. The Simple humanoid therefore remains the safe fallback whenever the KayKit rig cannot be resolved or the native Prisma body cannot be loaded or validated.

The ownership model is:

- `RangerController`: movement, grounding, collision, camera modes, KayKit animation mixer, tool actions, spear anchors and cinematics;
- KayKit medium rig: animation authority;
- `PrismaRiggedHumanoidPresentation`: retargets the native Prisma skeleton from KayKit joint motion and owns presentation-only scale/style/socket adaptation;
- `RangerToolPresentation`: owns equipped work-tool visuals and transfers them to the visible Prisma right-hand socket when native activation succeeds;
- `SimpleHumanoidPresentation`: fallback visible body and existing rig-binding safety net.

## Asset packaging

The native body is stored as 12 generated packed chunks under `src/player/prisma-native/generated/`.

`PrismaHumanoidAsset.js` imports those chunks directly into the application bundle. The runtime therefore does not depend on a parallel set of public text fragments or on 12 network fetches before the body can appear.

The older single public `prisma-humanoid-v1.part8.txt` fragment was incomplete and has been removed so there is only one runtime asset source.

The packed format remains guarded by the existing parser contract:

- signature: `PRH2`;
- vertices: `3779`;
- indices: `22662`;
- native joints: `31`;
- packed SHA-256 metadata: `5437ac02efa01f893cdf887d7ff74da3535b892763dcff6eb3d5bd1c11acddc3`.

## Source recovery and generation

PR #274's packed payload was internally corrupted. Its screenshots showed the Simple fallback, so they did not establish native mesh or retargeting quality. The speculative `device-humanoid-v2` shape adjustment has been removed.

The original user-supplied archive is preserved in `assets-source/prisma/Group.prisma`. Regenerate with `python3 scripts/generate-prisma-native.py` (Python dependencies: `numpy`, `msgpack`). The generator reads the original polygon triangulation, four skin influences and inverse-bind matrices. It converts handedness consistently, reconstructs local bind transforms from the source inverse-bind matrices, computes smooth normals and writes the twelve packed modules plus their checksum. Editable Prisma pose transforms do not replace the source bind pose.

The packed source geometry remains unchanged by presentation polish. Scale, stylized shading, minor shoulder spacing and the tool socket are runtime presentation concerns so future source regeneration cannot silently bake gameplay-facing offsets into the native asset.

## Retargeting coordinate and bind-pose contract

Device review after the native body became active exposed two separate retargeting faults: the body faced 180 degrees away from the established player forward direction, and its limbs remained biased toward the Prisma source bind pose while KayKit locomotion animated underneath it. This produced backward-looking running, knees that appeared to bend the wrong way, and arms that stayed raised while still moving.

The retarget boundary owns both conversions explicitly:

- Prisma native forward is rotated by 180 degrees at the presentation root so the visible body faces the same direction as the established player/controller;
- KayKit source motion is measured from the actual GLTF skeleton bind pose, never from whichever Idle/Walk/Run frame happens to be active when the presentation is constructed;
- source animation deltas are conjugated through the Prisma-to-player basis before they are applied to the Prisma bind skeleton;
- hip/root translation deltas are converted through the same basis so animation-space translation remains aligned after the 180-degree visual correction;
- the live KayKit pose is restored immediately after bind-pose capture, so the compatibility layer never resets or owns the gameplay animation state.

This remains `global-bind-delta-v2`. The controller, movement direction, collision capsule, camera and animation mixer remain unchanged.

## Presentation scale and cartoon surface

Device review after the retarget fix showed that the native body was readable but slightly undersized and visually too smooth compared with the low-poly world.

The player-facing Prisma root therefore uses a presentation-only uniform scale of `1.12`. The scale is applied above the native skeleton and the root receives a grounding compensation derived from the native mesh bounding-box minimum so the accepted foot/terrain plane does not move downward when the body becomes larger. Collision radius, traversal speed, camera height and world scale are not changed.

The active native material is switched to a matte faceted surface (`faceted-cartoon-v1`) by enabling flat shading and retaining high roughness. This deliberately changes only the rendered surface; packed geometry, skin weights and topology stay untouched. A small lateral shoulder offset (`relaxed-shoulder-v1`) gives the hanging arms slightly more breathing room without creating a competing animation system or modifying KayKit clips.

## Visible hand tool socket

Equipped work tools previously remained parented to the hidden KayKit source hand. Once the visible Prisma body became the active character, that architectural mismatch made the tools appear beside the hand instead of inside it, especially after presentation-scale changes.

The native presentation now exposes one `prisma-right-hand-tool-mount` under the visible `rightHand` bone. The socket compensates for the character-only `1.12` scale so axes/hammer/pickaxe/shovel/sword keep their established world size. `RangerToolPresentation` retains temporary legacy mounting during load/fallback, then transfers its single tool root to this visible socket as soon as the Prisma body is active. Tool-action timing and KayKit skeletal actions remain owned by the existing controller.

The spear path is deliberately unchanged in this pass because spear throwing has its own established controller-owned anchor/release system and was not the device regression being corrected.

## Stable systems deliberately unchanged

This integration does not change player traversal, double jump, terrain collision, player collision, camera behavior, KayKit clips, controller tool-action timing, spear behavior, construction, world systems, UI, PWA/install behavior, or save data.

## Verification

`npm run check` includes `verify:prisma-native`. It verifies the real bundled gzip and checksum, topology, finite attributes, normalized weights, neutral skin deformation, actual production Ranger activation, movement clip retargeting, first-person visibility and failure fallback. The retarget regression constructs the presentation while a real production movement clip is already sampled, verifies that the true KayKit bind pose is still captured, verifies that the live animation pose is restored, verifies the 180-degree Prisma/player facing basis, and verifies that native upper-arm motion leaves the raised bind pose with the same rotation magnitude as its KayKit source driver.

The same verifier now also guards the `1.12` grounded presentation scale, matte flat-shaded material, visible right-hand socket, inverse scale compensation and transfer of an equipped axe root from the legacy/fallback location to the active Prisma hand.

Device verification is still required because the important acceptance criteria are visual and animated:

1. the Prisma body replaces the Simple fallback after load on the production KayKit player;
2. the visible body faces the same direction that the controller is moving;
3. idle, walk, run, jump and double jump remain unchanged;
4. the larger body still stands on the same terrain plane and reads at a better scale against floors, wall panels, trees and Sprout;
5. arms lower into locomotion, hang with a more relaxed shoulder silhouette and do not return to the raised native bind pose;
6. shoulders, elbows, wrists, hips, knees, ankles and feet follow the correct side and bend in the expected anatomical direction;
7. faceted shading reads as lightly cartoon/low-poly rather than smooth plastic, without becoming visually noisy at mobile distance;
8. axe, hammer, pickaxe, shovel and sword sit through the visible right hand instead of floating beside the character and remain aligned during their actions;
9. spear throwing remains unchanged because it still uses the controller-owned spear path;
10. first-person body visibility behavior remains unchanged;
11. failure to load or validate the native body leaves the Simple humanoid usable rather than breaking gameplay.
