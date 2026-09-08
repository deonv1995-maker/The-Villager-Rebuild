import {
  PANEL_BUILD_COSTS,
  PANEL_BUILD_LABELS,
  PANEL_DIRECTIONS,
  PANEL_GRID
} from '../data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  panelCellKey,
  panelEdgeDescriptor,
  panelStairDescriptor
} from './PanelConstructionGrid.js';
import { createFloorPanelVisual } from './PanelConstructionVisual.js';
import { PanelConstructionSystem as PanelConstructionSystemCore } from './PanelConstructionSystemCore.js';
import { tintConstructionPreview } from './PhysicalLogVisual.js';
import {
  createSemanticStairVisual,
  semanticStairColliderSpecs
} from './SemanticStairGeometry.js';

const FLOOR_TOP_LIFT = 0.028;
const UPPER_CONTEXT_RISE_FACTOR = 0.56;
const STAIR_CLEARANCE_RADIUS = PHYSICAL_LOG.radius * 1.2;

const directionEntries = Object.values(PANEL_DIRECTIONS);

const finiteAim = aim => (
  Number.isFinite(aim?.origin?.x) &&
  Number.isFinite(aim?.origin?.y) &&
  Number.isFinite(aim?.origin?.z) &&
  Number.isFinite(aim?.direction?.x) &&
  Number.isFinite(aim?.direction?.y) &&
  Number.isFinite(aim?.direction?.z)
);

const normalizedHorizontal = vector => {
  const length = Math.hypot(vector?.x ?? 0, vector?.z ?? 0);
  if (length <= 0.000001) return { x: 0, z: 1 };
  return { x: vector.x / length, z: vector.z / length };
};

/**
 * Vertical semantic construction extension.
 *
 * PanelConstructionSystemCore remains the proven Floor/Wall/Door/Window authority.
 * This class adds stairs and the stair-seeded upper-storey Floor path while sharing the
 * exact same registry, entry map, collision system, inventory and demolition boundary.
 */
export class PanelConstructionSystem extends PanelConstructionSystemCore {
  update(playerPosition, facingDirection, constructionAim = null) {
    if (this.buildMode === 'stairs' && this.active) {
      return this.#updateStairPreview(playerPosition, facingDirection, constructionAim);
    }

    if (this.buildMode === 'floor' && this.active) {
      const upperPlacement = this.#resolveUpperFloorPlacement(
        playerPosition,
        facingDirection,
        constructionAim
      );
      if (upperPlacement) {
        this.previewPlacement = upperPlacement;
        this.previewValid = Boolean(upperPlacement.valid) && this.#canAfford('floor');
        this.#showExtensionPreview('floor', upperPlacement, this.previewValid);
        return super.getBuildState();
      }
    }

    return super.update(playerPosition, facingDirection, constructionAim);
  }

  build(playerPosition, facingDirection, constructionAim = null) {
    this.update(playerPosition, facingDirection, constructionAim);
    if (this.buildMode === 'stairs') {
      return this.#commitStair(playerPosition, facingDirection, constructionAim);
    }
    if (this.buildMode === 'floor' && this.previewPlacement?.semanticUpperFloor) {
      return this.#commitUpperFloor(playerPosition, facingDirection, constructionAim);
    }
    return super.build(playerPosition, facingDirection, constructionAim);
  }

  demolish(playerPosition, targetId = null) {
    const target = super.getDemolitionTarget(playerPosition, targetId);
    if (target?.kind !== 'stairs') return super.demolish(playerPosition, targetId);

    const entry = this.entries.get(target.id);
    const structure = entry ? this.registry.get(entry.structureId) : null;
    if (!entry || !structure || !structure.grid.removeStair(entry.stateKey)) return null;

    this.#removeStairRuntime(entry);
    this.entries.delete(entry.id);
    for (const requirement of PANEL_BUILD_COSTS.stairs ?? []) {
      this.inventory.add(requirement.itemId, requirement.quantity);
    }
    return target;
  }

  restore(snapshot) {
    const restored = super.restore(snapshot);

    // The core Floor materializer deliberately still supports schema-1 ground floors.
    // Upper-storey floors use the same visual/collider but must never grow terrain-to-floor
    // foundation posts. Remove any temporary support handles created during core restore.
    for (const entry of this.entries.values()) {
      if (entry.kind !== 'floor' || entry.storey <= 0 || !entry.supportHandles?.length) continue;
      for (const handle of entry.supportHandles) {
        if (handle) this.floorSupports.remove(handle);
      }
      entry.supportHandles = [];
    }

    for (const structure of this.registry.structures.values()) {
      for (const stair of structure.grid.stairs?.values?.() ?? []) {
        this.#materializeStair(structure, stair);
      }
    }
    return restored;
  }

  #updateStairPreview(playerPosition, facingDirection, constructionAim) {
    const placement = this.#resolveStairPlacement(playerPosition, facingDirection, constructionAim);
    this.previewPlacement = placement;
    this.previewValid = Boolean(placement?.valid) && this.#canAfford('stairs');
    if (!placement) {
      this.#clearExtensionPreview();
      return super.getBuildState();
    }
    this.#showExtensionPreview('stairs', placement, this.previewValid);
    return super.getBuildState();
  }

  #commitStair(playerPosition, facingDirection, constructionAim) {
    const placement = this.previewPlacement;
    if (!this.previewValid || !placement || placement.kind !== 'stairs') return null;
    const structure = this.registry.get(placement.structureId);
    if (!structure) return null;

    const result = structure.grid.placeStair({
      x: placement.cellX,
      z: placement.cellZ,
      storey: placement.storey,
      direction: placement.direction
    });
    if (!result?.ok) return null;

    const cost = PANEL_BUILD_COSTS.stairs ?? [];
    if (!this.inventory.consume(cost)) {
      structure.grid.removeStair(result.stair.key);
      return null;
    }

    const entry = this.#materializeStair(structure, result.stair);
    this.update(playerPosition, facingDirection, constructionAim);
    return this.#buildResult(entry, cost);
  }

  #commitUpperFloor(playerPosition, facingDirection, constructionAim) {
    const placement = this.previewPlacement;
    if (!this.previewValid || !placement?.semanticUpperFloor) return null;
    const structure = this.registry.get(placement.structureId);
    if (!structure) return null;

    const result = structure.grid.placeFloor({
      x: placement.cellX,
      z: placement.cellZ,
      storey: placement.storey,
      levelY: placement.baseY
    });
    if (!result?.ok) return null;

    const cost = PANEL_BUILD_COSTS.floor ?? [];
    if (!this.inventory.consume(cost)) {
      structure.grid.removeFloor({
        x: placement.cellX,
        z: placement.cellZ,
        storey: placement.storey
      });
      return null;
    }

    const entry = this.#materializeUpperFloor(structure, result.floor);
    this.update(playerPosition, facingDirection, constructionAim);
    return this.#buildResult(entry, cost);
  }

  #resolveStairPlacement(playerPosition, facingDirection, constructionAim) {
    if (!Number.isFinite(playerPosition?.x) || !Number.isFinite(playerPosition?.z)) return null;
    const facing = normalizedHorizontal(facingDirection);
    let best = null;

    for (const structure of this.registry.structures.values()) {
      const stairs = [...(structure.grid.stairs?.values?.() ?? [])];
      for (const floor of structure.grid.floors.values()) {
        for (const direction of directionEntries) {
          const descriptor = panelStairDescriptor({
            x: floor.x,
            z: floor.z,
            storey: floor.storey,
            direction: direction.id
          });
          const neighbour = structure.grid.floors.get(descriptor.toCellKey);
          if (!neighbour) continue;
          if (stairs.some(stair => stair.pairKey === descriptor.pairKey)) continue;

          const from = this.registry.cellCenterWorld(structure, floor);
          const to = this.registry.cellCenterWorld(structure, {
            x: descriptor.toX,
            z: descriptor.toZ
          });
          if (!from || !to) continue;
          const midX = (from.x + to.x) * 0.5;
          const midZ = (from.z + to.z) * 0.5;
          if (
            Math.hypot(midX - playerPosition.x, midZ - playerPosition.z) >
            PANEL_GRID.placementReach + PANEL_GRID.cellSize * 0.22
          ) continue;

          const runX = to.x - from.x;
          const runZ = to.z - from.z;
          const runLength = Math.hypot(runX, runZ) || 1;
          const run = { x: runX / runLength, z: runZ / runLength };
          const yaw = Math.atan2(run.x, run.z);
          const baseLevelY = (floor.levelY + neighbour.levelY) * 0.5;
          const blockedEdge = structure.grid.walls.has(
            panelEdgeDescriptor({
              x: floor.x,
              z: floor.z,
              storey: floor.storey,
              direction: direction.id
            }).key
          );
          const levelValid = Math.abs(floor.levelY - neighbour.levelY) <= PANEL_GRID.snapTolerance;
          const selectionPoint = {
            x: from.x,
            y: baseLevelY + FLOOR_TOP_LIFT + PANEL_GRID.storeyHeight * 0.18,
            z: from.z
          };
          const score = this.#selectionScore(
            selectionPoint,
            playerPosition,
            facing,
            constructionAim,
            run
          );
          const placement = {
            kind: 'stairs',
            structureId: structure.id,
            cellX: floor.x,
            cellZ: floor.z,
            toCellX: descriptor.toX,
            toCellZ: descriptor.toZ,
            storey: floor.storey,
            direction: direction.id,
            pairKey: descriptor.pairKey,
            x: midX,
            z: midZ,
            yaw,
            levelY: baseLevelY,
            baseY: baseLevelY + FLOOR_TOP_LIFT,
            topY: baseLevelY + FLOOR_TOP_LIFT + PANEL_GRID.storeyHeight,
            valid: levelValid && !blockedEdge && this.#stairClear({
              x: midX,
              z: midZ,
              run,
              baseLevelY
            }),
            score
          };
          if (!best || placement.score < best.score) best = placement;
        }
      }
    }

    return best && best.score <= PANEL_GRID.cellSize * 1.25 ? best : null;
  }

  #resolveUpperFloorPlacement(playerPosition, facingDirection, constructionAim) {
    if (!Number.isFinite(playerPosition?.y)) return null;
    const facing = normalizedHorizontal(facingDirection);
    const candidates = new Map();

    const addCandidate = (structure, { x, z, storey, baseY, stairSeed = false }) => {
      if (storey <= 0) return;
      const key = panelCellKey({ x, z, storey });
      if (structure.grid.floors.has(key)) return;
      const lowerKey = panelCellKey({ x, z, storey: storey - 1 });
      if (!structure.grid.floors.has(lowerKey)) return;
      if (playerPosition.y < baseY - PANEL_GRID.storeyHeight * UPPER_CONTEXT_RISE_FACTOR) return;

      const center = this.registry.cellCenterWorld(structure, { x, z });
      if (!center) return;
      const distance = Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z);
      if (distance > PANEL_GRID.placementReach) return;
      const score = this.#selectionScore(
        { x: center.x, y: baseY, z: center.z },
        playerPosition,
        facing,
        constructionAim,
        null
      ) - (stairSeed ? 0.12 : 0);
      const candidate = {
        kind: 'floor',
        semanticUpperFloor: true,
        structureId: structure.id,
        newStructure: false,
        cellX: x,
        cellZ: z,
        storey,
        x: center.x,
        z: center.z,
        yaw: structure.yaw,
        baseY,
        topY: baseY + FLOOR_TOP_LIFT,
        valid: this.#upperFloorClear(center.x, center.z, baseY),
        score
      };
      const candidateId = `${structure.id}:${key}`;
      const previous = candidates.get(candidateId);
      if (!previous || candidate.score < previous.score) candidates.set(candidateId, candidate);
    };

    for (const structure of this.registry.structures.values()) {
      for (const stair of structure.grid.stairs?.values?.() ?? []) {
        addCandidate(structure, {
          x: stair.toX,
          z: stair.toZ,
          storey: stair.upperStorey,
          baseY: stair.topY,
          stairSeed: true
        });
      }

      for (const floor of structure.grid.floors.values()) {
        if (floor.storey <= 0) continue;
        for (const direction of directionEntries) {
          addCandidate(structure, {
            x: floor.x + direction.dx,
            z: floor.z + direction.dz,
            storey: floor.storey,
            baseY: floor.levelY
          });
        }
      }
    }

    let best = null;
    for (const candidate of candidates.values()) {
      if (!best || candidate.score < best.score) best = candidate;
    }
    return best && best.score <= PANEL_GRID.cellSize * 1.35 ? best : null;
  }

  #selectionScore(point, playerPosition, facing, constructionAim, run = null) {
    if (finiteAim(constructionAim)) {
      const directionLength = Math.hypot(
        constructionAim.direction.x,
        constructionAim.direction.y,
        constructionAim.direction.z
      );
      if (directionLength > 0.000001) {
        const dx = constructionAim.direction.x / directionLength;
        const dy = constructionAim.direction.y / directionLength;
        const dz = constructionAim.direction.z / directionLength;
        const ox = point.x - constructionAim.origin.x;
        const oy = point.y - constructionAim.origin.y;
        const oz = point.z - constructionAim.origin.z;
        const along = ox * dx + oy * dy + oz * dz;
        if (along > 0) {
          const cx = constructionAim.origin.x + dx * along;
          const cy = constructionAim.origin.y + dy * along;
          const cz = constructionAim.origin.z + dz * along;
          let score = Math.hypot(point.x - cx, point.y - cy, point.z - cz);
          if (run) {
            const aimHorizontalLength = Math.hypot(dx, dz);
            if (aimHorizontalLength > 0.000001) {
              const alignment = run.x * (dx / aimHorizontalLength) + run.z * (dz / aimHorizontalLength);
              score += (1 - Math.max(-1, Math.min(1, alignment))) * 0.16;
            }
          }
          return score;
        }
      }
    }

    const offsetX = point.x - playerPosition.x;
    const offsetZ = point.z - playerPosition.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance <= 0.000001) return 0;
    const alignment = facing.x * (offsetX / distance) + facing.z * (offsetZ / distance);
    let score = distance - Math.max(0, alignment) * 0.55;
    if (run) score -= Math.max(0, facing.x * run.x + facing.z * run.z) * 0.22;
    return score;
  }

  #stairClear({ x, z, run, baseLevelY }) {
    for (const offset of [-0.34, 0, 0.34]) {
      const sampleX = x + run.x * PANEL_GRID.cellSize * offset;
      const sampleZ = z + run.z * PANEL_GRID.cellSize * offset;
      const clear = this.collision.isCircleClear(sampleX, sampleZ, STAIR_CLEARANCE_RADIUS, {
        ignore: obstacle => (
          obstacle.type === 'panel-floor' ||
          obstacle.type === 'panel-stair' ||
          (Number.isFinite(obstacle.topY) && obstacle.topY <= baseLevelY + 0.04)
        )
      });
      if (!clear) return false;
    }
    return true;
  }

  #upperFloorClear(x, z, baseY) {
    return this.collision.isCircleClear(x, z, PANEL_GRID.cellSize * 0.36, {
      ignore: obstacle => (
        obstacle.type === 'panel-floor' ||
        obstacle.type === 'panel-stair' ||
        (Number.isFinite(obstacle.topY) && obstacle.topY <= baseY + 0.04)
      )
    });
  }

  #materializeUpperFloor(structure, floor) {
    const placement = this.registry.floorPlacementWorld(structure, floor);
    const id = `panel:${structure.id}:${floor.key}`;
    const root = createFloorPanelVisual(id);
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'floor';
    root.userData.panelUpperStorey = true;
    this.group.add(root);

    const collisionHandle = this.collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PANEL_GRID.cellSize * 0.5,
      halfZ: PANEL_GRID.cellSize * 0.5,
      yaw: placement.yaw,
      type: 'panel-floor',
      label: id,
      bottomY: placement.baseY - PHYSICAL_LOG.floorUndersideDepth - 0.02,
      topY: placement.topY,
      standable: true,
      supportHalfX: PANEL_GRID.cellSize * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportHalfZ: PANEL_GRID.cellSize * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportY: placement.topY,
      supportOverridesBase: true,
      supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
      stepHeight: 0.18
    });

    const entry = {
      id,
      kind: 'floor',
      structureId: structure.id,
      stateKey: floor.key,
      cellX: floor.x,
      cellZ: floor.z,
      storey: floor.storey,
      root,
      collisionHandle,
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #materializeStair(structure, stair) {
    const from = this.registry.cellCenterWorld(structure, { x: stair.x, z: stair.z });
    const to = this.registry.cellCenterWorld(structure, { x: stair.toX, z: stair.toZ });
    if (!from || !to) throw new Error(`Cannot materialize stair ${stair.key}`);
    const runX = to.x - from.x;
    const runZ = to.z - from.z;
    const runLength = Math.hypot(runX, runZ) || 1;
    const yaw = Math.atan2(runX / runLength, runZ / runLength);
    const x = (from.x + to.x) * 0.5;
    const z = (from.z + to.z) * 0.5;
    const baseY = stair.baseY + FLOOR_TOP_LIFT;
    const id = `panel:${structure.id}:${stair.key}`;
    const root = createSemanticStairVisual(id);
    root.position.set(x, baseY, z);
    root.rotation.y = yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'stairs';
    root.userData.panelStairKey = stair.key;
    this.group.add(root);

    const collisionHandles = semanticStairColliderSpecs({ x, z, yaw, baseY })
      .map((spec, index) => this.collision.addBox({
        ...spec,
        type: 'panel-stair',
        label: `${id}:tread:${index}`
      }));

    const entry = {
      id,
      kind: 'stairs',
      structureId: structure.id,
      stateKey: stair.key,
      cellX: stair.x,
      cellZ: stair.z,
      toCellX: stair.toX,
      toCellZ: stair.toZ,
      storey: stair.storey,
      direction: stair.direction,
      root,
      collisionHandle: collisionHandles[0] ?? null,
      collisionHandles,
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #removeStairRuntime(entry) {
    entry.active = false;
    for (const handle of entry.collisionHandles ?? []) {
      this.collision.removeObstacle(handle);
    }
    entry.root?.parent?.remove(entry.root);
  }

  #buildResult(entry, cost) {
    const label = PANEL_BUILD_LABELS[entry.kind] ?? 'Construction panel';
    return {
      type: 'panel-construction',
      id: entry.id,
      kind: entry.kind,
      variant: null,
      label,
      icon: 'hammer',
      actionLabel: `Demolish ${label.toLowerCase()}`,
      root: entry.root,
      position: {
        x: entry.root.position.x,
        y: entry.root.position.y,
        z: entry.root.position.z
      },
      cost: cost.map(item => ({ ...item })),
      snapped: true
    };
  }

  #showExtensionPreview(mode, placement, valid) {
    if (!this.previewRoot || this.previewMode !== mode) {
      if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
      this.previewRoot = mode === 'stairs'
        ? createSemanticStairVisual('PanelStairsPreview')
        : createFloorPanelVisual('PanelUpperFloorPreview');
      tintConstructionPreview(this.previewRoot, this.previewMaterial);
      this.previewMode = mode;
      this.group.add(this.previewRoot);
    }
    this.previewMaterial.color.setHex(valid ? 0x65d879 : 0xd85d57);
    this.previewRoot.visible = true;
    this.previewRoot.position.set(placement.x, placement.baseY, placement.z);
    this.previewRoot.rotation.set(0, placement.yaw, 0);
  }

  #clearExtensionPreview() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }

  #canAfford(mode) {
    return (PANEL_BUILD_COSTS[mode] ?? []).every(requirement => (
      this.inventory.has(requirement.itemId, requirement.quantity)
    ));
  }
}
