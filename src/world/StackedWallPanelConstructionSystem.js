import {
  PANEL_DIRECTIONS,
  PANEL_GRID,
  panelBuildCost
} from '../data/PanelConstructionDefinitions.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { panelCellKey } from './PanelConstructionGrid.js';
import { PanelConstructionSystem } from './PanelConstructionSystem.js';
import { collectPanelUpperFloorExpansionSupports } from './PanelFloorSupportRules.js';
import { createPanelPreview } from './PanelConstructionVisual.js';
import { collectPanelUpperWallSupports } from './PanelUpperStoreyRules.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const NEW_STRUCTURE_TARGET_DISTANCE = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const LEVEL_TOLERANCE = PANEL_GRID.snapTolerance + 0.001;
const LEVEL_TARGET_SCORE_WINDOW = PANEL_GRID.cellSize * 0.38;
const FLOOR_CLEARANCE_RADIUS = PANEL_GRID.cellSize * 0.36;
const FLOOR_MODE = 'floor';
const WALL_MODES = new Set(['wall', 'door', 'window']);
const directionEntries = Object.values(PANEL_DIRECTIONS);

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
 * Adds recursive wall-family stacking and player-level semantic placement to the base
 * construction system. Upper Floors may extend cardinally from an already supported
 * upper Floor, creating deliberate overhangs/balconies while remaining connected to a
 * closed wall-supported root. Wall/Door/Window targeting then prefers the structural
 * level the Ranger is standing on when vertically coincident candidates compete.
 */
export class StackedWallPanelConstructionSystem extends PanelConstructionSystem {
  update(playerPosition, facingDirection, constructionAim = null) {
    if (this.buildMode === FLOOR_MODE) {
      const baseState = super.update(playerPosition, facingDirection, constructionAim);
      if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
        return baseState;
      }

      const overhang = this.#resolveOverhangFloorPlacement(
        playerPosition,
        facingDirection,
        constructionAim
      );
      if (!overhang || !this.#preferPlayerLevelCandidate(
        overhang,
        this.previewPlacement,
        playerPosition
      )) return baseState;

      this.previewPlacement = overhang;
      this.#applySpecializedPreview(overhang);
      return this.getBuildState();
    }

    if (!WALL_MODES.has(this.buildMode)) {
      return super.update(playerPosition, facingDirection, constructionAim);
    }

    const baseState = super.update(playerPosition, facingDirection, constructionAim);
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      return baseState;
    }

    const floorBacked = this.#resolveFloorBackedWallPlacement(
      playerPosition,
      facingDirection,
      constructionAim
    );
    const stacked = this.#resolveStackedWallPlacement(
      playerPosition,
      facingDirection,
      constructionAim
    );
    let resolved = floorBacked;
    if (stacked && this.#preferPlayerLevelCandidate(stacked, resolved, playerPosition)) {
      resolved = stacked;
    }
    if (!resolved) return baseState;

    this.previewPlacement = resolved;
    this.#applySpecializedPreview(resolved);
    return this.getBuildState();
  }

  #resolveOverhangFloorPlacement(playerPosition, facingDirection, constructionAim) {
    const target = this.#placementTarget(playerPosition, facingDirection, constructionAim);
    let best = null;

    for (const structure of this.registry.structures.values()) {
      const floors = [...structure.grid.floors.values()];
      const supports = collectPanelUpperFloorExpansionSupports(
        [...structure.grid.walls.values()],
        floors,
        { levelTolerance: LEVEL_TOLERANCE }
      );

      for (const support of supports) {
        const key = panelCellKey({
          x: support.x,
          z: support.z,
          storey: support.storey
        });
        if (structure.grid.floors.has(key)) continue;

        const lowerKey = panelCellKey({
          x: support.x,
          z: support.z,
          storey: support.storey - 1
        });
        if (this.#roofCellOccupied(structure, lowerKey)) continue;
        if ([...structure.grid.stairs.values()].some(stair => (
          stair.storey === support.storey - 1 && stair.targetCellKey === lowerKey
        ))) continue;

        const center = this.registry.cellCenterWorld(structure, support);
        if (Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z) > PANEL_GRID.placementReach) continue;
        const candidate = {
          kind: 'floor',
          structureId: structure.id,
          newStructure: false,
          cellX: support.x,
          cellZ: support.z,
          storey: support.storey,
          x: center.x,
          z: center.z,
          yaw: structure.yaw,
          baseY: support.levelY,
          topY: support.levelY + 0.028,
          snapKind: support.snapKind,
          valid: this.#floorClear(center.x, center.z),
          score: this.#candidateScore(
            { x: center.x, y: support.levelY, z: center.z },
            target,
            constructionAim
          )
        };
        if (this.#preferPlayerLevelCandidate(candidate, best, playerPosition)) best = candidate;
      }
    }

    return best && best.score <= PANEL_GRID.structureJoinRange ? best : null;
  }

  #resolveFloorBackedWallPlacement(playerPosition, facingDirection, constructionAim) {
    const target = this.#placementTarget(playerPosition, facingDirection, constructionAim);
    let best = null;

    for (const structure of this.registry.structures.values()) {
      for (const floor of structure.grid.floors.values()) {
        for (const direction of directionEntries) {
          const edge = this.registry.edgePlacementWorld(structure, {
            x: floor.x,
            z: floor.z,
            storey: floor.storey,
            direction: direction.id
          });
          if (structure.grid.walls.has(edge.key)) continue;
          if ([...structure.grid.stairs.values()].some(stair => stair.sharedEdgeKey === edge.key)) continue;
          if (Math.hypot(edge.x - playerPosition.x, edge.z - playerPosition.z) > PANEL_GRID.placementReach) continue;

          const candidate = {
            kind: 'wall',
            structureId: structure.id,
            newStructure: false,
            cellX: floor.x,
            cellZ: floor.z,
            storey: floor.storey,
            direction: direction.id,
            stateKey: edge.key,
            x: edge.x,
            z: edge.z,
            yaw: edge.yaw,
            baseY: floor.levelY,
            topY: floor.levelY + PANEL_GRID.storeyHeight,
            snapKind: 'floor-backed-wall',
            valid: this.#wallClear(edge, floor.levelY),
            score: this.#candidateScore(
              {
                x: edge.x,
                y: floor.levelY + PANEL_GRID.storeyHeight * 0.5,
                z: edge.z
              },
              target,
              constructionAim
            )
          };
          if (this.#preferPlayerLevelCandidate(candidate, best, playerPosition)) best = candidate;
        }
      }
    }

    return best && best.score <= PANEL_GRID.cellSize ? best : null;
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
        // A real Floor keeps the Floor-backed placement path authoritative. This branch
        // exists only for explicitly floorless stacked wall-family construction.
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
          )
        };
        if (this.#preferPlayerLevelCandidate(candidate, best, playerPosition)) best = candidate;
      }
    }

    return best && best.score <= PANEL_GRID.cellSize ? best : null;
  }

  #preferPlayerLevelCandidate(candidate, current, playerPosition) {
    if (!candidate) return false;
    if (!current) return true;

    // Intent still wins when candidates are clearly aimed at different plan positions.
    // Inside the same local target window, vertical distance to the Ranger's feet is the
    // tie-break authority so third-person placement stays on the storey being walked.
    if (candidate.score > current.score + LEVEL_TARGET_SCORE_WINDOW) return false;
    if (current.score > candidate.score + LEVEL_TARGET_SCORE_WINDOW) return true;

    const candidateLevelDistance = Math.abs(candidate.baseY - playerPosition.y);
    const currentLevelDistance = Math.abs(current.baseY - playerPosition.y);
    if (candidateLevelDistance + LEVEL_TOLERANCE < currentLevelDistance) return true;
    if (currentLevelDistance + LEVEL_TOLERANCE < candidateLevelDistance) return false;

    if (candidate.valid && !current.valid) return true;
    if (current.valid && !candidate.valid) return false;
    return candidate.score < current.score - 0.000001;
  }

  #applySpecializedPreview(placement) {
    const canAfford = panelBuildCost(this.buildMode).every(requirement => (
      this.inventory.has(requirement.itemId, requirement.quantity)
    ));
    this.previewValid = Boolean(placement.valid) && canAfford;
    this.#showSpecializedPreview(placement, this.previewValid);
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

  #floorClear(x, z) {
    return this.collision.isCircleClear(x, z, FLOOR_CLEARANCE_RADIUS, {
      ignore: obstacle => obstacle.type === 'panel-floor'
    });
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

  #roofCellOccupied(structure, cellKey) {
    return [...structure.grid.roofZones.values()].some(zone => zone.cellKeys.includes(cellKey));
  }

  #showSpecializedPreview(placement, valid) {
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
