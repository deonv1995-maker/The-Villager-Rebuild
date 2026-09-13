# Sprout laser scanner visual

Status: **active presentation effect**.

Sprout's scanner is a visible game-native laser/holographic effect emitted from the authored **scanning lens** on the front-left of the production companion. The scanner supports the established collection behavior without owning resource search, reservation, compression, inventory, collision, navigation or story rules.

## Collection scan sequence

The collection sequence is intentionally staged so scanning and matter compression read as two different actions:

`select loose pickup -> scan while approaching -> stop in beam range -> scan-lock pause -> scanner off -> reserve/compress/store -> resume search`

`SproutCompanionController` remains the source of truth for that sequence. A selected pickup keeps `getPresentationState().scanning` active during approach and the short scan-lock pause. The controller also exposes the selected pickup position as the presentation-only `scanTarget`. Once the scan-lock pause completes and the reservation/compression transaction starts, `scanning` becomes false before the shrinking transfer begins.

The scan-lock duration is gameplay/presentation timing in `SproutCompanionDefinitions.js`; it is not duplicated in rendering code. Idle roaming scans and the automatic scan flourish still use the same scanner effect without a collection target.

## Lens-origin presentation contract

`SproutVisualRuntimeController` reads `scanning` and `scanTarget` and forwards them to `src/rendering/SproutScannerVisual.js`.

The rendering layer resolves the authored `root.userData.scannerLens` world position every frame, converts it back into the outer companion root's local space, and places the scanner cone apex there. When a collection target exists, the cone aims from that physical lens position to the selected pickup. This lets the beam follow Sprout's body bob while still originating from the visible lens instead of the companion center or underside.

For ambient idle scans without a selected pickup, the same lens projects a short down-forward scan cone. Rendering remains target-aware only for presentation: it does not choose, validate or reserve resources.

While scanning, the effect renders:

- a translucent cyan cone originating at the scanning lens;
- radial laser/grid rays inside the cone;
- several holographic contour rings;
- a bright endpoint footprint with an inner ring;
- a rotating sweep line and gentle pulse/rotation animation.

When Sprout is not scanning, the scanner group is hidden rather than continuing to render transparently. The separate compression beam/halo belongs to the existing collection-transfer presentation and begins only after the scanner state has ended.

## Mobile rendering budget

The effect uses lightweight built-in Three.js geometry and shared unlit additive materials. It adds no textures, shaders, particles, skeletal animation or dynamic lights. The cone uses 24 radial segments, the grid uses eight ray segments, and the remaining detail is a small number of torus/line primitives. Materials disable depth writes so overlapping transparent scanner surfaces do not compete with each other.

The effect is attached below the outer gameplay root, while its beam pivot is repositioned from the authored scanning lens each rendered frame. This preserves gameplay ownership of the outer root and lets presentation-only body motion continue without adding a second movement authority.

## Architecture boundary

The scanner effect must remain presentation-only. Future refinement may change cone width, pulse timing, contour count, glow strength or sweep motion, but gameplay collection radius, beam range, resource eligibility and scan-lock timing stay in `SproutCompanionDefinitions.js` and `SproutCompanionController.js`. Rendering code must not introduce a second scan radius, target-selection rule or collection path.

The current effect deliberately does not add a real light source. Cyan visibility comes from additive unlit materials, preserving the existing mobile-first lighting budget and avoiding additional shadow or lighting work.
