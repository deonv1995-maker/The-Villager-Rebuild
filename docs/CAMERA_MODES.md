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
- interaction, log placement and log dropping use the horizontal first-person view direction;
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
