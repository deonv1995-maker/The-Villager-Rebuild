import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';

// Horizontal aim still selects the exact slot. This bounded vertical bias only resolves
// coincident storeys in favour of the level where the player is standing.
const PLAYER_LEVEL_SCORE_WEIGHT = 0.4;

export function panelPlayerLevelPenalty(baseY, playerY) {
  if (!Number.isFinite(baseY) || !Number.isFinite(playerY)) return 0;
  return Math.min(
    Math.abs(baseY - playerY),
    PANEL_GRID.storeyHeight * 2
  ) * PLAYER_LEVEL_SCORE_WEIGHT;
}
