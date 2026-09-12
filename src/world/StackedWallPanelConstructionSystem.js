import {
  PANEL_GRID,
  panelBuildCost
} from '../data/PanelConstructionDefinitions.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { panelCellKey } from './PanelConstructionGrid.js';
import { PanelConstructionSystem } from './PanelConstructionSystem.js';
import { createPanelPreview } from './PanelConstructionVisual.js';
import { panelPlayerLevelPenalty } from './PanelPlacementLevelRules.js';
import { collectPanelUpperWallSupports } from './PanelUpperStoreyRules.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const NEW_STRUCTURE_TARGET_DISTANCE = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const LEVEL_TOLERANCE = PANEL_GRID.snapTolerance + 0.001;
const WALL_MODES = new Set(['wall', 'door', 'window']);

const finitePoint = point => (
  Number.isFinite(point?.x) && Number.isFinite(point?.z)
);

const finiteAim = aim => (
  Number.isFinite(aim?.origin?.x) &&
  Number.isFinite(aim?.origin?.y) &&
  Number.isFinite(aim?.origin?.z) &&
  Number.isFinite(aim?.direction?.x) &&
  Number.isFinite(aim?.direction?.y) &&
  Number.isFinite(aim?.direction?.z)
);

/**
 * Adds recursive wall-family stacking to the semantic panel system without changing the
 * established Floor-backed Wall/Door/Window path. A floorless upper wall candidate is
 * exposed only when PanelUpperStoreyRules says the exact lower edge belongs to a completed
 * enclosed wall-family section.
 */
export class StackedWallPanelConstructionSystem extends PanelConstructionSystem {
  update(playerPosition, facingDirection, constructionAim = null) {
    if (!WALL_MODES.has(this.buildMode)) {
      return super.update(playerPosition, facingDirection, constructionAim);
    }

    const baseState = super.update(playerPosition, facingDirection, constructionAim);
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      return baseState;
    }

    const stacked = this.#resolveStackedWallPlacement(
      playerPosition,
      facingDirection,
      constructionAim
    );
    if (!stacked) return baseState;

    const current = this.previewPlacement;
    const currentScore = Number.isFinite(current?.score) ? current.score : Number.POSITIVE_INFINITY;
    const shouldPreferStacked = (
      !current ||
      !current.valid ||
      stacked.score <= currentScore + 0.05
    );
    if (!shouldPreferStacked) return baseState;

    this.previewPlacement = stacked;
    const canAfford = panelBuildCost(this.buildMode).every(requirement => (
      this.inventory.has(requirement.itemId, requirement.quantity)
    ));
    this.previewValid = stacked.valid && canAfford;
    this.#showStackedWallPreview(stacked, this.previewValid);
    return this.getBuildState();
  }

  #resolveStackedWallPlacement(playerPosition, facingDirection, constructionAim) {
    const target = this.#placementTarget(playerPosition, facingDirection, constructionAim);
    let best = null;

    for (const structure of this.registry.structures.values()) {
      const supports = collectPanelUpperWallSupports(
        [...structure.grid.walls.values()],
        { levelTolerance: LEVEL_TOLERANCE }
      );
      for (const support of supports) {
        const ownerCellKey = panelCellKey({
          x: support.x,
          z: support.z,
          storey: support.storey
        });
        // A real Floor keeps the established base-system placement authority. This
        // specialization is only for the explicitly floorless stacked-wall path.
        if (structure.grid.floors.has(ownerCellKey)) continue;
        if (structure.grid.walls.has(support.key)) continue;
        if ([...structure.grid.stairs.values()].some(stair => stair.sharedEdgeKey === support.key)) continue;

        const edge = this.registry.edgePlacementWorld(structure, support);
        if (!edge) continue;
        if (Math.hypot(edge.x - playerPosition.x, edge.z - playerPosition.z) > PANEL_GRID.placementReach) continue;

        const candidate = {
          kind: 'wall',
          structureId: structure.id,
          newStructure: false,
          cellX: support.x,
          cellZ: support.z,
          storey: support.storey,
          direction: support.direction,
          stateKey: support.key,
          x: edge.x,
          z: edge.z,
          yaw: edge.yaw,
          baseY: support.levelY,
          topY: support.levelY + PANEL_GRID.storeyHeight,
          snapKind: support.snapKind,
          valid: this.#wallClear(edge, support.levelY),
          score: this.#candidateScore(
            {
              x: edge.x,
              y: support.levelY + PANEL_GRID.storeyHeight * 0.5,
              z: edge.z
            },
            target,
            constructionAim
          ) + panelPlayerLevelPenalty(support.levelY, playerPosition.y)
        };
        if (!best || candidate.score < best.score) best = candidate;
      }
    }

    return best && best.score <= PANEL_GRID.cellSize ? best : null;
  }

  #placementTarget(playerPosition, facingDirection, constructionAim) {
    if (finiteAim(constructionAim)) {
      return {
        x: playerPosition.x + facingDirection.x * NEW_STRUCTURE_TARGET_DISTANCE,
        z: playerPosition.z + facingDirection.z * NEW_STRUCTURE_TARGET_DISTANCE
      };
    }
    const length = Math.hypot(facingDirection.x, facingDirection.z) || 1;
    return {
      x: playerPosition.x + facingDirection.x / length * NEW_STRUCTURE_TARGET_DISTANCE,
      z: playerPosition.z + facingDirection.z / length * NEW_STRUCTURE_TARGET_DISTANCE
    };
  }

  #candidateScore(point, target, aim) {
    if (finiteAim(aim)) {
      const magnitude = Math.hypot(aim.direction.x, aim.direction.y, aim.direction.z) || 1;
      const ux = aim.direction.x / magnitude;
      const uy = aim.direction.y / magnitude;
      const uz = aim.direction.z / magnitude;
      const ox = point.x - aim.origin.x;
      const oy = point.y - aim.origin.y;
      const oz = point.z - aim.origin.z;
      const along = ox * ux + oy * uy + oz * uz;
      if (along > 0) {
        const cx = aim.origin.x + ux * along;
        const cy = aim.origin.y + uy * along;
        const cz = aim.origin.z + uz * along;
        return Math.hypot(point.x - cx, point.y - cy, point.z - cz);
      }
    }
    return Math.hypot(point.x - target.x, point.z - target.z);
  }

  #wallClear(edge, baseY) {
    return this.collision.isCircleClear(edge.x, edge.z, CONSTRUCTION_DIMENSIONS.wallThickness * 0.8, {
      ignore: obstacle => (
        obstacle.type === 'panel-floor' ||
        obstacle.type === 'panel-stair' ||
        (obstacle.type === 'panel-wall' && obstacle.topY <= baseY + 0.02)
      )
    });
  }

  #showStackedWallPreview(placement, valid) {
    const shapeKey = this.buildMode;
    if (!this.previewRoot || this.previewMode !== this.buildMode || this.previewShapeKey !== shapeKey) {
      if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
      this.previewRoot = createPanelPreview(this.buildMode, this.previewMaterial, placement);
      this.previewMode = this.buildMode;
      this.previewShapeKey = shapeKey;
      this.group.add(this.previewRoot);
    }
    this.previewMaterial.color.setHex(valid ? PREVIEW_VALID : PREVIEW_INVALID);
    this.previewRoot.visible = true;
    this.previewRoot.position.set(placement.x, placement.baseY, placement.z);
    this.previewRoot.rotation.set(0, placement.yaw, 0);
  }
}
