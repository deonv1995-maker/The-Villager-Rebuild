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

  // The first tunneling milestone is intentionally bounded vertically while
  // remaining available anywhere on playable land.
  maxDepth: 18,
  bottomPadding: 1.05,
  surfaceOpeningPadding: 0.6,
  presentationPadding: 0.9,

  // The natural underworld is deterministic topology inside the same density
  // authority as player mining. Surface mouths are always known to the terrain,
  // while 3D passage/chamber meshes are activated only near the Ranger.
  naturalNetworkCount: 6,
  naturalActivationRadius: 52,
  // Marching-tetrahedra cave geometry is deliberately time-sliced. Registering
  // nearby density/collision columns stays immediate, but only this many new
  // natural-cave render chunks may be meshed in one frame.
  naturalChunkBuildsPerUpdate: 1,
  naturalMeshBudgetMs: 2,
  // World-space coherent noise: broad erosion plus resolved rock-scale detail.
  naturalNoiseFrequency: 0.19,
  naturalNoiseDetailFrequency: 0.61,
  naturalNoiseAmplitude: 0.95,
  naturalNoiseDetailAmplitude: 0.25,
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
  naturalGalleryPassageRadius: 2.55,
  naturalChamberRadiusMin: 4.8,
  naturalChamberRadiusMax: 6.2,
  naturalChamberFloorDepthScale: 0.5,
  naturalChamberFloorRadiusScale: 0.62,
  naturalChamberCeilingRiseScale: 0.82,
  naturalChamberOverburden: 1.6,
  naturalTightMinimumClearance: PLAYER_TRAVERSAL_TUNING.body.height + 0.4,
  naturalCentralChamberRadius: 6.6,
  naturalCentralChamberDepth: 12,
  naturalConnectorSegmentLength: 30,
  naturalConnectorBend: 7,
  naturalConnectorDepthMin: 11.2,
  naturalConnectorDepthMax: 13,

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
