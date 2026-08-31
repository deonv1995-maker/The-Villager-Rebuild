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
  frameSpacingTolerance: 0.18,
  carryPosition: Object.freeze([0.08, 1.7, -0.18]),
  carryEuler: Object.freeze([0, -0.28, 0.1])
});

export const LOG_BUILD_MODES = Object.freeze(['raw', 'floor', 'frame', 'wall', 'angle']);

export const LOG_BUILD_LABELS = Object.freeze({
  raw: 'Raw log',
  floor: 'Split-log floor',
  frame: 'Log frame',
  wall: 'Split-log wall',
  angle: 'Angled log'
});
