# Prisma Native Humanoid Runtime

## Status

The Prisma3D humanoid is a player-facing presentation layer only. The established KayKit Ranger controller and medium rig remain the animation and gameplay authority.

The native Prisma mesh must not become a second movement, collision, tool, camera, or animation system.

## Runtime boundary

`RangerToolPresentation` continues to construct `RangerAppearancePresentation` after `RangerController.load()` completes.

`src/player/RangerAppearancePresentation.js` is the compatibility seam used by stable code. It now resolves the historical Ranger-facing name to `PrismaRiggedHumanoidPresentation`.

`PrismaRiggedHumanoidPresentation` extends `SimpleHumanoidPresentation`. The Simple humanoid therefore remains the safe fallback whenever the KayKit rig cannot be resolved or the native Prisma body cannot be loaded or validated.

The ownership model is:

- `RangerController`: movement, grounding, collision, camera modes, KayKit animation mixer, tool actions, spear anchors and cinematics;
- KayKit medium rig: animation authority;
- `PrismaRiggedHumanoidPresentation`: retargets the native Prisma skeleton from KayKit joint motion;
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

The original mesh silhouette is retained. Further body reshaping requires viewing this real native model first.

## Stable systems deliberately unchanged

This integration does not change player traversal, double jump, terrain collision, player collision, camera behavior, KayKit clips, tool anchors, spear behavior, construction, world systems, UI, PWA/install behavior, or save data.

## Verification

`npm run check` includes `verify:prisma-native`. It verifies the real bundled gzip and checksum, topology, finite attributes, normalized weights, neutral skin deformation, actual production Ranger activation, movement clip retargeting, first-person visibility and failure fallback. Device acceptance remains outstanding; automated activation is not visual acceptance.

Device verification is still required because the important acceptance criteria are visual and animated:

1. the Prisma body replaces the Simple fallback after load on the production KayKit player;
2. idle, walk, run, jump and double jump remain unchanged;
3. shoulders, elbows, wrists, hips, knees, ankles and feet follow the correct side of the KayKit rig;
4. the torso reads as pelvis -> waist -> ribcage -> shoulders instead of a rectangular block;
5. the neck visibly bridges the torso and head without changing head rotation behavior;
6. arms and legs taper naturally while their animated endpoints stay attached;
7. feet read lower and less boot-like while remaining aligned to the ankle/foot motion;
8. axe, hammer, pickaxe and spear remain aligned to the right-hand tool authority;
9. first-person body visibility behavior remains unchanged;
10. failure to load or validate the native body leaves the Simple humanoid usable rather than breaking gameplay.
