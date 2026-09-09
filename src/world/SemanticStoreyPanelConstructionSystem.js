import * as THREE from 'three';
import {
  PANEL_DIRECTIONS,
  PANEL_GRID,
  panelBuildCost
} from '../data/PanelConstructionDefinitions.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { ComplexRoofPanelConstructionSystem } from './ComplexRoofPanelConstructionSystem.js';
import {
  panelEdgeDescriptor
} from './PanelConstructionGrid.js';
import { createPanelPreview } from './PanelConstructionVisual.js';
import {
  collectSemanticUpperStoreyFloorCandidates,
  SEMANTIC_UPPER_STOREY_MAX,
  semanticUpperStoreyDependsOnStair,
  semanticUpperStoreyDependsOnWall
} from './SemanticUpperStoreyRules.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const FLOOR_TOP_LIFT = 0.028;
const FLOOR_CLEARANCE_RADIUS = PANEL_GRID.cellSize * 0.36;
const UPPER_CONTEXT_HORIZONTAL_RANGE = PANEL_GRID.placementReach + PANEL_GRID.cellSize * 0.55;
const UPPER_CONTEXT_VERTICAL_TOLERANCE = PANEL_GRID.storeyHeight * 0.62;
const UPPER_STAIR_ENTRY_HEIGHT = PANEL_GRID.storeyHeight * 0.44;
const FORWARD_TARGET_DISTANCE = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.42;
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

const wallVariantMode = mode => mode === 'wall' || mode === 'door' || mode === 'window';

/**
 * Adds the first live semantic second-storey editing slice on top of the complex Roof
 * system without creating another construction grid or material economy.
 *
 * PanelConstructionSystem remains responsible for committing/materializing Floor and
 * wall-family modules. This specialization only changes which canonical slot is selected
 * while the Ranger is physically working at the upper level; base build() then consumes
 * the existing semantic cost and materializes through the established private runtime path.
 */
export class SemanticStoreyPanelConstructionSystem extends ComplexRoofPanelConstructionSystem {
  update(playerPosition, facingDirection, constructionAim = null) {
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      return super.update(playerPosition, facingDirection, constructionAim);
    }

    const upperContext = this.#playerInUpperContext(playerPosition);

    if (this.buildMode === 'floor') {
      const placement = this.#resolveUpperFloorPlacement(
        playerPosition,
        facingDirection,
        constructionAim
      );
      if (placement) return this.#commitCustomPreview('floor', placement);
      if (upperContext) {
        this.#clearCustomPreview();
        return this.getBuildState();
      }
      return super.update(playerPosition, facingDirection, constructionAim);
    }

    if (wallVariantMode(this.buildMode) && upperContext) {
      const placement = this.#resolveUpperWallPlacement(
        playerPosition,
        facingDirection,
        constructionAim
      );
      if (placement) return this.#commitCustomPreview(this.buildMode, placement);
      this.#clearCustomPreview();
      return this.getBuildState();
    }

    // This milestone deliberately activates one additional storey only. Existing semantic
    // Stairs still reach the second storey, but a second flight cannot be started upstairs
    // until the next multi-storey expansion explicitly raises the storey ceiling.
    if (this.buildMode === 'stairs' && upperContext) {
      this.#clearCustomPreview();
      return this.getBuildState();
    }

    return super.update(playerPosition, facingDirection, constructionAim);
  }

  getDemolitionTarget(playerPosition, targetId = null) {
    if (targetId || !this.#playerInUpperContext(playerPosition)) {
      return super.getDemolitionTarget(playerPosition, targetId);
    }

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const entry of this.entries.values()) {
      if (!entry.active || entry.storey !== SEMANTIC_UPPER_STOREY_MAX) continue;
      const target = super.getDemolitionTarget(playerPosition, entry.id);
      if (!target) continue;
      const horizontal = Math.hypot(
        entry.root.position.x - playerPosition.x,
        entry.root.position.z - playerPosition.z
      );
      const vertical = Number.isFinite(playerPosition.y)
        ? Math.abs(entry.root.position.y - playerPosition.y)
        : 0;
      const score = horizontal + vertical * 0.35;
      if (score >= bestScore) continue;
      bestScore = score;
      best = target;
    }
    return best ?? super.getDemolitionTarget(playerPosition);
  }

  demolish(playerPosition, targetId = null) {
    const target = this.getDemolitionTarget(playerPosition, targetId);
    if (!target) return null;
    const entry = this.entries.get(target.id);
    if (!entry) return null;
    const structure = this.registry.get(entry.structureId);
    if (!structure) return null;

    if (
      entry.kind === 'stairs' &&
      semanticUpperStoreyDependsOnStair(structure.grid, structure.grid.stairs.get(entry.stateKey))
    ) return null;

    if (
      entry.kind === 'wall' &&
      semanticUpperStoreyDependsOnWall(structure.grid, entry.stateKey)
    ) return null;

    return super.demolish(playerPosition, target.id);
  }

  #resolveUpperFloorPlacement(playerPosition, facingDirection, constructionAim) {
    if (!Number.isFinite(playerPosition?.y)) return null;
    let best = null;

    for (const structure of this.registry.structures.values()) {
      for (const candidate of collectSemanticUpperStoreyFloorCandidates(structure.grid)) {
        if (candidate.storey > SEMANTIC_UPPER_STOREY_MAX) continue;
        if (playerPosition.y < candidate.baseY - PANEL_GRID.storeyHeight * 0.58) continue;
        if (playerPosition.y > candidate.baseY + PANEL_GRID.storeyHeight * 0.75) continue;

        const center = this.registry.cellCenterWorld(structure, candidate);
        const horizontal = Math.hypot(
          center.x - playerPosition.x,
          center.z - playerPosition.z
        );
        if (horizontal > PANEL_GRID.placementReach) continue;

        const placement = {
          kind: 'floor',
          structureId: structure.id,
          newStructure: false,
          cellX: candidate.x,
          cellZ: candidate.z,
          storey: candidate.storey,
          x: center.x,
          z: center.z,
          yaw: structure.yaw,
          baseY: candidate.baseY,
          topY: candidate.baseY + FLOOR_TOP_LIFT,
          valid: this.#upperFloorClear(center.x, center.z, candidate.baseY),
          score: this.#candidateScore(
            { x: center.x, y: candidate.baseY, z: center.z },
            playerPosition,
            facingDirection,
            constructionAim
          ),
          snapKind: candidate.snapKind,
          lowerFloorKey: candidate.lowerFloorKey,
          stairOpeningKeys: [...candidate.stairOpeningKeys]
        };
        if (!best || placement.score < best.score) best = placement;
      }
    }

    return best && best.score <= PANEL_GRID.cellSize * 1.45 ? best : null;
  }

  #resolveUpperWallPlacement(playerPosition, facingDirection, constructionAim) {
    if (!Number.isFinite(playerPosition?.y)) return null;
    let best = null;

    for (const structure of this.registry.structures.values()) {
      for (const floor of structure.grid.floors.values()) {
        if (floor.storey <= 0 || floor.storey > SEMANTIC_UPPER_STOREY_MAX) continue;
        if (Math.abs(playerPosition.y - floor.levelY) > UPPER_CONTEXT_VERTICAL_TOLERANCE) continue;

        for (const direction of directionEntries) {
          const edge = this.registry.edgePlacementWorld(structure, {
            x: floor.x,
            z: floor.z,
            storey: floor.storey,
            direction: direction.id
          });
          if (structure.grid.walls.has(edge.key)) continue;
          if ([...structure.grid.stairs.values()].some(stair => stair.sharedEdgeKey === edge.key)) continue;

          const horizontal = Math.hypot(
            edge.x - playerPosition.x,
            edge.z - playerPosition.z
          );
          if (horizontal > PANEL_GRID.placementReach) continue;

          const placement = {
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
            valid: this.#upperWallClear(edge, floor.levelY),
            score: this.#candidateScore(
              {
                x: edge.x,
                y: floor.levelY + PANEL_GRID.storeyHeight * 0.5,
                z: edge.z
              },
              playerPosition,
              facingDirection,
              constructionAim
            )
          };
          if (!best || placement.score < best.score) best = placement;
        }
      }
    }

    return best && best.score <= PANEL_GRID.cellSize * 1.2 ? best : null;
  }

  #candidateScore(point, playerPosition, facingDirection, constructionAim) {
    if (finiteAim(constructionAim)) {
      const direction = new THREE.Vector3(
        constructionAim.direction.x,
        constructionAim.direction.y,
        constructionAim.direction.z
      );
      if (direction.lengthSq() > 0.000001) {
        direction.normalize();
        const offset = new THREE.Vector3(
          point.x - constructionAim.origin.x,
          point.y - constructionAim.origin.y,
          point.z - constructionAim.origin.z
        );
        const along = offset.dot(direction);
        if (along > 0) {
          const closest = new THREE.Vector3(
            constructionAim.origin.x,
            constructionAim.origin.y,
            constructionAim.origin.z
          ).addScaledVector(direction, along);
          return Math.hypot(
            point.x - closest.x,
            point.y - closest.y,
            point.z - closest.z
          );
        }
      }
    }

    const length = Math.hypot(facingDirection.x, facingDirection.z) || 1;
    const targetX = playerPosition.x + facingDirection.x / length * FORWARD_TARGET_DISTANCE;
    const targetZ = playerPosition.z + facingDirection.z / length * FORWARD_TARGET_DISTANCE;
    return Math.hypot(point.x - targetX, point.z - targetZ);
  }

  #upperFloorClear(x, z, baseY) {
    return this.collision.isCircleClear(x, z, FLOOR_CLEARANCE_RADIUS, {
      ignore: obstacle => (
        (
          obstacle.type === 'panel-floor' ||
          obstacle.type === 'panel-wall' ||
          obstacle.type === 'panel-stair'
        ) && obstacle.topY <= baseY + 0.1
      )
    });
  }

  #upperWallClear(edge, baseY) {
    return this.collision.isCircleClear(
      edge.x,
      edge.z,
      CONSTRUCTION_DIMENSIONS.wallThickness * 0.8,
      {
        ignore: obstacle => (
          obstacle.type === 'panel-floor' ||
          obstacle.type === 'panel-stair' ||
          (obstacle.type === 'panel-wall' && obstacle.topY <= baseY + 0.02)
        )
      }
    );
  }

  #playerInUpperContext(playerPosition) {
    if (!finitePoint(playerPosition) || !Number.isFinite(playerPosition?.y)) return false;

    for (const structure of this.registry.structures.values()) {
      for (const floor of structure.grid.floors.values()) {
        if (floor.storey <= 0 || floor.storey > SEMANTIC_UPPER_STOREY_MAX) continue;
        const center = this.registry.cellCenterWorld(structure, floor);
        if (
          Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z) <= UPPER_CONTEXT_HORIZONTAL_RANGE &&
          Math.abs(playerPosition.y - floor.levelY) <= UPPER_CONTEXT_VERTICAL_TOLERANCE
        ) return true;
      }

      for (const stair of structure.grid.stairs.values()) {
        if (stair.storey >= SEMANTIC_UPPER_STOREY_MAX) continue;
        const source = this.registry.cellCenterWorld(structure, { x: stair.x, z: stair.z });
        const target = this.registry.cellCenterWorld(structure, { x: stair.targetX, z: stair.targetZ });
        const x = (source.x + target.x) * 0.5;
        const z = (source.z + target.z) * 0.5;
        if (Math.hypot(x - playerPosition.x, z - playerPosition.z) > UPPER_CONTEXT_HORIZONTAL_RANGE) continue;
        if (
          playerPosition.y >= stair.baseY + UPPER_STAIR_ENTRY_HEIGHT &&
          playerPosition.y <= stair.topY + PANEL_GRID.storeyHeight * 0.72
        ) return true;
      }
    }
    return false;
  }

  #commitCustomPreview(mode, placement) {
    const cost = panelBuildCost(mode);
    const canAfford = cost.every(requirement => (
      this.inventory.has(requirement.itemId, requirement.quantity)
    ));
    this.previewPlacement = placement;
    this.previewValid = Boolean(placement.valid) && canAfford;
    this.#showCustomPreview(mode, placement, this.previewValid);
    return this.getBuildState();
  }

  #showCustomPreview(mode, placement, valid) {
    const shapeKey = `upper:${mode}`;
    if (
      !this.previewRoot ||
      this.previewMode !== mode ||
      this.previewShapeKey !== shapeKey
    ) {
      if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
      this.previewRoot = createPanelPreview(mode, this.previewMaterial, placement);
      this.previewMode = mode;
      this.previewShapeKey = shapeKey;
      this.group.add(this.previewRoot);
    }
    this.previewMaterial.color.setHex(valid ? PREVIEW_VALID : PREVIEW_INVALID);
    this.previewRoot.visible = true;
    this.previewRoot.position.set(placement.x, placement.baseY, placement.z);
    this.previewRoot.rotation.set(0, placement.yaw, 0);
  }

  #clearCustomPreview() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewShapeKey = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }
}
