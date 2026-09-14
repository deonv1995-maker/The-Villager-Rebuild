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

The active visual revision is `simple-humanoid-v4`. The presentation uses 17 simple meshes: the previous 16 foundation meshes plus one structural neck.

`src/player/RangerAppearancePresentation.js` remains the compatibility boundary used by stable player/tool code and routes to `SimpleHumanoidPresentation`.

## Explicit left/right rig binding

Device testing exposed a real rig-resolution bug in the first humanoid foundation. The older fuzzy resolver used single letters such as `l` and `r` as unrestricted substring matches. That meant the `r` inside words such as `arm`, `upper` and `lower` could make a right-side upper/lower limb resolve to a left-side joint encountered earlier in the rig traversal. The visible hand could still resolve correctly, producing the exact cross-body stretching and folded limbs seen on device.

`SimpleHumanoidPresentation` requires an **explicit side marker** before binding a visible limb. Accepted side markers include full `Left`/`Right` naming and explicit `L`/`R` tokens or suffixes such as `UpperArm_L`, `UpperArm_R`, `UpperLegL` and `UpperLegR`. A letter occurring inside an ordinary word never counts as a side marker.

If a complete explicit left/right set cannot be resolved, the simple presentation does not guess. It restores the legacy Ranger render as a safe fallback instead of showing a mangled humanoid.

## Upper-body and neck correction

The first wireframe-guided proportion pass shortened the visible torso according to the spine/chest distance. That looked reasonable in the synthetic regression rig, but device testing showed that the production KayKit shoulder joints could sit above the resulting body shell. The visible result was a waist/body block below the arms with the head appearing to sit directly between the shoulders.

`simple-humanoid-v4` fixes the root cause at the presentation layer:

- the visible torso now uses the **actual left/right upper-arm shoulder anchors** to define its upper boundary;
- the pelvis/hips remain the lower torso authority;
- a dedicated low-poly neck bridges the shoulder line to the bottom of the head;
- the head still follows the real animated head joint, but it is prevented from sinking into the shoulder line;
- no skeleton joint, animation clip, movement value or tool anchor is retargeted to force the visible shell into place.

This makes the neutral mannequin read as one continuous humanoid structure while keeping the KayKit rig authoritative.

## Lower-body alignment correction

The simple box feet originally inherited the KayKit ankle pitch intended for the original skinned boots, making the lower body read as if the legs were bending backwards.

The foundation keeps the animated ankle position but uses player-root orientation for the temporary box feet. The thigh and shin segments continue to follow the actual animated upper-leg, lower-leg and foot joint positions, so walking, running, jumping and double-jump motion remain owned by the KayKit animation rig.

## Wireframe-guided proportion reference

The supplied neutral rotating humanoid wireframe is used only for **structural proportion guidance**, not as final Scout art direction.

The reference is used to judge continuity between head, neck, shoulders, ribcage, pelvis and limbs. It is not used to stretch, translate or retarget the KayKit skeleton. The current goal is a readable neutral mannequin that can later accept Scout-specific clothing and styling without hiding rig problems underneath.

## Why the mock-up is paused

Repeated polish passes were mixing two separate problems: **body/rig correctness** and **final character art direction**. The project keeps them separated.

The order remains:

1. verify humanoid proportions and left/right limb movement;
2. verify head, neck, shoulders and torso form one continuous upper body;
3. verify readable lower-body alignment;
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

This foundation repair does **not** alter terrain generation, terrain collision, platform collision, camera geometry, world streaming, construction, harvesting, survival, Sprout, wildlife, PWA/install architecture, asset paths, traversal tuning, tool anchors or the existing KayKit animation files.

## Verification contract

`npm run verify:ranger-presentation` verifies the simple humanoid compatibility boundary, the 17 essential visible meshes, production KayKit joint compatibility, first-person visibility, shoulder-height torso coverage, explicit neck presence, visible hand/foot joint following and existing double-jump tuning.

`npm run verify:humanoid-side-binding` covers explicit left/right joint binding, torso coverage up to the shoulder line, a visible neck bridge from torso to head, head separation above the shoulders, compact feet and neutral simple-foot orientation despite a strongly pitched KayKit foot joint.

Both checks are part of the full `npm run check` merge gate.

Device verification after deployment should confirm:

1. both shoulders and elbows stay on their own side of the torso in idle and movement;
2. neither arm stretches through the chest to reach the opposite hand;
3. the torso visibly reaches the shoulder line instead of ending at the waist;
4. a neck is visible between torso and head;
5. the head sits above the shoulders rather than between the upper arms;
6. both thighs and shins remain separated instead of collapsing onto one side;
7. knees bend in the expected direction through walk/run/jump animations;
8. the simple feet sit level and remain attached to the ankles;
9. both hands remain attached to the correct wrists;
10. axe, hammer, pickaxe and spear still align with the visible right hand;
11. first person hides the body as before;
12. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
