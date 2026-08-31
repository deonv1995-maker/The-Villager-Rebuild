# Foundation 0.3.8 construction refinement

This hotfix keeps the Foundation 0.3.8 architecture and corrects construction behaviours reported from Android device playtesting.

## Structural snapping

RAW structural beams occupy a frame-pair slot keyed by the two upright frame IDs. Once a beam is present, RAW preview searches for another open frame-pair slot instead of repeatedly snapping over the existing beam. Demolishing the beam frees that slot again.

Floor panels inherit the exact construction level of a snapped neighbour regardless of which direction the Ranger is facing. Duplicate panel centres remain invalid.

## Terrain and floor support

Construction placement distinguishes immutable terrain height from standable construction height. Floor seating and automatic supports/fill sample `baseHeightAt` when available, so an already-built floor cannot make adjacent terrain appear artificially higher and a floor cannot suppress its own support generation.

The archived original guaranteed a clear foundation surface by lowering and blending terrain beneath ground floors. The rebuild deliberately keeps terrain/world generation immutable, so it restores the same gameplay invariant without bringing that terrain-cutting system back. A first floor now seats only about 8 cm above its centre terrain sample and is valid only when the highest sampled natural relief remains below its flat walking face. The resulting walk-on surface is roughly 11 cm above centre ground at most, while a location that would visibly protrude through the floor is rejected with a red preview instead of allowing terrain clipping.

Connected floors still inherit the exact established construction level. They therefore remain level across a room and naturally become elevated when extended downhill; construction-owned fill and log supports appear underneath the exposed underside. Terrain is never cut, flattened, or permanently mutated.

Automatic supports terminate at the real curved underside of the split-log floor rather than at the walking surface. This keeps ground-starting panels visually grounded while preserving meaningful supports for downhill extensions.

Floor standable support extents meet slightly past the visible panel boundary. Standable collision also distinguishes entering an elevated platform from moving across or away from its top/edge. This prevents the Ranger from becoming trapped against a floor side collider after stepping off it and restores free lateral turning/movement while carrying a Log on a platform.

## Construction preview performance

The first performance pass cached frame-pair, roof-region and roof-candidate topology by construction revision. That removed repeated roof topology work every rendered frame, but Android playtesting showed that the first ROOF selection could still freeze because it built a global pair-of-pairs graph across the entire structure before the cache existed.

ROOF preview uses a bounded player-local topology query. Only nearby frame posts are considered, local frame candidates and frame-pair candidates have explicit mobile-safe caps, and the result is cached by construction revision plus snapped preview position. Distant structures cannot participate in the active roof preview query.

The ordinary RAW/WALL frame-pair cache remains unchanged because those modes were already stable.

Android follow-up also exposed a separate runtime failure: an unsupported ROOF location correctly produced an invalid placement but had no resolved roof quaternion. Preview transforms therefore tolerate placement data that exists only for valid structural snaps. Unsupported ROOF locations retain a red preview using the snapped yaw instead of attempting to copy a missing quaternion. This is covered by a runtime regression that carries a physical Log, enters ROOF with no roof topology, advances repeated preview frames, and attempts an invalid confirmation without throwing.

The construction-preview invariant is explicit: **invalid previews must be render-safe and must never require fields that are only produced by valid placement resolution**. A failed preview may reject placement, but it must not terminate the animation loop.

## Roof completion

The archived original `RoofingSystem` and its perimeter framework resolver were re-read after Android testing showed that the rebuild's pair-of-pairs roof inference could choose conflicting gable orientations. The original did not treat arbitrary opposite frame pairs as a roof. It first resolved a closed top framework, ordered that perimeter as a polygon, chose one stable dominant roof axis, and projected both eaves inward toward a shared ridge.

The rebuild now follows that topology rule. Local one-log frame edges are grouped into connected components; a roof region is accepted only when those edges form a closed loop in which every perimeter frame has exactly two neighbours. The ordered perimeter then defines one deterministic gable axis. Rectangular structures use their dominant span, while square structures use a canonical tie-break so the roof cannot flip orientation as the Ranger moves or candidate ordering changes. Open three-sided arrangements do not resolve as roof regions.

For the current Foundation 0.3.8 log-frame milestone, a one-bay closed perimeter resolves the missing inward roof frame as four eave-to-ridge rafters plus the ridge member. Roof members use the physical Log visual and are length-fitted to the detected region. The archived later-stage plank/grass roof cladding system is intentionally not restored yet.

The roof remains presentation-only for collision in this milestone, matching the existing Foundation 0.3.8 boundary. A future enclosed-building pass should add purpose-built roof/interior collision rather than a broad blocking box.

## Harvest feedback follow-up

Axe impacts add a short damped shake to the existing instanced tree render handles in addition to the wood-chip/ring hit feedback. The shake reuses the shared instanced geometry, restores the original instance matrices after the reaction, and does not alter tree collision, harvest counts, drops, ecology, or world streaming.

## Preserved systems

This refinement does not change spear throw behaviour, campfire runtime, terrain/world generation, water, world streaming, PWA/install files, or Pages deployment architecture.
