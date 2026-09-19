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
      frontDepth: 5.6,
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

      // Pickaxe excavation is intentionally local and mobile-friendly. Boundary
      // padding keeps the finite volume sealed at its side/back/bottom edges.
      mineReach: 3.45,
      mineRadius: 1.05,
      mineInset: 0.38,
      boundaryPadding: 1.05
    })
  })
]);
