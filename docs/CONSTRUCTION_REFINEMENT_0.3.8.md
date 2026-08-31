# Foundation 0.3.8 construction refinement

This hotfix keeps the Foundation 0.3.8 architecture and corrects construction behaviours reported from Android device playtesting.

## Structural snapping

RAW structural beams occupy a frame-pair slot keyed by the two upright frame IDs. Once a beam is present, RAW preview searches for another open frame-pair slot instead of repeatedly snapping over the existing beam. Demolishing the beam frees that slot again.

Floor panels inherit the exact construction level of a snapped neighbour regardless of which direction the Ranger is facing. Duplicate panel centres remain invalid.

## Terrain and floor support

Construction placement distinguishes immutable terrain height from standable construction height. Floor seating and automatic supports/fill sample `baseHeightAt` when available, so an already-built floor cannot make adjacent terrain appear artificially higher and a floor cannot suppress its own support generation.

The first floor uses the terrain height at its own centre as the walking level, with only a tiny clearance. The split-log half is embedded downward into the terrain so its flat walking face is effectively ground-flush rather than sitting a quarter-log above the ground. Small natural terrain variation may intersect the buried curved underside within a bounded tolerance. Connected floors inherit that exact level; when they extend downhill, their underside separates naturally from terrain and construction-owned fill/supports appear beneath them. Terrain is never cut, flattened, or mutated.

Automatic supports terminate at the real curved underside of the split-log floor rather than at the walking surface. This keeps ground-starting panels visually grounded while preserving meaningful supports for downhill extensions.

Floor standable support extents meet slightly past the visible panel boundary. Standable collision also distinguishes entering an elevated platform from moving across or away from its top/edge. This prevents the Ranger from becoming trapped against a floor side collider after stepping off it and restores free lateral turning/movement while carrying a Log on a platform.

## Construction preview performance

The first performance pass cached frame-pair, roof-region and roof-candidate topology by construction revision. That removed repeated roof topology work every rendered frame, but Android playtesting showed that the first ROOF selection could still freeze because it built a global pair-of-pairs graph across the entire structure before the cache existed.

ROOF preview now uses a bounded player-local topology query instead. Only nearby frame posts are considered, local frame candidates and frame-pair candidates have explicit mobile-safe caps, and the result is cached by construction revision plus snapped preview position. This removes the global combinatorial first-selection spike while preserving the same four-post roof-region rules. Distant structures cannot participate in the active roof preview query.

The ordinary RAW/WALL frame-pair cache remains unchanged because those modes were already stable and do not perform the pair-of-pairs roof search.

## Roof completion

ROOF detects a bounded region formed by two opposite, parallel frame pairs and creates missing inward roof members for that region: four eave-to-ridge rafters followed by the ridge member. Roof members use the physical Log visual and are length-fitted to the detected frame region.

The roof remains presentation-only for collision in this milestone, matching the existing Foundation 0.3.8 boundary. A future enclosed-building pass should add purpose-built roof/interior collision rather than a broad blocking box.

## Harvest feedback follow-up

Axe impacts add a short damped shake to the existing instanced tree render handles in addition to the wood-chip/ring hit feedback. The shake reuses the shared instanced geometry, restores the original instance matrices after the reaction, and does not alter tree collision, harvest counts, drops, ecology, or world streaming.

## Preserved systems

This refinement does not change spear throw behaviour, campfire runtime, terrain/world generation, water, world streaming, PWA/install files, or Pages deployment architecture.
