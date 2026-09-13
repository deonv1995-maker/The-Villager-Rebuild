# Sprout laser scanner visual

Status: **active presentation effect**.

Sprout's existing scan/collection behavior now has a visible game-native laser scanner effect inspired by a broad holographic cone sweeping the ground beneath the companion. This is a presentation-only addition; the established resource search, approach, compression, inventory, collision, navigation and story rules remain authoritative in their existing systems.

## Presentation contract

`SproutCompanionController` remains the source of truth for whether Sprout is currently scanning. Its existing `getPresentationState().scanning` value covers resource targeting, compression, idle scans and the scan idle flourish. `SproutVisualRuntimeController` reads that state and forwards it to the rendering layer.

`src/rendering/SproutScannerVisual.js` owns the scanner effect. It is installed idempotently on the existing production Sprout root and does not select targets, move Sprout, reserve resources or modify inventory.

While scanning, the effect renders:

- a translucent cyan cone projected downward from Sprout's underside;
- radial laser/grid rays inside the cone;
- several horizontal holographic contour rings;
- a bright circular ground footprint with an inner ring;
- a rotating sweep line and gentle pulse/rotation animation.

When Sprout is not scanning, the scanner group is hidden rather than continuing to render transparently.

## Mobile rendering budget

The effect uses lightweight built-in Three.js geometry and shared unlit additive materials. It adds no textures, shaders, particles, skeletal animation or dynamic lights. The cone uses 24 radial segments, the grid uses eight ray segments, and the remaining detail is a small number of torus/line primitives. Materials disable depth writes so overlapping transparent scanner surfaces do not compete with each other.

The visual is attached below the outer gameplay root rather than the internal body-motion root. This keeps the scan footprint stable relative to Sprout's gameplay hover position while the authored body can continue its presentation-only bob and sway.

## Architecture boundary

The scanner effect must remain visual-only. Future refinement may change cone width, pulse timing, contour count, glow strength or sweep motion, but gameplay range and resource eligibility stay in `SproutCompanionDefinitions.js` and `SproutCompanionController.js`. Rendering code must not introduce a second scan radius, target-selection rule or collection path.

The current effect deliberately does not add a real light source. Cyan visibility comes from additive unlit materials, preserving the existing mobile-first lighting budget and avoiding additional shadow or lighting work.
