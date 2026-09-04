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
- `FLOOR` uses the reticle ray height to disambiguate vertically coincident snap candidates, so looking at a demolished ground-floor strip selects that strip instead of an upper FRAME + RAW support at the same X/Z;
- the reticle only changes which already-valid floor snap wins; it does not create support, bypass collision/terrain rules or change third-person placement ordering;
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

`scripts/verify-first-person-floor-targeting.mjs` verifies that the centre reticle can select a demolished lower split-log floor strip beneath a coincident upper support and that the same shared construction path remains valid on mobile-first first-person controls.
