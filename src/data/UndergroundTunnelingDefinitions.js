import { PLAYER_TRAVERSAL_TUNING } from './PlayerTraversalTuning.js';

const RANGER_CLEAR_MINE_MARGIN = 0.8;

export const UNDERGROUND_TUNNELING = Object.freeze({
  schemaVersion: 1,

  // Runtime geometry is generated lazily around excavations. The whole island is
  // never voxelized, which keeps tunneling viable on mobile.
  cellSize: 0.72,
  chunkCells: 12,

  mineReach: 4.6,
  mineRadius: (PLAYER_TRAVERSAL_TUNING.body.height + RANGER_CLEAR_MINE_MARGIN) * 0.5,
  mineCenterDrop:
    PLAYER_TRAVERSAL_TUNING.body.eyeHeight - PLAYER_TRAVERSAL_TUNING.body.height * 0.5,
  mineInset: 0.38,

  // Each Pickaxe strike carves a walking-oriented arch rather than a sphere.
  // The lower section keeps a flat floor and generous side clearance while the
  // upper section narrows into an oval roof for smoother tunnel traversal.
  tunnelWidthScale: 1.08,
  tunnelFloorDropScale: 0.68,
  tunnelShoulderRiseScale: 0.12,
  tunnelRoofRiseScale: 1.28,

  // Underground Raise / Lower / Smoothen / Level reuse the player-facing
  // terrain brush but modify only the local tunnel floor band. The clearance
  // guard prevents a Raise operation from sealing the Ranger into the roof.
  floorSculptVerticalBand: 0.82,
  floorSculptMinClearance: PLAYER_TRAVERSAL_TUNING.body.height + 0.45,

  // Natural caves now use several vertical strata. The density authority remains
  // lazy/chunked, so increasing depth does not voxelize the full island.
  maxDepth: 42,
  bottomPadding: 1.05,
  surfaceOpeningPadding: 0.6,
  presentationPadding: 0.9,

  // The natural underworld is deterministic topology inside the same density
  // authority as player mining. Surface mouths are always known to the terrain,
  // while 3D passage/chamber meshes are activated only near the Ranger.
  naturalNetworkCount: 6,
  naturalActivationRadius: 68,
  // Horizontal prewarming can start early, but unrelated deep strata must not
  // flood the mesh queue while the Ranger is still near the surface.
  naturalActivationVerticalRadius: 18,
  // Feature bounds can be much longer/larger than the part the Ranger can actually
  // see. Only chunk cells inside this local 3D prewarm window enter the render queue.
  // This keeps a nearby long gallery/drop from scheduling its entire feature at once.
  naturalRenderPrewarmRadius: 34,
  naturalRenderPrewarmVerticalRadius: 24,
  // Queued chunks that become irrelevant after fast movement/drop traversal are
  // discarded and can be requested again later. Retention is deliberately larger
  // than prewarm so ordinary movement does not churn the queue.
  naturalQueueRetentionRadius: 50,
  naturalQueueRetentionVerticalRadius: 34,
  // When an unbuilt chunk is close enough to become visible, allow a small bounded
  // emergency budget rather than exposing the empty sky/background through the cave.
  naturalCriticalRenderRadius: 18,
  naturalCriticalChunkBuildsPerUpdate: 3,
  naturalCriticalMeshBudgetMs: 4,
  // Marching-tetrahedra cave geometry is deliberately time-sliced. Registering
  // nearby density/collision columns stays immediate. Optimized chunks may finish
  // two-at-a-time, but the millisecond deadline remains the primary frame guard.
  naturalChunkBuildsPerUpdate: 2,
  naturalMeshBudgetMs: 2,
  // World-space coherent noise: broad erosion plus resolved rock-scale detail.
  naturalNoiseFrequency: 0.19,
  naturalNoiseDetailFrequency: 0.61,
  naturalNoiseAmplitude: 0.95,
  naturalNoiseDetailAmplitude: 0.25,
  // Primary passages cache low-frequency static-noise bends and two local width
  // pockets at world creation. Density sampling then uses only cached arithmetic.
  naturalRouteNoiseFrequency: 0.055,
  naturalRouteWarpMinLength: 8,
  naturalRouteLateralWarpFraction: 0.18,
  naturalRouteMaxLateralWarp: 4.2,
  naturalRouteVerticalWarpFraction: 0.1,
  naturalRouteMaxVerticalWarp: 3.8,
  naturalRouteRadiusBulge: 1.5,
  naturalEntranceAngleOffset: 0.22,
  naturalEntranceAngleJitter: 0.24,
  naturalEntranceRadiusFractionMin: 0.5,
  naturalEntranceRadiusFractionMax: 0.66,
  naturalEntranceRadiusMin: 2.35,
  naturalEntranceRadiusMax: 2.9,
  naturalEntranceLongScale: 1.55,
  naturalEntranceShortScale: 0.9,
  naturalPassageRadiusMin: 1.75,
  naturalPassageRadiusMax: 2.2,
  naturalTightPassageRadius: 1.48,
  naturalGalleryPassageRadius: 2.65,
  // A sub-Ranger fissure can visually reveal a sealed chamber but cannot be
  // traversed until the player mines the opening wider.
  naturalFissurePassageRadius: 0.44,
  naturalChamberRadiusMin: 5.2,
  naturalChamberRadiusMax: 7.4,
  naturalDropChamberRadiusMin: 7.5,
  naturalDropChamberRadiusMax: 10,
  naturalSealedChamberRadiusMin: 5.2,
  naturalSealedChamberRadiusMax: 7.2,
  naturalChamberFloorDepthScale: 0.5,
  naturalChamberFloorRadiusScale: 0.62,
  naturalChamberCeilingRiseScale: 0.82,
  naturalChamberOverburden: 1.6,
  naturalTightMinimumClearance: PLAYER_TRAVERSAL_TUNING.body.height + 0.4,
  naturalCentralChamberRadius: 10.5,
  naturalCentralChamberDepth: 31,
  naturalFirstChamberDepthMin: 8.5,
  naturalFirstChamberDepthMax: 11.5,
  naturalSideChamberDepthMin: 13,
  naturalSideChamberDepthMax: 18,
  naturalDropChamberDepthMin: 26,
  naturalDropChamberDepthMax: 33,
  naturalDeepChamberDepthMin: 20,
  naturalDeepChamberDepthMax: 27,
  naturalSealedChamberDepthMin: 16,
  naturalSealedChamberDepthMax: 26,
  naturalFirstChamberDistance: 34,
  naturalSideChamberDistanceMin: 18,
  naturalSideChamberDistanceMax: 28,
  naturalDropChamberDistanceMin: 11,
  naturalDropChamberDistanceMax: 17,
  naturalDeepChamberDistance: 66,
  naturalSealedChamberDistanceMin: 15,
  naturalSealedChamberDistanceMax: 22,
  naturalConnectorSegmentLength: 26,
  naturalConnectorBend: 8.5,
  naturalConnectorVerticalWave: 5.5,

  // Underground pockets are deterministic empty chambers. Resources and treasure
  // will be layered into these spaces only after tunneling is device-verified.
  pocketCellSize: 28,
  pocketChance: 0.34,
  pocketMinDepth: 5.2,
  pocketMaxDepth: 14.2,
  pocketMinRadius: 2.7,
  pocketMaxRadius: 4.4,

  // Hidden chambers use a deterministic flat-floor chamber profile with
  // overlapping rotated elliptical alcoves. The outer radius remains the stable
  // broad-phase/chunk boundary; it is not the visible cave wall.
  pocketFloorDepthScale: 0.68,
  pocketFloorRadiusScale: 0.58,
  pocketMainLobeLongScale: 0.8,
  pocketMainLobeShortScale: 0.6,
  pocketTopLobeLongScale: 0.62,
  pocketTopLobeShortScale: 0.46,
  pocketSideLobeCount: 3,
  pocketSideLobeMinScale: 0.34,
  pocketSideLobeMaxScale: 0.48,
  pocketCeilingBaseScale: 0.46,
  pocketCeilingCrownScale: 0.84,
  pocketCeilingShoulderDropScale: 0.18,
  pocketContentRadiusScale: 0.54
});

export const undergroundTunnelChunkSize = () =>
  UNDERGROUND_TUNNELING.cellSize * UNDERGROUND_TUNNELING.chunkCells;
