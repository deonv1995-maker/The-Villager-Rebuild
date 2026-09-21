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

  // Underground pockets are deterministic empty chambers. Resources and treasure
  // will be layered into these spaces only after tunneling is device-verified.
  pocketCellSize: 28,
  pocketChance: 0.34,
  pocketMinDepth: 5.2,
  pocketMaxDepth: 14.2,
  pocketMinRadius: 2.7,
  pocketMaxRadius: 4.4,

  // Hidden chambers use a deterministic cluster of overlapping lobes rather than
  // a single sphere. The outer radius remains the stable broad-phase boundary.
  pocketFloorLobeScale: 0.82,
  pocketTopLobeScale: 0.66,
  pocketSideLobeCount: 3,
  pocketSideLobeMinScale: 0.42,
  pocketSideLobeMaxScale: 0.56,
  pocketContentRadiusScale: 0.72
});

export const undergroundTunnelChunkSize = () =>
  UNDERGROUND_TUNNELING.cellSize * UNDERGROUND_TUNNELING.chunkCells;
