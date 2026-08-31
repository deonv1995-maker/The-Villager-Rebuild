# Construction Terrain Adaptation

## Status

Implemented on `feat/slope-floor-terrain-adaptation` as the slope/foundation follow-up to Foundation 0.3.8.

## Goal

Placed split-log floors may form level buildings on irregular terrain, including partially into slopes, without turning procedural terrain generation into mutable save-state.

The behavior intentionally follows the useful split from the archived original game:

- high-side terrain can retreat below a floor and blend back into the natural slope;
- low-side terrain is not raised by terrain deformation;
- construction-owned fill/supports carry the downhill side.

The rebuild does **not** copy the archived implementation's permanent accumulated vertex mutation. Active construction is the source of truth for a reversible derived layer.

## Ownership boundaries

### Procedural terrain

`ExpandedIslandTerrainSystem` remains the immutable world-generation authority. `TestIslandSystem.baseHeightAt(x, z)` continues to return that natural procedural height.

No floor placement writes new values into terrain-generation functions, seeds, regions, water rules or world-generation data.

### Construction terrain overlay

`ConstructionTerrainAdaptationSystem` owns the temporary presentation/collision surface caused by active ground floors.

It:

- captures the generated terrain chunk vertex heights/colors once after terrain creation;
- derives rectangular floor cut footprints from active floor placements;
- lowers only terrain that rises above the floor clearance plane;
- blends the cut outward over a bounded local distance;
- updates only terrain chunks affected by floors that were added or removed;
- exposes a construction-adjusted height query for movement/collision;
- restores captured natural vertex heights/colors when the relevant floors are demolished.

Because the overlay starts from captured natural values every time an affected chunk is rebuilt, repeated construction/demolition cannot progressively corrupt the procedural island.

### Floor placement

`PhysicalLogSystem` keeps its existing exact floor snapping and common-level inheritance. The legacy `floorTerrainEmbedTolerance` property is retained as a compatibility-facing placement contract but now aliases the single `MAX_FLOOR_TERRAIN_ADAPTATION` depth authority.

A first floor is still seated from the natural terrain sample. Connected floors still inherit the neighboring floor's exact `baseY`. This means a connected set forms one coherent terrace elevation while the high side retreats and the low side is supported.

Terrain retreat and support depth are both bounded. Construction is therefore more permissive on slopes without allowing a floor to bridge arbitrary cliffs.

### Low-side foundation/support

`FloorSupportVisual` remains separate from terrain deformation and continues to sample `baseHeightAt` (immutable natural terrain).

It now owns one `construction-floor-foundations` root for all active floors rather than creating independent support roots per panel. Common corner candidates are merged, preventing connected floor seams from accumulating duplicate posts/fill.

Moderate gaps use earthen fill piers; deeper gaps use vertical log supports. Removing a floor rebuilds the shared foundation from the remaining active floor set.

### Vegetation

Grass and ferns both receive the shared collision and construction-terrain boundaries.

A placed floor clears vegetation by horizontal footprint, independent of the vegetation's pre-cut Y position. The ecology entries are not deleted: instances are hidden while covered and are restored after demolition.

Visible vegetation in the blended high-side transition reprojects to the construction-adjusted terrain height. Removing the floor returns it to the natural terrain surface.

Trees, rocks and other solid environment objects remain governed by existing scatter reservations and collision. Floor placement does not silently delete those world objects.

## Traversal and collision

`WorldCollisionSystem` continues to own movement and standable construction surfaces.

The island now gives collision two distinct terrain concepts:

- `baseHeightAt`: construction-adjusted ground surface used for movement slope/drop evaluation;
- public `TestIslandSystem.baseHeightAt`: immutable procedural terrain used by construction placement and low-side supports.

Placed floor colliders remain the authoritative standable surface over the local terrain cut. Existing seam support, platform-edge escape, jumping/falling and structure collision behavior is preserved.

## Demolition lifecycle

Removing a floor performs the existing construction demolition flow and then, through the floor-support ownership boundary:

1. removes that floor from the active foundation set;
2. resynchronizes active construction terrain footprints;
3. rebuilds only affected terrain chunks from their captured natural baseline plus remaining active floors;
4. rebuilds the shared low-side foundation from remaining floors;
5. lets grass/fern occlusion resynchronize from collision/terrain revisions.

The procedural world itself is never rewritten.

## Regression coverage

`scripts/verify-construction-refinement.mjs` covers:

- bounded high-side lowering;
- no terrain raising on the low side;
- unchanged terrain outside the blend;
- connected floors sharing a terrace level;
- terrain mesh/color restoration after demolition;
- merged connected-floor foundation supports;
- exact standable floor seams;
- grass and fern clearing/restoration;
- architectural source contracts keeping immutable natural terrain separate from construction adaptation.

The full repository `npm run check` remains the merge gate so roof, walls, tools, survival, harvesting, landscape, streaming, build output and PWA behavior are also protected.
