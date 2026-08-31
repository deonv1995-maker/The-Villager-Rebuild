# Foundation 0.3.8 construction refinement

This hotfix keeps the Foundation 0.3.8 architecture and corrects four construction behaviours reported from Android device playtesting.

## Structural snapping

RAW structural beams now occupy a frame-pair slot keyed by the two upright frame IDs. Once a beam is present, RAW preview searches for another open frame-pair slot instead of repeatedly snapping over the existing beam. Demolishing the beam frees that slot again.

Floor panels inherit the exact construction level of a snapped neighbour regardless of which direction the Ranger is facing. Duplicate panel centres remain invalid.

## Terrain and floor support

Construction placement distinguishes immutable terrain height from standable construction height. Floor seating and automatic supports/fill sample `baseHeightAt` when available, so an already-built floor cannot make adjacent terrain appear artificially higher and a floor cannot suppress its own support generation.

The first floor seats close to the highest sampled terrain point with only a small clearance. Connected floors remain level. Lower terrain is handled by construction-owned fill/support visuals; terrain is not cut, flattened, or mutated.

Floor standable support extents now meet slightly past the visible panel boundary. This removes support-height gaps at end-to-end and side-by-side panel seams that could make the Ranger briefly lose ground support and fall through or glitch between panels.

## Roof completion

ROOF no longer chooses an outward side from the Ranger position. It detects a bounded region formed by two opposite, parallel frame pairs and creates missing inward roof members for that region: four eave-to-ridge rafters followed by the ridge member. Roof members use the physical Log visual and are length-fitted to the detected frame region.

The roof remains presentation-only for collision in this milestone, matching the existing Foundation 0.3.8 boundary. A future enclosed-building pass should add purpose-built roof/interior collision rather than a broad blocking box.

## Preserved systems

This refinement does not change spear throw behaviour, campfire runtime, terrain/world generation, water, world streaming, PWA/install files, or Pages deployment architecture.
