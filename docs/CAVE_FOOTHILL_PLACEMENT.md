# Northern Cave Foothill Placement

## Decision

The first northern-highlands cave must read as an opening cut **under the foothill**, not as a rock POI or a pile of boulders placed on top of the terrain.

`src/data/ExplorationPoiDefinitions.js` remains the authored POI source. `northern-cave-01` stays on the southern foothill and keeps its approach facing the mainland route.

`ExpandedIslandTerrainSystem` remains the only terrain-height and walkable-ground authority. The cave does not introduce a second collision floor or a separate cave physics system.

## Terrain-cut contract

The cave owns one data-driven `terrainCut` profile. `CaveTerrainProfile` converts the authored cave transform into a narrow terrain deformation that:

- leaves the far exterior approach effectively unchanged;
- uses a longer traversable descent into the threshold;
- places the threshold materially below the untouched hillside shoulders;
- continues downward through the tunnel instead of following the rising mountain surface;
- fades back into the normal highland terrain behind the authored alcove;
- leaves terrain outside the cave corridor unchanged.

The entrance is intentionally human-scale. An oversized portal cannot be buried convincingly in this foothill without adding artificial mountain volume around it, so the authored mouth is now 6.2 units wide and 3.4 units high while preserving comfortable traversal clearance.

The terrain chunk intersecting the cave keeps the established local refinement. Ordinary terrain chunks retain the normal mobile mesh density.

## Underground presentation contract

A single-valued heightfield can provide the cave floor or the hillside roof at a given X/Z position, but not both simultaneously. The authoritative heightfield therefore remains the carved walkable floor, while `ExplorationPoiSystem` owns a tightly scoped **presentation-only terrain overburden** above the rear tunnel.

That overburden:

- reconstructs its vertices from the pre-cave authoritative hillside height, rather than inventing a second terrain profile;
- starts only after the visible cave mouth, where the natural hillside has risen to the cave brow;
- overlaps the continuous rock tunnel shell so there is no open trench between the entrance and buried section;
- continues beyond the alcove until the authored terrain cut fades out;
- uses the shared terrain surface-colour rules so it reads as continuation of the mountain ground;
- has no collision or height-authority role. Ranger grounding and cave-floor traversal continue to use `ExpandedIslandTerrainSystem.heightAt()`.

The former large dodecahedron hillside masses are removed. They were substantially embedded but still made the silhouette read as a freestanding pile of rocks because they supplied most of the visible mountain volume. Only two small lateral breakup rocks remain at the portal; they do not define the hillside silhouette.

The visible entrance is a compact negative-space rock shell. It extends far enough under the overburden to make the tunnel visibly enter the hill, while the recessed interior ribs begin behind that continuous shell and cannot contribute to the exterior silhouette.

This remains a short overworld alcove rather than a separate cave-interior gameplay system.

## Regression contract

`scripts/verify-cave-entrance-readability.mjs` protects these conditions:

- the authored approach/tunnel orientation remains correct;
- the far approach is effectively uncut while the threshold is at least 2.5 units below the original terrain;
- the exterior descent stays traversable rather than becoming a cliff or decorative flat patch;
- the tunnel floor keeps descending and untouched shoulders remain several units above it;
- the old large exterior landform group cannot return;
- the terrain overburden is presentation-only, samples the pre-cut authoritative terrain, carries terrain-style vertex colour, starts behind the mouth and extends beyond the alcove;
- the compact shell overlaps the overburden and remains close to the human-scale mouth dimensions;
- entrance dressing stays lateral and limited to two small rocks;
- interior depth cues, dark terminus, terrain-conforming floor/approach, local terrain refinement and the established side-wall collision contract remain intact.
