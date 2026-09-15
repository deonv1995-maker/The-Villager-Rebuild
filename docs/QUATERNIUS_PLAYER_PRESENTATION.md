# Quaternius Player Presentation Trial

## Status

The current player-facing trial replaces runtime-generated body sculpting with an authored Quaternius male peasant body, male head and simple parted hair. It is a presentation change only. The established KayKit Ranger controller, collision, grounding, camera, movement state and animation mixer remain authoritative.

`RangerAppearancePresentation` now resolves to `QuaterniusPeasantPresentation`. The existing masculine Prisma implementation remains loaded beneath it as the immediate visual fallback; the Simple humanoid remains the fallback below Prisma.

## Why this trial exists

The Prisma passes proved the retargeting boundary and visible-palm tool seam, but repeated runtime proportion edits created an avoidable failure mode: moving or reconstructing skinned geometry outside its authored bind-space contract could make shoulders, arms or triangles stretch apart on device.

The Quaternius trial removes that class of body-shape manipulation. Body proportions, shoulders, arms, hands and head are authored together around a conventional humanoid skeleton. Runtime code retargets rotations but does not reshape the character mesh.

## Runtime assets and provenance

The trial ships only three optimized GLBs under `public/assets/quaternius/player/`:

- `male_peasant.glb` — 653,892 bytes — SHA-256 `cc12edb13e556cdaf6ce9fb869bf0b081ae8538e4ab6d030ae207fe63f24ab8a`;
- `male_head.glb` — 232,884 bytes — SHA-256 `576e31b92bc2fab0b8ca6265d880d546370c3a4b80d797858cda121958c09569`;
- `hair_simpleparted.glb` — 71,444 bytes — SHA-256 `41675f7fce412f50d8ebd7fe4749eae3201e2a52414fdec3104b888434f2e73c`.

The assets are CC0 Quaternius derivatives from Modular Character Outfits - Fantasy and Universal Base Characters. Full provenance is recorded in `licenses/quaternius-player-candidate.md`. The runtime derivatives are pinned to the public preparation source recorded there; source archives are not shipped.

## Rig inspection

Repository-side inspection before integration confirmed:

- `male_peasant.glb` contains five skinned meshes on one 65-joint universal skeleton;
- `male_head.glb` contains three skinned meshes on one 65-joint universal skeleton;
- `hair_simpleparted.glb` contains one skinned mesh on one 65-joint universal skeleton;
- the required pelvis/spine/neck/head, clavicle/arm/hand and thigh/calf/foot/toe joints are present on all three parts;
- the assembled authored character remains human-scaled at roughly 1.84 m before game-world presentation transforms.

The raw one-off inspection output and ingest workflow are deliberately not production files; the durable contract is captured here and in `scripts/verify-quaternius-peasant-presentation.mjs`. Temporary ingestion or repair workflows are removed before review, so the merge gate remains the repository's established CI and Pages workflows.

## Animation boundary

`QuaterniusPeasantPresentation` subclasses the existing masculine Prisma presentation so it can reuse the already-proven KayKit source-driver and bind-pose capture path. It does not create a second animation mixer.

Candidate activation is ordered after the Prisma fallback finishes resolving. This makes the ownership transition deterministic: a late fallback load cannot overwrite Quaternius metadata or reappear over the candidate.

For each mapped Quaternius joint, runtime code:

1. reads the current KayKit joint rotation in player-local space;
2. calculates the delta from the captured KayKit bind rotation;
3. applies that delta to the authored Quaternius bind rotation;
4. restores authored Quaternius local positions and scales unchanged.

The mapped chain covers pelvis, spine, neck/head, both clavicle/arm/hand chains and both thigh/calf/foot/toe chains. The three modular parts are retargeted from the same KayKit pose each frame and keep their own authored skins.

## Grounding and tools

The composed candidate is grounded from its authored bounding-box minimum. Player collision and terrain grounding are unchanged.

A presentation-only right-hand socket is parented to authored `hand_r`. Its bind orientation makes existing work-tool local +Y upright and advances the origin into the visible palm. `RangerToolPresentation` remains the sole owner of axe/hammer/pickaxe/shovel/sword visuals and action timing; it simply transfers its existing root to the active visible hand.

This pass does not replace the current tool models. Matching Quaternius props can be evaluated only after the player body itself passes device review. Spear throwing retains the established controller-owned path.

## Failure behavior

If any candidate asset fails to load, lacks a required scene/joint, produces invalid bounds or otherwise fails validation, `QuaterniusPeasantPresentation` leaves the Prisma presentation active. If the underlying native Prisma path also fails, the existing Simple humanoid fallback still applies.

## Stable systems deliberately unchanged

This trial does not modify traversal, walk/run speed, jump/double-jump, collision, terrain, camera modes, KayKit locomotion/tool clips, tool timing, spear behavior, harvesting, construction, ecology, world generation, UI, save data or PWA/install behavior.

## Automated verification

`npm run check` includes `scripts/verify-quaternius-peasant-presentation.mjs`. It verifies exact asset byte sizes and SHA-256 values, the 65-joint authored skeletons, required joint names, composed human-scale bounds, activation metadata, first-person visibility, existing tool-root transfer to the authored palm, meaningful retargeted arm motion across the production KayKit movement library, finite/bounded animated geometry and Prisma fallback behavior.

## Device verification required after deployment

On a physical phone, verify the character at normal gameplay camera distance in idle, walk, run, jump and double-jump. Check front, side and rear views for shoulder/arm continuity, natural hand placement, head/neck attachment, foot grounding and any modular seams. Verify axe, hammer, pickaxe, shovel and sword stay inside the right palm during actions; verify torch and spear behavior remain unchanged; verify first-person hides the third-person body correctly; and confirm the overall art style still fits the island, buildings and Sprout before promoting the Quaternius presentation beyond trial status.
