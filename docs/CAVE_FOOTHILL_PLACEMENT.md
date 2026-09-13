# Northern Cave Foothill Placement

## Decision

The first northern-highlands cave must read as an opening cut into the **base of the mountain**, not as a rock POI placed on top of the mountain surface.

`src/data/ExplorationPoiDefinitions.js` remains the authored POI source. `northern-cave-01` is anchored on the southern foothill where the authoritative terrain falls toward the player approach and rises behind the cave mouth into the mountain mass.

`ExpandedIslandTerrainSystem` remains the only terrain-height authority. The cave does not introduce a second terrain mesh or a private collision surface.

## Presentation contract

`ExplorationPoiSystem` keeps the existing negative-space mouth, tunnel shell, terrain-conforming floor/approach and chunk ownership. The surrounding low-poly rock masses are now deliberately terrain-embedded: their centres are held close to the sampled terrain surface so a substantial portion of every mass is buried rather than appearing as a loose boulder pile resting on the ground.

This is a presentation placement fix, not a new cave-interior system. The authored cave remains a short overworld alcove and preserves the existing side-rock collision contract.

## Regression contract

`scripts/verify-cave-entrance-readability.mjs` protects three foothill conditions:

- the mouth remains below the elevated mountain core;
- terrain falls toward the exterior approach and rises behind the mouth;
- every broad cave-landform mass is substantially buried into the authoritative terrain.

The existing cave-facing, clear-aperture, tunnel-depth, terrain-conforming floor/approach and collision checks remain in force.
