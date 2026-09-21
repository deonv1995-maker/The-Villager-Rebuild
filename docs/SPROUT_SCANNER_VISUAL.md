# Sprout laser scanner visual

Status: **active presentation effect**.

Sprout's scanner is a visible game-native laser/holographic effect emitted from the authored **scanning lens** on the front-left of the production companion. The scanner supports the established collection behavior without owning resource search, reservation, compression, inventory, collision, navigation or story rules.

## Collection scan sequence

The collection sequence is intentionally staged so scanning and matter compression read as two different actions:

`select loose pickup -> scan while approaching -> stop in beam range -> scan-lock pause -> scanner off -> reserve/compress/store -> resume search`

`SproutCompanionController` remains the source of truth for that sequence. A selected pickup keeps `getPresentationState().scanning` active during approach and the short scan-lock pause. The controller also exposes the selected pickup position as the presentation-only `scanTarget`. Once the scan-lock pause completes and the reservation/compression transaction starts, `scanning` becomes false before the shrinking transfer begins.

The scan-lock duration is gameplay/presentation timing in `SproutCompanionDefinitions.js`; it is not duplicated in rendering code. Idle roaming scans and the automatic scan flourish still use the same scanner effect without a collection target.

The same scanner now also presents Sprout's underground hidden-pocket sense after allegiance. Pocket sensing never replaces the collection sequence: a live pickup target has priority, and the hidden-pocket scanner is suppressed throughout matter compression. For a hidden pocket, the controller supplies only a short directional endpoint plus a normalized proximity strength. It deliberately disables the terrain-grid/item-marker projection so the scanner suggests a direction without revealing the chamber's exact world coordinate.

The tree-cutting beam is intentionally separate from this cyan scanner presentation. Tree harvesting publishes a dedicated cutting state and trunk target to `SproutTreeLaserVisual`, which renders a narrow red lens-to-trunk beam and impact glow. The scanner cone, grid, contours and target marker remain hidden during tree cutting so scanning and cutting read as different tools.

## Lens-origin presentation contract

`SproutVisualRuntimeController` reads `scanning` and `scanTarget` and forwards them to `src/rendering/SproutScannerVisual.js`. It also exposes the island's existing `heightAt(x, z)` sampler to the scanner as a presentation-only terrain surface query. That query is not a second terrain authority and does not affect collision or movement.

The rendering layer resolves the authored `root.userData.scannerLens` world position every frame, converts it back into the outer companion root's local space, and places the scanner cone apex there. When a collection target exists, the cone aims from that physical lens position to the selected pickup. This lets the beam follow Sprout's body bob while still originating from the visible lens instead of the companion center or underside.

For ambient idle scans without a selected pickup, the same lens projects a short down-forward scan cone. Rendering remains target-aware only for presentation: it does not choose, validate or reserve resources.

## Terrain hologram and detected-item marker

When a real collection target exists, the scanner now projects a cyan wire grid over the ground around that pickup. Every grid vertex samples the existing island terrain height, so the laser lattice bends over slopes and small terrain height changes instead of remaining a flat decal. This makes the effect read as Sprout actively mapping the local surface.

The selected pickup receives a separate detected-item marker made from a ground ring/crosshair, a vertical locator line and a smaller upper ring around the item's reported position. The marker pulses with the existing scanner timing and disappears with the scanner before compression begins.

The terrain grid is presentation only. Its footprint size, line density and marker dimensions affect only the visual effect. They do not define collection radius, beam range, target eligibility or pathfinding. The existing flat footprint remains as the fallback for idle scans and for any case where a terrain height sampler is unavailable.

While scanning, the effect renders:

- a translucent cyan cone originating at the scanning lens;
- radial laser/grid rays inside the cone;
- several holographic contour rings;
- a terrain-conforming cyan wire grid around a selected pickup;
- a pulsing detected-item ring/crosshair and vertical locator;
- the existing rotating flat sweep/footprint for untargeted idle scans;
- gentle pulse/rotation animation.

When Sprout is not scanning, the scanner group is hidden rather than continuing to render transparently. The separate compression beam/halo belongs to the existing collection-transfer presentation and begins only after the scanner state has ended.

## Mobile rendering budget

The effect uses lightweight built-in Three.js geometry and shared unlit additive materials. It adds no textures, shaders, particles, skeletal animation or dynamic lights. The cone uses 24 radial segments. The targeted terrain hologram uses a small 6-by-6 sampled line grid plus compact line-based target markers; its vertex positions are updated only while an actual scan target is active. Materials disable depth writes so overlapping transparent scanner surfaces do not compete with each other.

The effect is attached below the outer gameplay root, while its beam pivot is repositioned from the authored scanning lens each rendered frame. Terrain-grid world samples are converted back into that same root's local space so gameplay ownership of the outer root is preserved and presentation-only body motion can continue without adding a second movement authority.

## Architecture boundary

The scanner effect must remain presentation-only. Future refinement may change cone width, terrain-grid density, pulse timing, contour count, glow strength or sweep motion, but gameplay collection radius, beam range, resource eligibility, scan-lock timing and underground pocket-detection range stay in `SproutCompanionDefinitions.js` and `SproutCompanionController.js`. Pocket existence/discovery remains owned by `UndergroundTunnelingSystem`. Rendering code must not introduce a second scan radius, target-selection rule, terrain authority, pocket-discovery path or collection path.

The current effect deliberately does not add a real light source. Cyan visibility comes from additive unlit materials, preserving the existing mobile-first lighting budget and avoiding additional shadow or lighting work.
