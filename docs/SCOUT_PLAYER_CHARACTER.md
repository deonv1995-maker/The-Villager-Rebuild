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

The active visual revision is `simple-humanoid-v6`. The presentation still uses the same 17 foundation meshes; this pass changes visible body shape only and does not introduce a second character or rig system.

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

`simple-humanoid-v6` keeps that exact rig contract. The supplied Prisma3D `Human.obj` is used as a **shape reference**, not as a replacement runtime rig. The previous straight shoulder-to-waist taper is now one low-poly torso mesh with five silhouette landmarks: pelvis, waist, lower ribcage, upper ribcage and shoulders. This gives the torso a narrower waist, fuller ribcage and readable pelvis while the top still reaches the real shoulder anchors and the bottom still follows the hips.

The neck remains a separate structural mesh. It is slim below the head and widens slightly toward the shoulders to read more like a natural neck-to-trapezius transition without moving the head joint or shoulder joints.

## Prisma3D body reference

The body-shape source for this pass is the user-supplied `Human.obj`, exported from **Prisma3D v3.3.5**. Inspection of the supplied file found approximately:

- `15,106` vertices;
- `7,554` faces;
- overall bounds of about `1.540 x 1.790 x 0.287` model units in the export pose.

The file contains useful body-part object/group names, including hip, waist, chest, neck, head, shoulders, upper/lower arms, hands, thighs, calves and feet. However, the OBJ is still a static mesh export: it does not contain the Prisma armature, skin weights or animation data needed to replace the established KayKit runtime skeleton safely.

For that reason the OBJ is deliberately treated as **silhouette/proportion guidance only**. The game continues to use the proven KayKit animation rig, controller, hand/tool anchors and collision architecture. This avoids introducing a competing rig while still allowing the visible low-poly shell to move toward the Prisma model's human body shape.

The runtime metadata records this contract as:

- `foundationProportions = prisma-human-reference-v1`;
- `foundationBodyShape = anatomical-low-poly-v2`;
- `foundationSource = prisma3d-human-obj-v1`.

## Arms, legs and feet

The Prisma reference is reflected in the primitive silhouettes without changing any limb endpoints:

- upper arms still taper from shoulder to elbow, with a small mid-segment fullness instead of a perfect straight cone;
- forearms taper from elbow to wrist and retain subtle forearm volume through the middle;
- hands are slightly smaller relative to the forearms;
- thighs taper from hip to knee while retaining enough upper-leg mass to meet the pelvis cleanly;
- shins taper toward the ankle but now include a small calf fullness through the middle;
- feet remain level at the animated ankle positions but use a compact heel, broader forefoot and lower toe profile.

The segment lengths still come entirely from the KayKit upper/lower limb and foot joints. Walking, running, jumping and double-jump motion therefore remain owned by the existing animation rig.

## Reference hierarchy

The earlier neutral low-poly turnaround remains useful for broad readability and low-poly styling, but the supplied Prisma3D model is now the more specific body-shape reference for this foundation pass.

Neither reference is used to stretch, translate or retarget the KayKit skeleton. The current target remains a readable neutral mannequin that can later accept Scout-specific clothing and styling without hiding rig problems underneath.

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

`npm run verify:ranger-presentation` verifies the simple humanoid compatibility boundary, the 17 essential visible meshes, production KayKit joint compatibility, first-person visibility, shoulder-height torso coverage, the Prisma-guided five-ring torso profile, shaped/tapered limb proportions, explicit neck presence, visible hand/foot joint following and existing double-jump tuning.

`npm run verify:humanoid-side-binding` covers explicit left/right joint binding, torso coverage up to the shoulder line, pelvis/waist/ribcage/shoulder silhouette order, a visible neck bridge from torso to head, tapered arm/leg geometry, compact hands, subtle forearm/calf fullness, shaped level feet and neutral foot orientation despite a strongly pitched KayKit foot joint.

Both checks are part of the full `npm run check` merge gate.

Device verification after deployment should confirm:

1. both shoulders and elbows stay on their own side of the torso in idle and movement;
2. the torso reads as pelvis -> narrow waist -> broader ribcage -> shoulders instead of a single straight cone or rectangular block;
3. the neck is visible, slim under the head and blends naturally into the shoulders;
4. the head sits naturally above the neck and shoulders;
5. upper arms and forearms read as connected human-like tapered limbs rather than equal-width tubes;
6. thighs and shins read as tapered human legs, with a subtle calf shape, while knees still bend in the expected direction;
7. the simple feet sit level, stay attached to the ankles and read as heel/forefoot/toe shapes rather than boot cubes;
8. both hands remain attached to the correct wrists;
9. axe, hammer, pickaxe and spear still align with the visible right hand;
10. first person hides the body as before;
11. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
