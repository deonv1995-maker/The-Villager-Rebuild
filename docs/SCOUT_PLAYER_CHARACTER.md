# Scout Player Character

## Status

The player-facing main character is now **the Scout**. The historical `RangerController` and KayKit medium rig remain internal compatibility infrastructure so established locomotion clips, tool hand anchors, spear throwing, cinematics, camera modes, grounding, and collision contracts do not need to be rewritten.

This is an intentional architecture boundary: **Scout is the visual/gameplay identity; Ranger naming is legacy implementation detail until a future dedicated rig migration is justified.**

## Visual direction

The Scout follows the approved low-poly character mock-up:

- angular, chunky, flat-shaded forms that belong in the low-poly terrain;
- brown faceted hair and a simple readable face;
- olive tunic with a darker green scarf/cowl and short cape;
- cream undershirt, dark brown trousers, leather gloves/wraps and oversized traversal boots;
- readable cross-body strap and side satchel;
- earthy palette shared with forest, stone and handcrafted-building materials;
- playful heroic proportions rather than smooth or realistic anatomy.

`src/player/ScoutCharacterPresentation.js` owns these visuals. It resolves the existing medium-rig bones, hides only the old rendered Ranger meshes, and builds the Scout from low-poly Three.js geometry. The animated rig remains active underneath as the single source of truth for pose and hand-mounted gameplay objects.

`src/player/RangerAppearancePresentation.js` is intentionally retained as a compatibility export so stable tool presentation code does not need a broad rename.

If the expected medium rig cannot be resolved, the presentation falls back to the legacy Ranger render instead of making the player invisible.

## to3D model migration gate

`feature/scout-to3d-model` is the isolated integration branch for replacing the temporary procedural Scout render with the approved custom model. The generated model is treated as an **asset candidate**, not as a new animation authority.

The migration must preserve the existing boundary:

- the KayKit medium rig continues to own locomotion, jump, work-tool, spear and cinematic poses unless a dedicated rig migration is separately proven;
- the right-hand anchor remains authoritative for axe, hammer, pickaxe and spear presentation;
- first-person body hiding continues to use the existing camera-mode contract;
- player root position, collision, grounding, movement and double-jump state remain independent from the render asset;
- the procedural Scout remains the safe fallback until the custom asset has passed model, rig/retarget and device checks.

Image-to-3D output must not be wired directly into `ASSET_PATHS` merely because it renders. A static unrigged mesh would visually regress the current animated Scout even if its silhouette is better.

Candidate inspection is performed with:

```sh
node scripts/audit-scout-model-candidate.mjs path/to/Scout.gltf
```

The audit validates glTF 2.0 geometry and reports mesh, primitive, vertex, material, texture, skin, joint, animation and external-dependency counts. An unrigged candidate exits with a non-zero status by design so it cannot be mistaken for a production-ready animated player asset.

Before promotion into the runtime asset registry, the candidate must also be checked for:

1. visual match to the approved Scout mock-up from front, side and gameplay-camera angles;
2. sensible mobile polygon/material/texture cost;
3. normalized scale, origin and forward orientation relative to the existing player root;
4. a tested rig/retarget path that preserves the medium-rig animation contract, or a separately approved replacement rig architecture;
5. correct visible-hand/tool alignment through idle, walk, run, jump, double jump and work animations;
6. correct first-person hiding and third-person restoration;
7. no new dependency on terrain, collision, construction, Sprout, wildlife or PWA systems.

## Traversal direction

The Scout uses a deliberately game-like double jump so world shaping can use stronger vertical separation without making traversal frustrating.

The tuning source of truth is `src/data/PlayerTraversalTuning.js`:

- first launch speed: `6.8`;
- second launch speed: `6.4`;
- upward gravity: `16`;
- falling gravity multiplier: `1.18`;
- available mid-air jumps: `1`.

The second jump resets upward velocity rather than adding to the current vertical velocity. This makes the input predictable whether the player triggers it while rising or falling. The air-jump charge resets on landing. Walking off a ledge still leaves the one mid-air recovery jump available.

Keyboard repeat is ignored for Space so holding the button cannot consume both jumps automatically. Mobile continues to use the existing jump action path and therefore receives the same two-stage behavior.

## Systems deliberately unchanged

This pass does **not** alter terrain generation, terrain collision, platform collision, camera geometry, world streaming, construction, harvesting, survival, Sprout, wildlife, PWA/install architecture, asset paths, or the existing KayKit animation files.

The increased jump envelope is intended to give later terrain-shaping work more vertical room; terrain should not be reshaped merely to compensate for this character pass until the Scout has been verified on-device.

## Verification contract

`npm run verify:ranger-presentation` covers the Scout compatibility boundary and double-jump tuning. The full `npm run check` remains the merge gate for runtime changes.

Device verification after deployment should confirm:

1. Scout proportions and forward-facing orientation look correct in third person.
2. Hair, scarf/cape, satchel, hands and boots stay aligned through idle/walk/run/jump/tool animations.
3. Axe, hammer, pickaxe and spear still line up with the visible right hand.
4. First person hides the Scout body as before.
5. One press jumps, a second airborne press performs the double jump, and a third airborne press does nothing.
6. Landing restores the double jump.
7. The higher arc feels playful without allowing obvious traversal through collision barriers or construction shells.
