const LOG_LENGTH = 2.9;
const FLOOR_WIDTH = LOG_LENGTH / 3;
const CONSTRUCTION_GRID_STEP = LOG_LENGTH / 12;
const MAX_FLOOR_TERRAIN_ADAPTATION = 2.35;
const FRAME_PLACEMENT_SPACING_TOLERANCE = CONSTRUCTION_GRID_STEP * 0.35;
const FRAME_PAIR_SPACING_TOLERANCE = CONSTRUCTION_GRID_STEP * 0.6;
const FRAME_SNAP_RANGE = LOG_LENGTH + FRAME_PAIR_SPACING_TOLERANCE;
const FRAME_LEVEL_TOLERANCE = 0.4;
const FRAME_ISOLATION_RADIUS = LOG_LENGTH + FLOOR_WIDTH * 0.5;
const PLACEMENT_REACH = 1.9;
const STAIR_TREAD_COUNT = 6;
const STAIR_TREADS_PER_LOG = 2;
const STAIR_RUN_SPACES = 5;
const STAIR_RUN_LENGTH = FLOOR_WIDTH * STAIR_RUN_SPACES;
const STAIR_STEP_RUN = STAIR_RUN_LENGTH / STAIR_TREAD_COUNT;
// A floor target is a full Log by one-third Log rectangle. Cover the half-cell diagonal
// plus half a construction-grid step so aiming near a bay/strip seam still reaches one
// canonical floor slot instead of falling through to an unrelated ground placement.
const FLOOR_SNAP_RANGE = Math.hypot(LOG_LENGTH * 0.5, FLOOR_WIDTH * 0.5) + CONSTRUCTION_GRID_STEP * 0.5;
// First-person acquisition is deliberately much tighter than the broad structural query
// above. The centre reticle must actually intersect the intended floor footprint, with
// only a small seam allowance so mobile hand movement does not make exact seams unusable.
const FLOOR_RETICLE_SNAP_PADDING = CONSTRUCTION_GRID_STEP * 0.45;

export const PHYSICAL_LOG = Object.freeze({
  length: LOG_LENGTH,
  halfLength: LOG_LENGTH * 0.5,
  radius: 0.27,
  pickupRange: 2.8,
  placeDistance: PLACEMENT_REACH,
  dropDistance: 1.62,
  gridStep: CONSTRUCTION_GRID_STEP,
  yawStep: Math.PI / 4,
  floorWidth: FLOOR_WIDTH,
  floorSplitOffset: FLOOR_WIDTH * 0.25,
  // FRAME interaction must be able to reach the next full-Log structural corner even
  // when the mobile placement point is currently sitting on an occupied/invalid seam.
  // Spacing validity remains governed separately by framePlacementSpacingTolerance.
  frameSnapRange: FRAME_SNAP_RANGE,
  floorSnapRange: FLOOR_SNAP_RANGE,
  floorReticleSnapPadding: FLOOR_RETICLE_SNAP_PADDING,
  wallSnapRange: 1.7,
  // Retained for legacy persisted ANGLE pieces. New player-facing construction uses
  // the dedicated two-cell stair contract below; ROOF still stores rafters as ANGLE.
  angleSnapRange: 1.85,
  stairStepCount: STAIR_TREAD_COUNT,
  stairTreadsPerLog: STAIR_TREADS_PER_LOG,
  stairRunSpaces: STAIR_RUN_SPACES,
  stairStepRun: STAIR_STEP_RUN,
  stairRunLength: STAIR_RUN_LENGTH,
  stairSnapRange: LOG_LENGTH * 2 + PLACEMENT_REACH,
  stairMaxStepRise: 0.58,
  // From outside a full bay, the ordered ROOF workflow must still reach the far
  // rafter after nearer members have been placed. Keep topology local, but allow
  // interaction to span one physical Log plus the normal forward placement reach.
  roofSnapRange: LOG_LENGTH + PLACEMENT_REACH,
  // FRAME placement is deliberately stricter than recognition of an already-valid
  // frame pair. This prevents floor-strip seams becoming structural posts while
  // allowing a closed bay to absorb the small accumulated drift of snapped floors.
  framePlacementSpacingTolerance: FRAME_PLACEMENT_SPACING_TOLERANCE,
  frameSpacingTolerance: FRAME_PAIR_SPACING_TOLERANCE,
  frameLevelTolerance: FRAME_LEVEL_TOLERANCE,
  frameIsolationRadius: FRAME_ISOLATION_RADIUS,
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

// Player-selectable modes deliberately exclude ANGLE. ROOF still materializes rafters as
// the legacy/internal ANGLE mode so existing roof queries and saves remain compatible.
export const LOG_BUILD_MODES = Object.freeze(['raw', 'floor', 'frame', 'wall', 'stairs', 'roof']);
export const LOG_CONSTRUCTION_MODES = Object.freeze(['raw', 'floor', 'frame', 'wall', 'angle', 'stairs', 'roof']);

export const LOG_BUILD_LABELS = Object.freeze({
  raw: 'Raw log',
  floor: 'Split-log floor',
  frame: 'Log frame',
  wall: 'Split-log wall',
  angle: 'Angled log',
  stairs: 'Split-log stairs',
  roof: 'Roof log'
});