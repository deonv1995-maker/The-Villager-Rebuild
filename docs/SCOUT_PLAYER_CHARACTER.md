# Scout Player Character

## Status

The player-facing character remains **the Scout**, but the approved visual mock-up is deliberately paused for now.

The current milestone is a **simple humanoid foundation**: prove the correct head, torso, arms, hands, legs and feet follow the established animation rig cleanly before adding character-specific styling again.

The historical `RangerController` and KayKit medium rig remain internal compatibility infrastructure. They continue to own locomotion clips, hand/tool anchors, spear throwing, cinematics, camera modes, grounding and collision. This avoids destabilizing proven gameplay while the visible body is rebuilt incrementally.

## Current visual foundation

`src/player/ScoutCharacterPresentation.js` remains the low-level rig-following geometry layer. `src/player/SimpleHumanoidPresentation.js` is the active runtime presentation and now adds a stricter side-binding contract before any visible limb is allowed to follow the rig.

The active presentation intentionally keeps only the essential humanoid pieces:

- one head with two simple eyes;
- one torso;
- left and right upper arms;
- left and right lower arms;
- left and right hands;
- left and right thighs;
- left and right shins;
- left and right feet.

There is no runtime scarf, cape, satchel, belt treatment, hair treatment, glove treatment or layered boot styling at this stage. Those systems remain in repository history but are not part of the active player appearance while body and motion correctness are verified.

The active visual revision remains `simple-humanoid-v1`; this repair changes rig binding rather than visual design. The presentation keeps the strict 16-mesh budget so limb alignment and movement remain easy to inspect on mobile.

`src/player/RangerAppearancePresentation.js` remains the compatibility boundary used by stable player/tool code and routes to `SimpleHumanoidPresentation`.

## Explicit left/right rig binding

Device testing exposed a real rig-resolution bug in the first humanoid foundation. The older fuzzy resolver used single letters such as `l` and `r` as unrestricted substring matches. That meant the `r` inside words such as `arm`, `upper` and `lower` could make a right-side upper/lower limb resolve to a left-side joint encountered earlier in the rig traversal. The visible hand could still resolve correctly, producing the exact cross-body stretching and folded limbs seen on device.

`SimpleHumanoidPresentation` now requires an **explicit side marker** before binding a visible limb. Accepted side markers include full `Left`/`Right` naming and explicit `L`/`R` tokens or suffixes such as `UpperArm_L`, `UpperArm_R`, `UpperLegL` and `UpperLegR`. A letter occurring inside an ordinary word never counts as a side marker.

If a complete explicit left/right set cannot be resolved, the simple presentation does not guess. It restores the legacy Ranger render as a safe fallback instead of showing a mangled humanoid.

This explicit side-binding layer is the foundation for future character styling. New clothing or body-detail work should build on this verified humanoid presentation rather than bypassing it.

## Why the mock-up is paused

Repeated polish passes were mixing two separate problems: **body/rig correctness** and **final character art direction**. The project now separates them.

The order from this point is:

1. verify humanoid proportions and left/right limb movement;
2. verify hands and feet stay aligned through locomotion, jumping and tools;
3. fix any remaining rig-following or body-proportion problems at the foundation layer;
4. only then add clothing, hair, accessories and final Scout identity back in controlled increments.

This keeps future visual work additive instead of repeatedly compensating for uncertain proportions underneath.

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

`npm run verify:ranger-presentation` continues to verify the simple humanoid compatibility boundary, the 16 essential visible meshes, production KayKit joint compatibility, first-person visibility, visible hand/foot joint following and existing double-jump tuning.

`npm run verify:humanoid-side-binding` specifically reproduces the left-before-right naming order that exposed the device bug and verifies that upper arms, lower arms, hands, thighs, shins and feet bind to distinct explicit left/right joints and remain on the correct side of a neutral test pose.

Both checks are part of the full `npm run check` merge gate.

Device verification after deployment should confirm:

1. both shoulders and elbows stay on their own side of the torso in idle and movement;
2. neither arm stretches through the chest to reach the opposite hand;
3. both hands remain attached to the correct wrists;
4. both thighs and shins remain separated instead of collapsing onto one side;
5. knees bend in the expected direction through walk/run/jump animations;
6. both feet remain attached and face the expected direction;
7. axe, hammer, pickaxe and spear still align with the visible right hand;
8. first person hides the body as before;
9. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
