# Prisma Native Humanoid Runtime

## Status

The Prisma3D humanoid is a player-facing presentation layer only. The established KayKit Ranger controller and medium rig remain the animation and gameplay authority.

The native Prisma mesh must not become a second movement, collision, tool, camera, or animation system.

## Runtime boundary

`RangerToolPresentation` continues to construct `RangerAppearancePresentation` after `RangerController.load()` completes.

`src/player/RangerAppearancePresentation.js` is the compatibility seam used by stable code. It resolves the historical Ranger-facing name to `MasculinePrismaHumanoidPresentation`, which extends the proven `PrismaRiggedHumanoidPresentation` retargeter with presentation-only proportions and hand-socket calibration.

`PrismaRiggedHumanoidPresentation` extends `SimpleHumanoidPresentation`. The Simple humanoid therefore remains the safe fallback whenever the KayKit rig cannot be resolved or the native Prisma body cannot be loaded or validated.

The ownership model is:

- `RangerController`: movement, grounding, collision, camera modes, KayKit animation mixer, tool actions, spear anchors and cinematics;
- KayKit medium rig: animation authority;
- `PrismaRiggedHumanoidPresentation`: retargets the native Prisma skeleton from KayKit joint motion and owns scale/style/socket adaptation;
- `MasculinePrismaHumanoidPresentation`: owns the device-driven torso geometry sculpt, relaxed arm bind offsets and palm-center socket calibration only;
- `RangerToolPresentation`: owns equipped work-tool visuals and transfers them to the visible Prisma right-hand socket when native activation succeeds;
- `SimpleHumanoidPresentation`: fallback visible body and existing rig-binding safety net.

## Asset packaging

The native body is stored as 12 generated packed chunks under `src/player/prisma-native/generated/`.

`PrismaHumanoidAsset.js` imports those chunks directly into the application bundle. The runtime therefore does not depend on a parallel set of public text fragments or on 12 network fetches before the body can appear.

The packed format remains guarded by the existing parser contract:

- signature: `PRH2`;
- vertices: `3779`;
- indices: `22662`;
- native joints: `31`;
- packed SHA-256 metadata: `5437ac02efa01f893cdf887d7ff74da3535b892763dcff6eb3d5bd1c11acddc3`.

## Source recovery and generation

The original user-supplied archive is preserved in `assets-source/prisma/Group.prisma`. Regenerate with `python3 scripts/generate-prisma-native.py` (Python dependencies: `numpy`, `msgpack`). The generator reads the original polygon triangulation, four skin influences and inverse-bind matrices. It converts handedness consistently, reconstructs local bind transforms from the source inverse-bind matrices, computes smooth normals and writes the twelve packed modules plus their checksum. Editable Prisma pose transforms do not replace the source bind pose.

The packed source geometry remains unchanged on disk by presentation polish. Runtime scale, stylized shading, silhouette tuning and the tool socket are presentation concerns so future source regeneration cannot silently bake gameplay-facing offsets into the native asset.

## Retargeting coordinate and bind-pose contract

The retarget boundary owns both conversions explicitly:

- Prisma native forward is rotated by 180 degrees at the presentation root so the visible body faces the same direction as the established player/controller;
- KayKit source motion is measured from the actual GLTF skeleton bind pose, never from whichever Idle/Walk/Run frame happens to be active when the presentation is constructed;
- source animation deltas are conjugated through the Prisma-to-player basis before they are applied to the Prisma bind skeleton;
- hip/root translation deltas are converted through the same basis so animation-space translation remains aligned after the 180-degree visual correction;
- the live KayKit pose is restored immediately after bind-pose capture, so the compatibility layer never resets or owns the gameplay animation state.

This remains `global-bind-delta-v2`. The controller, movement direction, collision capsule, camera and animation mixer remain unchanged.

## Player-facing scale, surface and masculine silhouette

The player-facing Prisma root uses a presentation-only uniform scale of `1.12`. Grounding compensation is derived from the native mesh bounding-box minimum, so enlarging the rendered body does not move the accepted foot/terrain plane. Collision radius, traversal speed, camera height and world scale are unchanged.

The active native material remains matte and faceted (`faceted-cartoon-v1`): flat shading is enabled and roughness stays high. Packed skin weights and topology remain unchanged.

The first geometry-sculpt pass was technically valid but device feedback showed that it was visually too subtle at normal mobile camera distance. The current `readable-masculine-v2` profile therefore uses a full torso-height width/depth curve rather than multiplying only the contribution of a few individual torso bones.

The runtime identifies torso-dominant vertices from the existing skin weights, excludes limb-dominant vertices, measures that torso span, and applies a smooth bind-space profile from hips through waist, ribcage and shoulder line. The waist narrows to about `0.92×`, the upper ribcage broadens progressively, and the shoulder region reaches about `1.26×` width with up to roughly `1.17×` chest depth. Because this happens on a cloned render geometry, the skeleton keeps neutral scale and the KayKit rotation deltas remain unchanged.

The shoulder and upper-arm bind origins also receive larger position-only offsets than the first pass: the shoulder chain is moved farther outward and forward so the relaxed hands should read beside/slightly ahead of the hips instead of disappearing behind the pelvis. These offsets still do not change collision, movement or animation timing.

Regression diagnostics now record both the requested profile factors and the actual upper-torso width/depth gain produced on the loaded native mesh. This prevents a future pass from technically touching vertices while remaining visually negligible.

## Visible palm tool socket

The visible prop socket remains parented under the Prisma `rightHand` bone, but it is no longer centered on the wrist origin. The current profile advances the socket farther along the forearm-to-hand direction into the visible palm and calibrates its bind orientation so prop local +Y is upright at rest. This gives axes, hammer, pickaxe, shovel and sword one stable palm-centered grip basis while preserving their established world scale through inverse presentation-scale compensation.

`RangerToolPresentation` still owns work-tool visuals and action timing. During native load/fallback it can remain on the legacy KayKit hand, then its single tool root transfers to the active Prisma palm mount. No second tool action system is introduced.

The handheld torch uses `VisibleHandTorchRuntimeController`, a thin adapter over the existing torch runtime. Fuel, flame, light, placement, save state and timing stay in `TorchRuntimeController`; only the handheld visual is transferred to the same visible Prisma palm basis.

The spear path remains deliberately unchanged because spear throwing has its own established controller-owned anchor/release system.

## Stable systems deliberately unchanged

This integration does not change player traversal, double jump, terrain collision, player collision, camera behavior, KayKit clips, controller tool-action timing, spear behavior, construction, world systems, UI, PWA/install behavior, or save data.

## Verification

`npm run check` includes `verify:prisma-native`. It verifies the real bundled gzip and checksum, topology, finite attributes, normalized weights, neutral skin deformation, production Ranger activation, true bind-pose capture, movement retargeting, the 180-degree facing basis, first-person visibility and failure fallback.

The same verification guards the `1.12` grounded presentation scale, matte faceted material, readable full-torso masculine profile, measurable upper-body width/depth gain, neutral animation-scale contract, palm-centered visible tool socket, inverse scale compensation and transfer of an equipped axe root from the legacy/fallback location to the active Prisma hand. A companion polish regression also verifies the visible-palm handheld torch adapter and Sprout's reduced relative presentation scale.

## Device verification

After merge/deploy, verify on a physical phone:

1. the upper body is visibly broader than the previous build at normal gameplay zoom, with a clear chest/shoulder V without becoming exaggerated;
2. idle/walk/run/jump/double-jump remain anatomically correct and the hands hang beside or slightly ahead of the hips rather than behind the pelvis;
3. axe, hammer, pickaxe, shovel and sword visibly pass through the right palm and follow the hand during their actions;
4. the handheld torch sits upright through the visible palm and its light/flame still follow correctly;
5. the faceted/cartoon surface still reads cleanly at normal mobile distance;
6. the larger player remains correctly grounded and scaled against buildings, trees and Sprout;
7. spear throwing and first-person visibility remain unchanged;
8. failure to load the native body still leaves the Simple humanoid usable rather than breaking gameplay.
