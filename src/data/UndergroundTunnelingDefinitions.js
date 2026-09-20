import { PLAYER_TRAVERSAL_TUNING } from './PlayerTraversalTuning.js';

const RANGER_CLEAR_MINE_MARGIN = 0.8;

export const UNDERGROUND_TUNNELING = Object.freeze({
  schemaVersion: 1,

  // Runtime geometry is generated lazily around excavations. The whole island is
  // never voxelized, which keeps tunneling viable on mobile.
  cellSize: 0.72,
  chunkCells: 12,

  mineReach: 3.45,
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
  pocketMaxRadius: 4.4
});

export const undergroundTunnelChunkSize = () =>
  UNDERGROUND_TUNNELING.cellSize * UNDERGROUND_TUNNELING.chunkCells;
