# FRAME structural corner snap contract

This scoped correction restores the established one-room cabin flow shown during Android playtesting: three split-log floor strips form a one-Log-square floor, four upright FRAME posts occupy only the exterior structural corners, and the completed frame then feeds RAW beams, WALL bays and the existing roof sequence.

## Root cause

`PHYSICAL_LOG.frameSnapRange` was shorter than one physical Log. After the strict full-Log frame lattice was introduced, FRAME mode correctly rejected one-third/two-thirds floor seams and occupied corners. On mobile, however, the projected placement point could remain closest to one of those invalid corners while the next legal structural corner sat a full Log away. Because that legal corner was outside the search range, the preview stayed red even though the structure still had a valid next post.

## Correct boundary

FRAME interaction reach and FRAME structural validity are separate responsibilities:

- `frameSnapRange` controls how far FRAME mode may search floor corners for the next candidate.
- `framePlacementSpacingTolerance` remains the authority for whether that candidate belongs to the full-Log structural lattice.
- widening interaction reach must never make a one-third/two-thirds floor seam, occupied corner, or near-diagonal offset structurally valid.

The interaction search now reaches slightly beyond one full physical Log. The strict placement tolerance remains unchanged.

## Regression coverage

`scripts/verify-frame-structural-corner-snap.mjs` constructs the actual three-strip one-room floor, pre-populates three legal exterior posts, puts the mobile placement point on the occupied fourth-side corner, and verifies that FRAME mode reaches past it to the only missing legal full-Log corner. It then builds that post and proves no new frame is closer than the established full-Log spacing rule.

The existing RAW frame-pair, WALL, roof and thatch regressions remain authoritative for the later construction stages.

## Android acceptance

Build three floor strips side by side into one square floor. Place three exterior FRAME posts. With another Log carried and FRAME selected, approach from the occupied/post side shown in the screenshot. The preview must move to the missing exterior corner and turn green instead of remaining red on an invalid seam/corner. Place the fourth post, then continue with the established RAW top beams, WALL and ANGLE-rafter → RAW-ridge → thatch sequence.
