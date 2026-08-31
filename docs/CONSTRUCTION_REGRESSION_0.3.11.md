# Foundation 0.3.11 construction regression notes

This scoped Android refinement preserves the established terrain, world streaming, wall customization, PWA/install, and Pages deployment architecture.

## Traversal

A RAW log snapped across the top of an upright frame pair remains a collision obstacle but is not a standable support surface. Ground RAW logs keep their existing standable behavior.

## Floors

Placed split-log floors explicitly own their walking height within the floor support footprint. A small bounded support overlap is used at snapped panel boundaries so adjacent panels present one continuous walking surface even when natural terrain varies slightly below them.

## Roof completion

ROOF placement now checks existing roof members geometrically as well as by topology keys. A candidate matching an active member by center, height, axis, and fitted length is treated as occupied even if the local roof-region key changed. The next placement therefore resolves to an unoccupied roof member.

## Tree response visibility

Trees within the Ranger interaction radius remain on the standard opaque instanced render path. Camera occlusion fading only applies outside that near-player range so the normal tree presentation remains available for interaction feedback.

## Verification

`scripts/verify-device-regressions-0.3.11.mjs` covers frame traversal support, continuous floor support, geometric roof occupancy, and near-player tree presentation. The verifier is part of `npm run check`.
