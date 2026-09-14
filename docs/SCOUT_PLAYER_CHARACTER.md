# Scout Player Character

## Status

The player-facing character remains **the Scout**, but the approved visual mock-up is deliberately paused for now.

The current milestone is a **simple humanoid foundation**: prove the correct head, neck, torso, arms, hands, legs and feet follow the established animation rig cleanly before adding character-specific styling again.

The historical `RangerController` and KayKit medium rig remain internal compatibility infrastructure. They continue to own locomotion clips, hand/tool anchors, spear throwing, cinematics, camera modes, grounding and collision. This avoids destabilizing proven gameplay while the visible body is rebuilt incrementally.

## Current visual foundation

`src/player/ScoutCharacterPresentation.js` remains the low-level rig-following geometry layer. `src/player/SimpleHumanoidPresentation.js` is the active runtime presentation and adds foundation-specific corrections on top of that stable rig authority.

The active presentation intentionally keeps only the essential humanoid pieces:

- one head with two simple eyes;
- one explicit neck;
- one torso;
- left and right upper arms;
- left and right lower arms;
- left and right hands;
- left and right thighs;
- left and right shins;
- left and right feet.

There is no runtime scarf, cape, satchel, belt treatment, hair treatment, glove treatment or layered boot styling at this stage. Those systems remain in repository history but are not part of the active player appearance while body and motion correctness are verified.

The active visual revision is `simple-humanoid-v5`. The presentation still uses the same 17 foundation meshes introduced in v4; this pass changes body silhouette and proportions only.

`src/player/RangerAppearancePresentation.js` remains the compatibility boundary used by stable player/tool code and routes to `SimpleHumanoidPresentation`.

## Explicit left/right rig binding

Device testing exposed a real rig-resolution bug in the first humanoid foundation. The older fuzzy resolver used single letters such as `l` and `r` as unrestricted substring matches. That meant the `r` inside words such as `arm`, `upper` and `lower` could make a right-side upper/lower limb resolve to a left-side joint encountered earlier in the rig traversal. The visible hand could still resolve correctly, producing the exact cross-body stretching and folded limbs seen on device.

`SimpleHumanoidPresentation` requires an **explicit side marker** before binding a visible limb. Accepted side markers include full `Left`/`Right` naming and explicit `L`/`R` tokens or suffixes such as `UpperArm_L`, `UpperArm_R`, `UpperLegL` and `UpperLegR`. A letter occurring inside an ordinary word never counts as a side marker.

If a complete explicit left/right set cannot be resolved, the simple presentation does not guess. It restores the legacy Ranger render as a safe fallback instead of showing a mangled humanoid.

## Upper-body and neck foundation

PR #271 established the structural continuity rule for the upper body:

- the visible torso uses the **actual left/right upper-arm shoulder anchors** to define its upper boundary;
- the pelvis/hips remain the lower torso authority;
- a dedicated low-poly neck bridges the shoulder line to the bottom of the head;
- the head follows the real animated head joint and cannot collapse into the shoulders;
- no skeleton joint, animation clip, movement value or tool anchor is retargeted to force the visible shell into place.

`simple-humanoid-v5` keeps that exact rig contract and improves only the body shape. The rectangular v4 torso is replaced by one six-sided tapered shell that is broad through the shoulders/ribcage, narrower at the waist and flatter front-to-back. The neck is slimmer and the required visible neck gap is shortened so the head, neck and shoulders read as one continuous neutral body instead of a head mounted on a post.

## Arms, legs and feet

The turnaround reference is now reflected in the primitive silhouettes without changing any limb endpoints:

- upper arms taper from shoulder to elbow;
- forearms taper from elbow to wrist;
- hands are slightly smaller relative to the forearms;
- thighs taper from hip to knee;
- shins taper from knee to ankle;
- feet remain level at the animated ankle positions but use a lower, longer, tapered heel-to-toe shape instead of a plain rectangular boot block.

The segment lengths still come entirely from the KayKit upper/lower limb and foot joints. Walking, running, jumping and double-jump motion therefore remain owned by the existing animation rig.

## Low-poly turnaround reference

The supplied neutral rotating low-poly humanoid turnaround is used only for **structural proportion and silhouette guidance**, not as final Scout art direction.

The reference is used to judge continuity between head, neck, shoulders, ribcage, waist, pelvis and limbs. It is not used to stretch, translate or retarget the KayKit skeleton. The current target is a readable neutral mannequin that can later accept Scout-specific clothing and styling without hiding rig problems underneath.

## Why the mock-up is paused

Repeated polish passes were mixing two separate problems: **body/rig correctness** and **final character art direction**. The project keeps them separated.

The order remains:

1. verify humanoid proportions and left/right limb movement;
2. verify head, neck, shoulders and torso form one continuous upper body;
3. verify readable arm, leg and foot silhouettes;
4. verify hands and feet stay aligned through locomotion, jumping and tools;
5. fix any remaining rig-following or body-proportion problems at the foundation layer;
6. only then add clothing, hair, accessories and final Scout identity back in controlled increments.

## Traversal direction

The current Scout traversal is unchanged. The tuning source of truth remains `src/data/PlayerTraversalTuning.js`:

- first launch speed: `6.8`;
- second launch speed: `6.4`;
- upward gravity: `16`;
- falling gravity multiplier: `1.18`;
- available mid-air jumps: `1`.

The second jump resets upward velocity rather than adding to the current vertical velocity. The air-jump charge resets on landing. Keyboard repeat is ignored for Space, and mobile continues to use the same jump action path.

## Systems deliberately unchanged

This foundation refinement does **not** alter terrain generation, terrain collision, platform collision, camera geometry, world streaming, construction, harvesting, survival, Sprout, wildlife, PWA/install architecture, asset paths, traversal tuning, tool anchors, the existing KayKit animation files, player collision, or control logic.

## Verification contract

`npm run verify:ranger-presentation` verifies the simple humanoid compatibility boundary, the 17 essential visible meshes, production KayKit joint compatibility, first-person visibility, shoulder-height torso coverage, tapered torso/limb proportions, explicit neck presence, visible hand/foot joint following and existing double-jump tuning.

`npm run verify:humanoid-side-binding` covers explicit left/right joint binding, torso coverage up to the shoulder line, the tapered shoulder-to-waist shell, a visible neck bridge from torso to head, tapered arm/leg geometry, compact hands, shaped level feet and neutral foot orientation despite a strongly pitched KayKit foot joint.

Both checks are part of the full `npm run check` merge gate.

Device verification after deployment should confirm:

1. both shoulders and elbows stay on their own side of the torso in idle and movement;
2. the torso reads as broad shoulders/ribcage tapering into the waist rather than a rectangular block;
3. the neck is visible but does not look excessively long or thick;
4. the head sits naturally above the neck and shoulders;
5. upper arms and forearms read as connected tapered limbs rather than tubes of equal thickness;
6. thighs and shins read as tapered human legs while knees still bend in the expected direction;
7. the simple feet sit level, stay attached to the ankles and read as low heel-to-toe feet rather than boot cubes;
8. both hands remain attached to the correct wrists;
9. axe, hammer, pickaxe and spear still align with the visible right hand;
10. first person hides the body as before;
11. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
