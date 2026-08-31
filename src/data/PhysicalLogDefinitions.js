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
  roofSnapRange: 2.7,
  frameSpacingTolerance: 0.18,
  floorGroundClearance: 0.02,
  floorFillThreshold: 0.1,
  floorSupportThreshold: 0.34,
  floorMaxSupportDepth: 2.75,
  roofPitch: Math.PI * 0.18,
  roofMinRise: 0.62,
  roofMaxRise: 1.85,
  roofRegionMinWidth: 0.72,
  roofRegionMaxWidth: 4.35,
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
