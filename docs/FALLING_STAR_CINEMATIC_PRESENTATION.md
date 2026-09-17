# Falling-star cinematic presentation

## Purpose

The title sighting and the later gameplay descent are two presentation beats of the same Sprout arrival event. They must share visual language without creating a second trajectory, story, lighting or camera authority.

## Title atmospheric entry

`TitleCelestialEvent` remains the owner of the disposable title-scene celestial signal. When the star becomes visible immediately after the blue flash, a fixed additive atmospheric-entry ring is left at `shootingStarStart`. The ring is oriented perpendicular to the authored travel direction, expands while the star moves away from it and fades completely during the early part of the sighting.

The ring is intentionally anchored at the entry point rather than parented to the moving star. It is the visual hole/ripple left by the object crossing the atmosphere, not another glow attached to the object. The existing plasma tail, bow-shock bubble, leading heat rim and point light continue to move with the star.

The entry effect uses one low-segment torus plus one low-segment ring/haze mesh with additive `MeshBasicMaterial`. It adds no post-processing, simulation loop, texture dependency or shadow pass to the title scene.

## Gameplay descent light

`SproutCrashSiteSystem` remains the authoritative owner of the incoming object's gameplay position and trajectory. `SproutImpactCinematicEffects` consumes `crashSite.incoming.position` and follows it with one cyan `SpotLight` aimed at the resolved crash site.

The spotlight exists to create directional moving shadows across nearby trees and terrain while the star descends. It does not replace the existing point light, which remains the broad illumination/glow source. A spotlight is used instead of a shadow-casting point light so the effect needs one shadow-map view rather than six cube-map faces.

The spotlight uses the existing `CelestialShadowSystem` renderer gate and caster/receiver policy. Its map is fixed at 512 px, `shadow.autoUpdate` remains disabled, and moving-light refresh requests are capped at 10 Hz. No parallel global shadow system is introduced.

## Impact feedback

At ground contact the transient spotlight is hidden immediately. The impact then combines the existing cyan flash/shockwave with:

- one deterministic, short-lived dust `Points` burst centered on the crash site; and
- one brief decaying camera impulse through `SceneSystem.triggerCameraShake`.

Camera shake is applied only around the render call. `SceneSystem` stores the camera position/quaternion, applies the temporary offset, renders, and restores the authored transform in the same frame. The effect therefore cannot accumulate into Ranger camera state or compete with cinematic camera ownership.

## Authority boundaries

- `SproutArrivalDefinitions` owns tuning values for the gameplay shadow light, dust lifetime/count and camera impulse.
- `TitleCelestialEvent` owns the title-only atmospheric-entry ring and title star presentation.
- `FallingStarTrailVisual` remains the shared plasma-tail helper.
- `SproutCrashSiteSystem` owns gameplay flight position and impact-site presentation.
- `SproutImpactCinematicEffects` owns transient gameplay light/dust/impact feedback only.
- `CelestialShadowSystem` remains the gameplay shadow policy and refresh gate.
- `SceneSystem` owns the reusable render-time camera-shake primitive.

This presentation work does not change terrain generation/collision, world time, controls, construction, wildlife, harvesting, inventory, save semantics, PWA behavior or deployment architecture.
