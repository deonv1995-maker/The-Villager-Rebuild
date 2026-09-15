# Prisma Native Humanoid Runtime

## Status

The Prisma3D humanoid is now the proven fallback presentation behind the Quaternius Peasant visible-body trial. The established KayKit Ranger controller and medium rig remain the animation and gameplay authority in both paths.

The native Prisma mesh must not become a second movement, collision, tool, camera, or animation system.

## Runtime boundary

`RangerToolPresentation` continues to construct `RangerAppearancePresentation` after `RangerController.load()` completes.

`src/player/RangerAppearancePresentation.js` remains the compatibility seam used by stable code. During the Quaternius trial it resolves the historical Ranger-facing name to `QuaterniusPeasantPresentation`, which layers an authored Quaternius body/head/hair over the same KayKit animation authority. `MasculinePrismaHumanoidPresentation` remains immediately underneath as the fallback if candidate loading or validation fails.

`PrismaRiggedHumanoidPresentation` extends `SimpleHumanoidPresentation`. The Simple humanoid therefore remains the safe fallback whenever the KayKit rig cannot be resolved or the native Prisma body cannot be loaded or validated.

The ownership model is:

- `RangerController`: movement, grounding, collision, camera modes, KayKit animation mixer, tool actions, spear anchors and cinematics;
- KayKit medium rig: animation authority;
- `QuaterniusPeasantPresentation`: current visible-body trial; owns only authored Quaternius rendering, KayKit-to-Quaternius bind-delta retargeting, grounding and the visible right-palm socket;
- `PrismaRiggedHumanoidPresentation`: retargets the native Prisma skeleton from KayKit joint motion and owns scale/style/socket adaptation;
- `MasculinePrismaHumanoidPresentation`: owns the device-driven torso geometry sculpt, native shoulder-centre restoration and palm-center socket calibration only; arm-dominant geometry remains authored by the native Prisma asset;
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

## Player-facing scale, surface and integrated masculine silhouette

The player-facing Prisma root uses a presentation-only uniform scale of `1.12`. Grounding compensation is derived from the native mesh bounding-box minimum, so enlarging the rendered body does not move the accepted foot/terrain plane. Collision radius, traversal speed, camera height and world scale are unchanged.

The active native material remains matte and faceted (`faceted-cartoon-v1`): flat shading is enabled and roughness stays high. Packed skin weights and topology remain unchanged.

Device review across the earlier masculine passes exposed three separate failure modes. A weak bone-weight-only sculpt barely changed the phone-distance silhouette. A stronger pass widened the torso enough to read, but translated shoulder joints away from their authored centres; even after the left/right symmetry correction this made the arms look like separate pieces attached to the body rather than one continuous skinned figure. The next pass kept native joint centres but attempted to inflate arm vertices around reconstructed bind-space segments; on-device screenshots showed that this crossed coordinate spaces and produced catastrophic stretched triangles extending far away from the body.

The current `integrated-masculine-v3` torso profile therefore keeps all shoulder and upper-arm joint centres on the captured native bind pose and keeps arm-dominant vertices exactly in their authored Prisma positions. It reconstructs the untouched local shoulder/upper-arm bind positions from the original global bind transforms and deliberately removes both the base shoulder relaxation and the later outward/forward joint translation. KayKit still supplies the same rotation deltas, but those rotations now happen around the original authored shoulder centres.

Body proportion changes are limited to torso-dominant cloned runtime geometry. The torso is scaled around its measured centre with a mild profile: the waist is roughly `0.97×`, the ribcage grows progressively, the upper chest peaks around `1.13×` width and `1.08×` depth, and the profile eases back toward the neck. This keeps a readable masculine V without modifying limb bind geometry.

The arm safety boundary is now explicit: `native-authored-limbs-v2`. Upper arm, forearm and hand vertices are not radially rescaled or translated at runtime. Arm proportions must either come from the authored Prisma source mesh or from a future asset-space edit whose coordinate contract is proven before deployment. Presentation code may not reconstruct an arm centreline from captured world/bind positions and then move skinned vertices around it.

Runtime diagnostics retain torso width/depth gains plus the explicit `native-bind-continuity-v2` shoulder mode and `native-authored-limbs-v2` arm profile. The verifier additionally checks that strongly arm-weighted vertices remain unchanged from the packed source and that the final geometry bounds stay close to the native body. This directly guards against a return of the long arm/triangle spikes seen on device.

## Visible palm tool socket

The visible prop socket remains parented under the Prisma `rightHand` bone, but it is no longer centered on the wrist origin. The current profile advances the socket farther along the forearm-to-hand direction into the visible palm and calibrates its bind orientation so prop local +Y is upright at rest. This gives axes, hammer, pickaxe, shovel and sword one stable palm-centered grip basis while preserving their established world scale through inverse presentation-scale compensation.

`RangerToolPresentation` still owns work-tool visuals and action timing. During native load/fallback it can remain on the legacy KayKit hand, then its single tool root transfers to the active Prisma palm mount. No second tool action system is introduced.

The handheld torch uses `VisibleHandTorchRuntimeController`, a thin adapter over the existing torch runtime. Fuel, flame, light, placement, save state and timing stay in `TorchRuntimeController`; only the handheld visual is transferred to the same visible Prisma palm basis.

The spear path remains deliberately unchanged because spear throwing has its own established controller-owned anchor/release system.

## Stable systems deliberately unchanged

This integration does not change player traversal, double jump, terrain collision, player collision, camera behavior, KayKit clips, controller tool-action timing, spear behavior, construction, world systems, UI, PWA/install behavior, or save data.

## Verification

`npm run check` includes `verify:prisma-native`. It verifies the real bundled gzip and checksum, topology, finite attributes, normalized weights, neutral skin deformation, production Ranger activation, true bind-pose capture, movement retargeting, the 180-degree facing basis, first-person visibility and failure fallback.

The same verification guards the `1.12` grounded presentation scale, matte faceted material, centred torso profile, measurable upper-body gains, native shoulder-centre restoration, neutral animation-scale contract, palm-centered visible tool socket, inverse scale compensation and transfer of an equipped axe root from the legacy/fallback location to the active Prisma hand. It now also proves that strongly arm-weighted vertices remain at their authored native positions and caps post-sculpt geometry extents/radius relative to the original mesh, so a bind-space mismatch cannot silently produce huge stretched limbs again. A companion polish regression prevents reintroducing runtime arm-volume sculpting or translated shoulder joints while preserving the visible-palm handheld torch adapter and Sprout's reduced relative presentation scale.

## Device verification

After merge/deploy, verify on a physical phone:

1. no arm, hand or shoulder triangles stretch away from the player in idle, walk, run, jump, double-jump or first-person camera transitions;
2. the torso reads like one natural body: mild waist taper, broader upper chest, no blocky shoulder shelf;
3. both shoulders visually flow into the native upper arms rather than appearing detached, while the arms keep their authored length and volume;
4. the hands remain naturally positioned without either shoulder being pushed sideways or forward away from its authored joint centre;
5. axe, hammer, pickaxe, shovel and sword visibly pass through the right palm and follow the hand during their actions;
6. the handheld torch sits upright through the visible palm and its light/flame still follow correctly;
7. the faceted/cartoon surface still reads cleanly at normal mobile distance;
8. the larger player remains correctly grounded and scaled against buildings, trees and Sprout;
9. spear throwing and first-person visibility remain unchanged;
10. failure to load the native body still leaves the Simple humanoid usable rather than breaking gameplay.
