export const PHYSICAL_LOG = Object.freeze({
  length: 2.9,
  halfLength: 1.45,
  radius: 0.27,
  pickupRange: 2.8,
  placeDistance: 1.9,
  dropDistance: 1.62,
  gridStep: 0.25,
  yawStep: Math.PI / 4,
  floorWidth: 2.9 / 3,
  floorSplitOffset: (2.9 / 3) * 0.25,
  frameSnapRange: 1.55,
  floorSnapRange: 1.45,
  wallSnapRange: 1.7,
  angleSnapRange: 1.85,
  roofSnapRange: 3.15,
  frameSpacingTolerance: 0.18,
  floorGroundClearance: 0.012,
  floorGroundReliefLimit: 0.22,
  floorTerrainEmbedTolerance: 0.025,
  floorUndersideDepth: 0.235,
  floorFillThreshold: 0.1,
  floorSupportThreshold: 0.34,
  floorMaxSupportDepth: 2.75,
  roofPitch: Math.atan(0.72),
  roofMinRise: 0.78,
  roofMaxRise: 2.05,
  roofRegionMinWidth: 0.72,
  roofRegionMaxWidth: 8.7,
  roofLocalSearchRadius: 9,
  roofLocalFrameLimit: 48,
  roofLocalPairLimit: 64,
  carryPosition: Object.freeze([0.02, 1.84, -0.42]),
  carryEuler: Object.freeze([0, -0.12, -0.06])
});

export const LOG_BUILD_MODES = Object.freeze(['raw', 'floor', 'frame', 'wall', 'angle', 'roof']);

export const LOG_BUILD_LABELS = Object.freeze({
  raw: 'Raw log',
  floor: 'Split-log floor',
  frame: 'Log frame',
  wall: 'Split-log wall',
  angle: 'Angled log',
  roof: 'Roof log'
});
