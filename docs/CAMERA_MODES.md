# Ranger camera modes

The Ranger has one shared movement/look controller with two presentation modes. First person does not introduce a second movement, interaction, building or combat system.

## Third person

Third person remains the default mode and preserves the established follow camera:

- movement is camera-relative;
- right-side touch/mouse drag orbits the camera;
- after manual look is released, the camera can recover behind the Ranger;
- the Ranger body and equipped third-person tool presentation remain visible;
- structure occlusion/transparency remains active to keep the Ranger readable around buildings.

## First person

First person is an optional view over the same Ranger state:

- the camera is anchored at Ranger eye height;
- the existing right-side touch/mouse look controls yaw and pitch;
- releasing look does not auto-return the view behind the Ranger;
- movement remains camera-relative through the existing Ranger movement path;
- interaction and log dropping continue to use the horizontal first-person view direction;
- while carrying a physical Log, `GameApp` also passes the full centre-camera reticle ray into the existing `PhysicalLogSystem` as optional targeting intent rather than starting a second first-person build system;
- `FLOOR` projects that reticle ray onto each candidate floor plane and only acquires a structural snap when the white dot intersects that floor's actual full-Log by one-third-Log footprint, plus one small mobile seam allowance;
- vertically coincident lower and upper floor candidates are therefore resolved by the surface actually under the dot rather than by the broad structural snap radius;
- if the reticle leaves every eligible floor footprint, the structural snap is released instead of magnetically falling back to the nearest floor slot;
- a completed roof removes its occupied upper-floor support region from candidate generation, and aiming at that roof does not pull a lower floor target into place; the player must point the dot at the lower repair itself;
- the reticle only chooses among already-valid floor candidates; it does not create support, bypass collision/terrain rules or change third-person placement ordering;
- auto-facing actions align the first-person view with their world target;
- the third-person Ranger body, spear presentation and hand-mounted tool props are hidden to prevent camera clipping;
- third-person structure transparency is reset/disabled while first person is active because the camera is already inside the structure.

Switching back to third person restores the existing Ranger/body/tool presentation and follow-camera behavior.

## Controls

- Mobile/PWA: tap the compact `3P / 1P VIEW` button near the top-right HUD controls.
- Desktop: press `P` to toggle camera mode.
- Look controls are unchanged in both modes.

## Persistence

Camera mode is presentation/session state, not gameplay progression, and is not added to the save schema. A new gameplay session starts in third person.

## Verification

`scripts/verify-camera-modes.mjs` verifies default third-person behavior, first-person eye placement, persistent manual look, view-relative movement/facing, body/tool presentation visibility, desktop `P` toggling, restoration to third person and the first-person handoff away from third-person building occlusion.

`scripts/verify-first-person-floor-targeting.mjs` verifies exact reticle acquisition of a demolished lower split-log floor strip, release when the white dot leaves its footprint, completed-roof upper-floor lockout, and preserved upper-floor targeting while a roof is still incomplete.
