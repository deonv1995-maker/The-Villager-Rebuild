# Northern Cave Foothill Placement

## Decision

The first northern-highlands cave must read as a **buried opening cut into the foothill with an impact scar leading into it**, not as a ring, pipe, black block, rock POI, or pile of boulders placed on top of the terrain.

`src/data/ExplorationPoiDefinitions.js` remains the authored POI source. `northern-cave-01` stays on the southern foothill and keeps its approach facing the mainland route.

`ExpandedIslandTerrainSystem` remains the only terrain-height and walkable-ground authority. The cave does not introduce a second collision floor or a separate cave physics system.

## Terrain-cut contract

The cave owns one data-driven `terrainCut` profile. `CaveTerrainProfile` converts the authored cave transform into a narrow terrain deformation that:

- leaves the far exterior approach effectively unchanged;
- uses a traversable descent into the threshold;
- places the threshold materially below the untouched hillside shoulders;
- continues downward through the tunnel instead of following the rising mountain surface;
- fades back into the normal highland terrain behind the authored alcove;
- leaves terrain outside the cave corridor unchanged.

The entrance remains human-scale at 6.2 units wide by 3.4 units high. The visible portal is **not** placed at local Z = 0 anymore. Its data-defined `presentation.portalInset` moves the rock reveal farther into the terrain cut, where the authoritative floor is lower and the original hillside is higher. This lets the brow physically tuck under the real foothill instead of projecting above it as a freestanding ring.

The terrain chunk intersecting the cave keeps the established local refinement. Ordinary terrain chunks retain the normal mobile mesh density.

## Presentation contract

A single-valued heightfield can provide the cave floor or the hillside roof at a given X/Z position, but not both simultaneously. The authoritative heightfield therefore remains the carved walkable floor, while `ExplorationPoiSystem` owns tightly scoped **presentation-only** surfaces above and beside that floor.

The presentation is divided into explicit responsibilities:

- **Impact scar** — a small irregular exposed-soil surface follows the authoritative terrain from the exterior descent to the portal. It replaces the old visual read of a featureless black pit and does not affect grounding or collision.
- **Shallow portal reveal** — the negative-space rock shell is only 1.35 units deep and is anchored to the carved floor at `portalInset`. It uses the normal exterior rock material on the full shallow shell, preventing the long black slab that was visible when the third-person camera moved around the old extrusion.
- **Terrain overburden** — the terrain-coloured roof reconstructs the pre-cut hillside and begins shortly behind the portal. It overlaps the shallow reveal, continues past the alcove, and has no collision role.
- **Tunnel liner** — lightweight left-wall, right-wall, and roof surfaces sit underneath the overburden and follow the descending floor. Their only job is to close presentation gaps so an interior/side third-person view cannot see sky through the heightfield cut. There is deliberately no liner floor; the authoritative terrain remains visible and walkable beneath it.
- **Interior depth cues** — small recessed ribs and a dark terminus remain inside the liner and cannot define the exterior silhouette.
- **Impact debris** — eight small fragments sit outside the central path. They are presentation-only and deliberately capped below half-unit scale so they cannot become the giant black blobs seen in the previous cave.

The former large dodecahedron hillside masses remain prohibited. The only larger entrance dressing is two restrained lateral breakup rocks beside the portal; the actual terrain owns the hillside silhouette.

The dark cave-floor presentation now starts at the inset portal instead of at the beginning of the terrain cut. The exterior descent therefore reads as soil/crater approach first, then cave interior, rather than a black hole opening in the grass.

The cave remains a short overworld alcove rather than a separate cave-interior gameplay system.

## Collision contract

The existing four side-wall obstacle entries remain the cave collision boundary. Their X/Z placement now follows the buried portal and tunnel rather than sitting in front of the visible mouth, and their vertical bounds are sampled from the authoritative descending terrain at each obstacle position. This keeps collision aligned with what the player sees without adding another floor or cave physics authority.

## Regression contract

`scripts/verify-cave-entrance-readability.mjs` protects these conditions:

- the authored approach/tunnel orientation remains correct;
- the far approach is effectively uncut while the threshold is at least 2.5 units below the original terrain;
- the exterior descent stays traversable and the cave floor remains above the global water plane;
- the tunnel floor keeps descending and untouched shoulders remain several units above it;
- the visible portal stays data-inset, floor-anchored, shallow, and tucked under the pre-cut hillside surface;
- the old large exterior landform group cannot return;
- the terrain overburden remains presentation-only, terrain-coloured, and overlapped by the shallow portal reveal;
- the impact scar follows authoritative terrain and reaches from the exterior approach to the buried portal;
- impact debris remains small and outside the central approach;
- the interior liner contains exactly left wall, right wall, and roof surfaces and cannot become a second floor;
- interior depth cues, dark terminus, terrain-conforming floor/approach, local terrain refinement, and the four-obstacle side-wall collision contract remain intact.

## Device verification

After deployment, verify the cave from the front, both side angles, and from just inside the portal in third person. The expected read is: exposed soil descent -> compact rock opening under the hill -> enclosed dark tunnel. There must be no giant ring, long black side block, floating rock mass, visible sky/blue gap through the tunnel sides or roof, or black exterior pit.
