# Northern Cave Foothill Placement

## Decision

The first northern-highlands cave must read as an opening cut into the **base of the mountain**, not as a rock POI placed on top of the mountain surface.

`src/data/ExplorationPoiDefinitions.js` remains the authored POI source. `northern-cave-01` is anchored on the southern foothill where the surrounding terrain rises into the northern highlands.

`ExpandedIslandTerrainSystem` remains the only terrain-height authority. The cave does not introduce a second terrain mesh, a hidden collision floor, or a separate cave physics system.

## Terrain-cut contract

The cave now owns one data-driven `terrainCut` profile. `CaveTerrainProfile` converts the authored cave transform into a narrow terrain deformation that:

- leaves the exterior approach almost unchanged;
- sinks the threshold below the surrounding shoulders;
- continues downward through the tunnel instead of following the mountain surface upward;
- fades back into the normal highland terrain behind the authored alcove;
- leaves the terrain outside the cave corridor unchanged.

The terrain chunk intersecting the cave receives double the normal terrain tessellation so the cut is visible at the scale of the entrance. Ordinary terrain chunks keep the established mobile mesh density.

## Presentation contract

`ExplorationPoiSystem` still owns the negative-space mouth, tunnel shell, terrain-conforming floor/approach, dark terminus and chunk ownership. Those pieces now sample the carved authoritative terrain, so the entire entrance is lowered into the hillside and the walk-in floor descends beneath the surrounding ground.

The visible entrance shell is deliberately only a compact rocky rim around the negative-space aperture. Its outer face stays close to the mouth height and width; the authoritative terrain and terrain-embedded landform masses own the larger hillside silhouette. This prevents the entrance shell from becoming a freestanding stone arch sitting on the ground.

The surrounding low-poly rock masses remain terrain-embedded and lateral to the aperture. They support the natural rock face without becoming a freestanding boulder arch across the entrance.

This remains a short overworld alcove rather than a new cave-interior gameplay system. Existing collision ownership and traversal architecture are preserved.

## Regression contract

`scripts/verify-cave-entrance-readability.mjs` protects these conditions:

- the cave keeps its authored approach/tunnel orientation;
- the threshold receives a meaningful terrain cut while the exterior approach does not;
- the tunnel floor descends progressively into the hill;
- the surrounding hillside shoulders remain materially above the tunnel floor;
- only cave-influenced terrain chunks receive the higher local tessellation;
- the visible cave brow stays compact and tucked inside the terrain-embedded side masses so the hillside, not the shell, owns the entrance silhouette;
- the cave mouth, tunnel depth, terrain-conforming presentation and side-rock collision contract remain intact.
