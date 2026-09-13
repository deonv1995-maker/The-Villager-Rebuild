# Scout Player Character

## Status

The player-facing character remains **the Scout**, but the approved visual mock-up is deliberately paused for now.

The current milestone is a **simple humanoid foundation**: prove the correct head, torso, arms, hands, legs and feet follow the established animation rig cleanly before adding character-specific styling again.

The historical `RangerController` and KayKit medium rig remain internal compatibility infrastructure. They continue to own locomotion clips, hand/tool anchors, spear throwing, cinematics, camera modes, grounding and collision. This avoids destabilizing proven gameplay while the visible body is rebuilt incrementally.

## Current visual foundation

`src/player/ScoutCharacterPresentation.js` remains the stable rig-following layer. It resolves the existing KayKit medium-rig bones, hides the old Ranger render meshes and maps visible geometry onto the animated skeleton.

`src/player/SimpleHumanoidPresentation.js` is now the runtime presentation layer. It intentionally removes the earlier mock-up-specific styling and keeps only the essential humanoid pieces:

- one head with two simple eyes;
- one torso;
- left and right upper arms;
- left and right lower arms;
- left and right hands;
- left and right thighs;
- left and right shins;
- left and right feet.

There is no runtime scarf, cape, satchel, belt treatment, hair treatment, glove treatment or layered boot styling at this stage. Those systems are not deleted from repository history; they are simply no longer part of the active player appearance while the body and motion foundation are verified.

The active visual revision is `simple-humanoid-v1`. It uses a strict 16-mesh presentation budget so limb alignment and movement remain easy to inspect on mobile.

`src/player/RangerAppearancePresentation.js` remains the compatibility boundary used by stable player/tool code, but now routes to `SimpleHumanoidPresentation`.

If the expected medium rig cannot be resolved, the presentation still falls back to the legacy Ranger render instead of making the player invisible.

## Why the mock-up is paused

Repeated polish passes were mixing two separate problems: **body/rig correctness** and **final character art direction**. The project now separates them.

The order from this point is:

1. verify humanoid proportions and limb movement;
2. verify hands and feet stay aligned through locomotion, jumping and tools;
3. fix any rig-following or body-proportion problems at the foundation layer;
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

This foundation pass does **not** alter terrain generation, terrain collision, platform collision, camera geometry, world streaming, construction, harvesting, survival, Sprout, wildlife, PWA/install architecture, asset paths, traversal tuning, tool anchors or the existing KayKit animation files.

## Verification contract

`npm run verify:ranger-presentation` now verifies the simple humanoid compatibility boundary, the 16 essential visible meshes, production KayKit joint compatibility, first-person visibility, visible hand/foot joint following and the existing double-jump tuning.

The full `npm run check` remains the merge gate.

Device verification after deployment should confirm:

1. the character clearly reads as a basic humanoid in third person;
2. both arms bend and move from the correct shoulders/elbows;
3. both hands remain attached to the correct wrists;
4. both legs move from the correct hips/knees;
5. both feet remain attached and face the expected direction while walking, running and jumping;
6. axe, hammer, pickaxe and spear still align with the visible right hand;
7. first person hides the body as before;
8. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
