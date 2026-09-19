import { PLAYER_TRAVERSAL_TUNING } from './PlayerTraversalTuning.js';

const RANGER_CLEAR_MINE_MARGIN = 0.4;
const RANGER_CLEAR_MINE_RADIUS = (PLAYER_TRAVERSAL_TUNING.body.height + RANGER_CLEAR_MINE_MARGIN) * 0.5;
const RANGER_MINE_CENTER_DROP = PLAYER_TRAVERSAL_TUNING.body.eyeHeight - PLAYER_TRAVERSAL_TUNING.body.height * 0.5;

export const EXPLORATION_POIS = Object.freeze([
  Object.freeze({
    id: 'northern-cave-01',
    type: 'cave',
    region: 'northernHighlands',
    // The first cave remains on the southern foothill and faces the established
    // mainland approach. Cave-local -Z is outside; +Z continues into the hill.
    x: -52,
    z: -113,
    yaw: 3.32,
    mouthWidth: 6.2,
    mouthHeight: 3.4,
    depth: 8.5,

    // The cave now owns a bounded volumetric ground section instead of a visual
    // arch/roof/liner assembled on top of the heightfield. The normal island
    // heightfield remains authoritative everywhere outside this footprint.
    mineableVolume: Object.freeze({
      halfWidth: 7.2,
      frontDepth: 7.2,
      backDepth: 14.4,
      cellSize: 0.72,
      surfaceHeadroom: 1.25,
      floorDepth: 2.6,

      // The initial void is a naturally open tunnel entering from the downhill
      // edge and descending gently beneath the rising foothill.
      tunnelStartZ: -5.05,
      tunnelEndZ: 8.7,
      tunnelHalfWidth: 2.55,
      tunnelHalfHeight: 2.05,
      tunnelEndCapDepth: 1.15,
      entranceFloorOffset: 0.2,
      tunnelDrop: 1.15,

      // Only the natural mouth cuts the legacy island surface. The rest of the
      // finite volume remains covered by the normal hill surface until a later
      // surface-breakthrough milestone owns dynamic top-surface edits.
      surfaceOpeningCenterZ: -4.1,
      surfaceOpeningHalfWidth: 3.35,
      surfaceOpeningHalfDepth: 2.55,
      surfaceOpeningBoundaryInset: 0.5,

      // Static vegetation is cleared only around the exposed mouth so grass and
      // ground cover never float across the tunnel opening.
      vegetationExclusionCenterZ: -3.8,
      vegetationExclusionRadius: 4.0,

      // Pickaxe excavation is intentionally local and mobile-friendly. Boundary
      // padding keeps the finite volume sealed at its side/back/bottom edges.
      mineReach: 3.45,
      mineRadius: RANGER_CLEAR_MINE_RADIUS,
      mineCenterDrop: RANGER_MINE_CENTER_DROP,
      mineInset: 0.38,
      boundaryPadding: 1.05
    })
  })
]);
