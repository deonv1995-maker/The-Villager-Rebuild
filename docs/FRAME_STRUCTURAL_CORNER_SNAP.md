# FRAME structural corner snap contract

This scoped correction restores the established one-room cabin flow shown during Android playtesting: three split-log floor strips form a one-Log-square floor, four upright FRAME posts occupy only the exterior structural corners, and the completed frame then feeds RAW beams, WALL bays and the existing roof sequence.

## Root cause

Two separate tolerances were being treated as one responsibility inside the FRAME placement rule.

The strict `framePlacementSpacingTolerance` correctly prevents a new FRAME post from being placed closer than one physical Log to an existing post. That is what keeps one-third/two-thirds floor seams from becoming short wall bays. However, the same strict tolerance was also being used to decide whether a candidate had a valid full-Log neighbour.

On a rotated three-strip floor, connected floor centers are quantized on the world construction grid while floor corners are derived from the exact local floor basis. Across the full three-strip width this can make an otherwise valid exterior edge slightly longer than one Log. The accumulated drift is intentionally small enough for the existing `frameSpacingTolerance`, which is already the authority for recognizing valid frame pairs, but it can exceed the stricter new-post tolerance. The result was the red `INVALID PLACEMENT` FRAME preview seen during Android testing even though the proposed exterior corner was not too close to any post.

A separate interaction issue also existed: `frameSnapRange` was shorter than one physical Log, so the mobile placement point could remain closest to an occupied/invalid corner while the next legal exterior corner sat outside the search radius. That reach problem was corrected previously and remains preserved here.

## Correct boundary

FRAME interaction reach, minimum post spacing and structural-neighbour recognition are separate responsibilities:

- `frameSnapRange` controls how far FRAME mode may search floor corners for the next candidate.
- `framePlacementSpacingTolerance` remains the strict minimum-distance guard for a newly placed post.
- `frameSpacingTolerance` recognizes an approximately full-Log neighbour across the bounded floor/grid drift already accepted by RAW/WALL/roof pair topology.
- a one-third/two-thirds floor seam, occupied corner, or near-diagonal offset must remain structurally invalid.

`frameCornerFitsStructure` now keeps the strict minimum-distance rejection unchanged but uses the existing frame-pair tolerance only for the positive question “does this candidate connect to a full-Log neighbour?”. This removes the conflict without weakening the no-short-bay rule or introducing a second source of truth.

## Regression coverage

`scripts/verify-frame-structural-corner-snap.mjs` now covers both live failure shapes:

1. A cardinal three-strip room with three legal exterior posts and the mobile placement point sitting on an occupied corner. FRAME mode must reach the remaining legal corner and build it.
2. A 45-degree three-strip room matching the two-back-post Android state. Its front-to-back exterior edge deliberately exceeds `framePlacementSpacingTolerance` because of grid quantization while remaining inside `frameSpacingTolerance`. FRAME mode must still snap green to the legal front exterior corner and build it.

Both cases prove that the new post remains at least `length - framePlacementSpacingTolerance` from every relevant existing post, so short wall bays are not reopened.

The existing RAW frame-pair, WALL, roof and thatch regressions remain authoritative for the later construction stages.

## Android acceptance

Build three floor strips side by side into one square floor, including a rotated/diagonal orientation. Place the two rear exterior FRAME posts as in the reported screenshot. With another Log carried and FRAME selected, approach either front exterior corner. The preview must snap to that exterior corner and turn green instead of remaining red. Complete all four posts, then continue with the established RAW top beams, WALL and ANGLE-rafter → RAW-ridge → thatch sequence.


## Exact floor and perimeter contract

Connected floor placement inherits the supporting panel's exact local basis. Only the first free floor is quantized to the world construction grid. This guarantees that three adjacent split-log strips form an exact physical-Log square at every supported rotation.

FRAME stations are derived from the exterior envelope of each connected, co-planar floor component and remain aligned to the full physical-Log lattice. Narrow one-third floor seams are never structural stations. Larger rectangular footprints may expose full-Log stations along their outer edges, while missing floor panels inside the footprint do not create inner FRAME stations or require the center to be covered.

A FRAME candidate within Ranger collision clearance is skipped before it can become a valid placement. This prevents a newly materialized upright from trapping the Ranger; the resolver may select another reachable legal exterior station, otherwise the preview remains invalid until the Ranger moves clear.

### Device acceptance

- Place three floor strips at a cardinal and diagonal angle; their outside edges must close as a perfect square.
- Stand against an exterior corner and attempt FRAME placement; no upright may appear through or trap the Ranger.
- Move clear and face the same corner, including a corner visually behind the bottom tool belt; the world-space snap must remain available.
- Lay out a larger perimeter footprint while leaving the middle floor area open. Full-Log FRAME stations must remain available around the outer boundary without requiring interior floor strips or interior posts.
