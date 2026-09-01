# RAW Log frame-pair snap regression

This scoped fix restores the established physical-Log construction contract after Android playtesting showed a RAW Log remaining on the ground instead of snapping across the top of an otherwise valid frame pair.

## Root cause

Upright FRAME placement and RAW/WALL/roof frame-pair discovery were using different vertical tolerances. `FramePlacementRules` accepted posts as belonging to the same structural level within 0.4 m, while `PhysicalLogSystem` rejected the same pair when their top heights differed by more than 0.3 m. A frame arrangement the construction system had already accepted could therefore become invisible to RAW beam snapping.

## Single structural-level authority

`PHYSICAL_LOG.frameLevelTolerance` is the source of truth for the 0.4 m same-level tolerance. FRAME structural-fit checks, ordinary frame-pair discovery, and local roof frame-pair discovery all consume that same value.

Horizontal bay spacing remains strict at one full physical Log using `PHYSICAL_LOG.frameSpacingTolerance`. This change does not allow short wall bays, narrow floor-strip seams, or arbitrary diagonal posts to become structural frame pairs.

## Preserved behavior

- RAW top beams still use the two frame IDs as their `rawKey` occupancy slot.
- An occupied frame-pair slot cannot attract a duplicate RAW beam.
- RAW ridge placement remains gated by completed angled rafters.
- WALL and roof topology continue to use the established frame-pair architecture.
- Terrain, floors, frame placement, wall customization, controls, resources, wildlife, shipwreck/title scene, PWA and deployment architecture are otherwise unchanged.

## Regression coverage

`scripts/verify-raw-log-frame-snap.mjs` constructs a full-Log frame pair with a 0.35 m level difference that is legal under the existing FRAME rule, then proves that RAW preview snaps to `frame-pair-top`, confirms at the pair midpoint/top, retains the authoritative `rawKey`, and refuses a duplicate beam in the occupied slot.

## Android acceptance

Build two valid upright frame posts across a full-Log bay on slightly uneven supported levels, carry another Log, select RAW, and approach the bay. The preview must turn green and attract to the top beam position. After placing the beam, the same slot must no longer attract another RAW Log.
