const LOG_LENGTH = 2.9;
const FLOOR_WIDTH = LOG_LENGTH / 3;
const CONSTRUCTION_GRID_STEP = LOG_LENGTH / 12;
const MAX_FLOOR_TERRAIN_ADAPTATION = 2.35;

export const PHYSICAL_LOG = Object.freeze({
  length: LOG_LENGTH,
  halfLength: LOG_LENGTH * 0.5,
  radius: 0.27,
  pickupRange: 2.8,
  placeDistance: 1.9,
  dropDistance: 1.62,
  gridStep: CONSTRUCTION_GRID_STEP,
  yawStep: Math.PI / 4,
  floorWidth: FLOOR_WIDTH,
  floorSplitOffset: FLOOR_WIDTH * 0.25,
  frameSnapRange: 2.25,
  floorSnapRange: 1.45,
  wallSnapRange: 1.7,
  angleSnapRange: 1.85,
  roofSnapRange: 3.15,
  frameSpacingTolerance: 0.18,
  floorGroundClearance: 0.08,
  // Compatibility name retained for PhysicalLogSystem placement validation. It now
  // represents the maximum high-side relief the local terrain layer may retreat.
  floorTerrainEmbedTolerance: MAX_FLOOR_TERRAIN_ADAPTATION,
  floorTerrainCorePadding: 0.12,
  floorTerrainBlendDistance: 1.55,
  floorTerrainSurfaceClearance: 0.065,
  floorMaxTerrainCutDepth: MAX_FLOOR_TERRAIN_ADAPTATION,
  floorUndersideDepth: 0.235,
  floorSupportSeamPadding: 0.06,
  floorSurfaceOverrideTolerance: 0.08,
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

export const CONSTRUCTION_DIMENSIONS = Object.freeze({
  wallThickness: 0.28,
  wallSectionStep: 0.78,
  wallSectionTopOffset: 0.76,
  wallCompletionTopTolerance: 0.08,
  wallTopTuck: 0.04,
  wallRowRadius: 0.26,
  doorClearWidth: 1.9,
  doorClearHeight: 2.45,
  openingJambOutset: 0.24,
  windowClearWidth: 1.55,
  windowSillHeight: 1.08,
  windowHeadHeight: 2.12
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
