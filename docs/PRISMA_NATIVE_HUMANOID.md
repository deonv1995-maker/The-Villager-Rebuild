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
- packed SHA-256 metadata: `bee4031cce3df315462e8ebf984b833a42f75de463adf2852e4795356c84d64c`.

## Stable systems deliberately unchanged

This integration does not change player traversal, double jump, terrain collision, player collision, camera behavior, KayKit clips, tool anchors, spear behavior, construction, world systems, UI, PWA/install behavior, or save data.

## Verification

Repository checks must remain green before merge. Device verification is still required because the important acceptance criteria are visual and animated:

1. the Prisma body replaces the Simple fallback after load on the production KayKit player;
2. idle, walk, run, jump and double jump remain unchanged;
3. shoulders, elbows, wrists, hips, knees, ankles and feet follow the correct side of the KayKit rig;
4. axe, hammer, pickaxe and spear remain aligned to the right-hand tool authority;
5. first-person body visibility behavior remains unchanged;
6. failure to load or validate the native body leaves the Simple humanoid usable rather than breaking gameplay.
