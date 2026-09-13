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

`npm run verify:ranger-presentation` now covers the Scout compatibility boundary and double-jump tuning. The full `npm run check` remains the merge gate.

Device verification after deployment should confirm:

1. Scout proportions and forward-facing orientation look correct in third person.
2. Hair, scarf/cape, satchel, hands and boots stay aligned through idle/walk/run/jump/tool animations.
3. Axe, hammer, pickaxe and spear still line up with the visible right hand.
4. First person hides the Scout body as before.
5. One press jumps, a second airborne press performs the double jump, and a third airborne press does nothing.
6. Landing restores the double jump.
7. The higher arc feels playful without allowing obvious traversal through collision barriers or construction shells.
