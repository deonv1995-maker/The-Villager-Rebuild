# RAW Log frame-pair snap regression

This construction contract covers two Android regressions where an otherwise valid physical-Log frame stopped exposing the RAW top-beam slots needed to finish a cabin.

## Structural contract

There are two deliberately different tolerances in the frame system:

- **FRAME placement is strict.** New upright posts must still sit on the full physical-Log structural lattice. `PHYSICAL_LOG.framePlacementSpacingTolerance` prevents one-third/two-thirds split-floor seams and near-diagonal offsets from becoming wall stations.
- **Already-valid frame-pair recognition is slightly more forgiving.** `PHYSICAL_LOG.frameSpacingTolerance` allows a bounded closing-edge error between posts that were each legally placed through another full-Log neighbour. This is necessary because a multi-edge floor/frame sequence can accumulate a small grid closure drift even when every individual FRAME placement was valid.

The pair tolerance remains below the known distance error produced by a one-floor-strip near-diagonal offset. It therefore does not restore short wall bays or the cramped door/window geometry that the full-Log lattice removed.

## Vertical consistency

`PHYSICAL_LOG.frameLevelTolerance` remains the single 0.4 m same-level authority. FRAME structural-fit checks, RAW/WALL pair discovery, construction roof discovery and `StructureRoofQuery` consume the same accepted level tolerance.

A frame arrangement accepted by the building system must not later become invisible to RAW beams, roof rafters, thatch or interior roof queries simply because its supported posts differ slightly in height.

## One-room cabin invariant

A normal cabin may be built as:

1. connected split-log floor panels;
2. four legal upright FRAME posts on the outer corners;
3. four RAW top beams closing the perimeter;
4. WALL sections between the full-Log frame pairs;
5. ANGLE roof rafters;
6. RAW ridge member(s);
7. thatch panels after the roof framework is complete.

If three perimeter RAW beam slots are occupied, the remaining valid closing edge must still attract a carried RAW Log and turn the preview green. Closing that fourth edge must leave the established ANGLE-rafter roof sequence available.

## Preserved behavior

- RAW top beams still use the two frame IDs as their authoritative `rawKey` occupancy slot.
- An occupied frame-pair slot cannot attract a duplicate RAW beam.
- RAW ridge placement remains gated by completed angled rafters.
- WALL bays remain full-Log structural bays.
- One-third/two-thirds floor seams remain invalid FRAME stations.
- The known one-floor-strip near-diagonal offset remains invalid as both a new FRAME placement and a recognized beam/wall pair.
- Floor placement, wall customization, roof member sequencing, terrain, collision, controls, resources, wildlife, shipwreck/title scene, PWA and deployment architecture are otherwise unchanged.

## Regression coverage

`scripts/verify-raw-log-frame-snap.mjs` now proves all of the following:

- a legal 0.35 m frame-level difference still produces a RAW top-beam snap;
- an occupied RAW slot rejects a duplicate;
- a four-post one-room frame whose closing edge accumulated 0.12 m of horizontal drift still resolves all four perimeter frame pairs and one roof region;
- the missing fourth RAW beam builds instead of remaining as a red ground preview;
- that closed frame immediately exposes the established ANGLE roof-rafter sequence;
- a one-floor-strip near-diagonal offset remains rejected.

`scripts/verify-roof-build-sequence.mjs` separately protects the strict FRAME lattice and the multi-bay ANGLE-rafter → RAW-ridge → thatch sequence.

## Android acceptance

Build the same one-room cabin shape used in the earlier working device build: three floor strips across a full-Log square, four outer corner posts, then RAW top beams around the perimeter. Every open side must attract RAW to the post tops. After all four sides are closed, WALL placement and the ANGLE/RAW roof sequence must work as before. No closer one-third-floor frame stations should become available.
