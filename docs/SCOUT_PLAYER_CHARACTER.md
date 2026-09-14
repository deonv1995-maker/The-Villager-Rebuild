# Scout Player Character

## Status

The player-facing character remains **the Scout**, but the approved visual mock-up is deliberately paused for now.

The current milestone is a **simple humanoid foundation**: prove the correct head, torso, arms, hands, legs and feet follow the established animation rig cleanly before adding character-specific styling again.

The historical `RangerController` and KayKit medium rig remain internal compatibility infrastructure. They continue to own locomotion clips, hand/tool anchors, spear throwing, cinematics, camera modes, grounding and collision. This avoids destabilizing proven gameplay while the visible body is rebuilt incrementally.

## Current visual foundation

`src/player/ScoutCharacterPresentation.js` remains the low-level rig-following geometry layer. `src/player/SimpleHumanoidPresentation.js` is the active runtime presentation and adds foundation-specific corrections on top of that stable rig authority.

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

The active visual revision is `simple-humanoid-v3`. The presentation keeps the strict 16-mesh budget so limb alignment and movement remain easy to inspect on mobile.

`src/player/RangerAppearancePresentation.js` remains the compatibility boundary used by stable player/tool code and routes to `SimpleHumanoidPresentation`.

## Explicit left/right rig binding

Device testing exposed a real rig-resolution bug in the first humanoid foundation. The older fuzzy resolver used single letters such as `l` and `r` as unrestricted substring matches. That meant the `r` inside words such as `arm`, `upper` and `lower` could make a right-side upper/lower limb resolve to a left-side joint encountered earlier in the rig traversal. The visible hand could still resolve correctly, producing the exact cross-body stretching and folded limbs seen on device.

`SimpleHumanoidPresentation` now requires an **explicit side marker** before binding a visible limb. Accepted side markers include full `Left`/`Right` naming and explicit `L`/`R` tokens or suffixes such as `UpperArm_L`, `UpperArm_R`, `UpperLegL` and `UpperLegR`. A letter occurring inside an ordinary word never counts as a side marker.

If a complete explicit left/right set cannot be resolved, the simple presentation does not guess. It restores the legacy Ranger render as a safe fallback instead of showing a mangled humanoid.

## Head and foot alignment correction

The next device pass showed two remaining presentation artifacts after left/right binding was fixed:

- the simple head was still inheriting the old Scout art offset, leaving a visible gap above the torso;
- the simple box feet inherited the KayKit ankle pitch intended for the original skinned boots, making the lower body read as if the legs were bending backwards.

The foundation removes those art-specific assumptions at the active presentation boundary. The head is pulled back down onto the neck/torso connection, while each simple foot keeps the animated ankle position but uses the player-root orientation instead of the strongly pitched foot quaternion. This is intentionally a **foundation readability correction**, not a replacement animation system.

The thigh and shin segments still follow the actual animated upper-leg, lower-leg and foot joint positions, so walking, running, jumping and double-jump motion remain owned by the KayKit animation rig. Only the simple foot mesh orientation is neutralized while this milestone is being validated.

## Wireframe-guided proportion reference

A neutral rotating humanoid wireframe reference is now being used only for **structural proportion guidance**, not as final Scout art direction.

`simple-humanoid-v3` applies the lessons from that reference without altering the skeleton:

- the visible torso is shortened so it reads as a compact ribcage/body block rather than a long tunic that hides the upper legs;
- the torso remains seated near the hip/upper-leg anchors so the body does not visually split apart;
- the visible head is reduced and reseated on the torso to keep the body dominant while preserving the existing animated head joint;
- the temporary hands, thighs and shins remain simple low-poly forms attached to their true animated joints;
- the temporary feet are reduced in width/length while remaining level and anchored to the animated ankles.

The important boundary is that **no leg joint is stretched, translated or retargeted to imitate the reference**. The reference helps judge the visible shell; the KayKit skeleton and animation clips remain authoritative for movement.

## Why the mock-up is paused

Repeated polish passes were mixing two separate problems: **body/rig correctness** and **final character art direction**. The project now separates them.

The order from this point is:

1. verify humanoid proportions and left/right limb movement;
2. verify head/neck continuity and readable lower-body alignment;
3. verify hands and feet stay aligned through locomotion, jumping and tools;
4. fix any remaining rig-following or body-proportion problems at the foundation layer;
5. only then add clothing, hair, accessories and final Scout identity back in controlled increments.

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

`npm run verify:ranger-presentation` continues to verify the simple humanoid compatibility boundary, the 16 essential visible meshes, production KayKit joint compatibility, first-person visibility, visible hand/foot joint following, the wireframe-guided torso/head/foot proportions and existing double-jump tuning.

`npm run verify:humanoid-side-binding` covers explicit left/right joint binding, the head/torso connection, compact torso-to-hip seating, reduced head/foot proportions and neutral simple-foot orientation despite a strongly pitched KayKit foot joint.

Both checks are part of the full `npm run check` merge gate.

Device verification after deployment should confirm:

1. both shoulders and elbows stay on their own side of the torso in idle and movement;
2. neither arm stretches through the chest to reach the opposite hand;
3. the reduced head remains seated on the torso rather than floating;
4. the shorter torso exposes enough upper leg to make the hips/thighs readable;
5. both thighs and shins remain separated instead of collapsing onto one side;
6. knees bend in the expected direction through walk/run/jump animations;
7. the smaller simple feet sit level and remain attached to the ankles;
8. both hands remain attached to the correct wrists;
9. axe, hammer, pickaxe and spear still align with the visible right hand;
10. first person hides the body as before;
11. one press jumps, a second airborne press double-jumps, and landing restores the second jump.

Final clothing, hair, face, scarf, cape, satchel and boot styling should not resume until this foundation has been accepted on-device.
