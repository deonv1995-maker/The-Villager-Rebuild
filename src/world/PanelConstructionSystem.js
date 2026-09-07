import * as THREE from 'three';
import {
  PANEL_BUILD_COSTS,
  PANEL_BUILD_LABELS,
  PANEL_BUILD_MODES,
  PANEL_CONSTRUCTION_RESOURCE_ID,
  PANEL_DIRECTIONS,
  PANEL_GRID
} from '../data/PanelConstructionDefinitions.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { panelCellKey } from './PanelConstructionGrid.js';
import {
  createFloorPanelVisual,
  createPanelPreview,
  createWallPanelVisual
} from './PanelConstructionVisual.js';
import { FloorSupportVisual } from './FloorSupportVisual.js';
import { PanelStructureRegistry } from './PanelStructureRegistry.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const INTERACTION_RADIUS = PHYSICAL_LOG.pickupRange;
const FLOOR_TOP_LIFT = 0.028;
const FLOOR_CLEARANCE_RADIUS = PANEL_GRID.cellSize * 0.36;
const NEW_STRUCTURE_TARGET_DISTANCE = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const CANDIDATE_JOIN_SCORE = PANEL_GRID.cellSize * 0.82;
const AIM_GROUND_STEP = 0.22;

const directionEntries = Object.values(PANEL_DIRECTIONS);

const finitePoint = point => (
  Number.isFinite(point?.x) &&
  Number.isFinite(point?.z)
);

const finiteAim = aim => (
  Number.isFinite(aim?.origin?.x) &&
  Number.isFinite(aim?.origin?.y) &&
  Number.isFinite(aim?.origin?.z) &&
  Number.isFinite(aim?.direction?.x) &&
  Number.isFinite(aim?.direction?.y) &&
  Number.isFinite(aim?.direction?.z)
);

export class PanelConstructionSystem {
  constructor({ group, terrain, collision, inventory }) {
    if (!group || !terrain || !collision || !inventory) {
      throw new Error('PanelConstructionSystem requires group, terrain, collision and inventory');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.inventory = inventory;
    this.registry = new PanelStructureRegistry();
    this.floorSupports = new FloorSupportVisual({ group, terrain });
    this.entries = new Map();
    this.nextSupportId = 1;
    this.active = false;
    this.buildMode = 'floor';
    this.previewRoot = null;
    this.previewMode = null;
    this.previewPlacement = null;
    this.previewValid = false;
    this.previewMaterial = new THREE.MeshBasicMaterial({
      color: PREVIEW_VALID,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.tempAimDirection = new THREE.Vector3();
    this.tempAimPoint = new THREE.Vector3();
  }

  isActive() {
    return this.active;
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) this.#clearPreview();
    return this.active;
  }

  toggleActive() {
    return this.setActive(!this.active);
  }

  setBuildMode(mode) {
    if (!PANEL_BUILD_MODES.includes(mode)) return false;
    this.buildMode = mode;
    if (this.previewMode !== mode) this.#clearPreview();
    return true;
  }

  cycleBuildMode() {
    const index = PANEL_BUILD_MODES.indexOf(this.buildMode);
    this.setBuildMode(PANEL_BUILD_MODES[(index + 1) % PANEL_BUILD_MODES.length]);
    return this.buildMode;
  }

  getBuildState() {
    const cost = PANEL_BUILD_COSTS[this.buildMode] ?? [];
    return {
      active: this.active,
      carrying: false,
      mode: this.buildMode,
      label: PANEL_BUILD_LABELS[this.buildMode],
      modes: [...PANEL_BUILD_MODES],
      previewValid: this.previewValid,
      previewing: Boolean(this.previewRoot && this.previewPlacement),
      canAfford: this.#canAfford(this.buildMode),
      cost: cost.map(entry => ({ ...entry })),
      materialQuantity: this.inventory.get(PANEL_CONSTRUCTION_RESOURCE_ID)
    };
  }

  update(playerPosition, facingDirection, constructionAim = null) {
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      this.#clearPreview();
      return this.getBuildState();
    }

    const placement = this.buildMode === 'floor'
      ? this.#resolveFloorPlacement(playerPosition, facingDirection, constructionAim)
      : this.#resolveWallPlacement(playerPosition, facingDirection, constructionAim);

    this.previewPlacement = placement;
    this.previewValid = Boolean(placement?.valid) && this.#canAfford(this.buildMode);
    if (!placement) {
      this.#clearPreview();
      return this.getBuildState();
    }

    this.#showPreview(this.buildMode, placement, this.previewValid);
    return this.getBuildState();
  }

  build(playerPosition, facingDirection, constructionAim = null) {
    this.update(playerPosition, facingDirection, constructionAim);
    const placement = this.previewPlacement;
    if (!this.previewValid || !placement) return null;

    const cost = PANEL_BUILD_COSTS[this.buildMode];
    let structure = placement.structureId ? this.registry.get(placement.structureId) : null;
    let createdStructure = false;

    if (this.buildMode === 'floor' && placement.newStructure) {
      structure = this.registry.createStructure({
        originX: placement.x,
        originZ: placement.z,
        yaw: placement.yaw
      });
      createdStructure = true;
    }
    if (!structure) return null;

    let stateResult = null;
    if (this.buildMode === 'floor') {
      stateResult = structure.grid.placeFloor({
        x: placement.cellX ?? 0,
        z: placement.cellZ ?? 0,
        storey: placement.storey ?? 0,
        levelY: placement.baseY
      });
    } else {
      stateResult = structure.grid.placeWall({
        x: placement.cellX,
        z: placement.cellZ,
        storey: placement.storey ?? 0,
        direction: placement.direction,
        variant: 'solid'
      });
    }

    if (!stateResult?.ok) {
      if (createdStructure) this.registry.removeIfEmpty(structure.id);
      return null;
    }

    if (!this.inventory.consume(cost)) {
      if (this.buildMode === 'floor') {
        structure.grid.removeFloor({
          x: placement.cellX ?? 0,
          z: placement.cellZ ?? 0,
          storey: placement.storey ?? 0
        });
      } else {
        structure.grid.removeWall(stateResult.wall.key);
      }
      if (createdStructure) this.registry.removeIfEmpty(structure.id);
      return null;
    }

    const entry = this.buildMode === 'floor'
      ? this.#materializeFloor(structure, stateResult.floor)
      : this.#materializeWall(structure, stateResult.wall);
    this.update(playerPosition, facingDirection, constructionAim);
    return {
      ...this.#targetForEntry(entry),
      cost: cost.map(item => ({ ...item })),
      snapped: !placement.newStructure
    };
  }

  getDemolitionEntries() {
    return [...this.entries.values()].filter(entry => entry.active);
  }

  getDemolitionTarget(playerPosition, targetId = null) {
    if (!finitePoint(playerPosition)) return null;
    if (targetId) {
      const entry = this.entries.get(targetId);
      if (!entry?.active || !this.#inReach(entry, playerPosition)) return null;
      return this.#targetForEntry(entry);
    }

    let best = null;
    let bestDistance = INTERACTION_RADIUS;
    for (const entry of this.entries.values()) {
      if (!entry.active) continue;
      const distance = Math.hypot(entry.root.position.x - playerPosition.x, entry.root.position.z - playerPosition.z);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = entry;
    }
    return best ? this.#targetForEntry(best) : null;
  }

  demolish(playerPosition, targetId = null) {
    const target = this.getDemolitionTarget(playerPosition, targetId);
    if (!target) return null;
    const entry = this.entries.get(target.id);
    const structure = this.registry.get(entry.structureId);
    if (!entry || !structure) return null;

    let removed = false;
    if (entry.kind === 'wall') {
      removed = structure.grid.removeWall(entry.stateKey);
    } else {
      removed = structure.grid.removeFloor({
        x: entry.cellX,
        z: entry.cellZ,
        storey: entry.storey
      });
    }
    if (!removed) return null;

    this.#removeEntryRuntime(entry);
    this.entries.delete(entry.id);
    this.registry.removeIfEmpty(structure.id);
    for (const requirement of PANEL_BUILD_COSTS[entry.kind]) {
      this.inventory.add(requirement.itemId, requirement.quantity);
    }
    return target;
  }

  snapshot() {
    return {
      buildMode: this.buildMode,
      registry: this.registry.snapshot()
    };
  }

  restore(snapshot) {
    this.#clearRuntimeConstruction();
    this.registry = snapshot?.registry
      ? PanelStructureRegistry.restore(snapshot.registry)
      : new PanelStructureRegistry();
    this.buildMode = PANEL_BUILD_MODES.includes(snapshot?.buildMode) ? snapshot.buildMode : 'floor';
    this.active = false;

    for (const structure of this.registry.structures.values()) {
      for (const floor of structure.grid.floors.values()) this.#materializeFloor(structure, floor);
      for (const wall of structure.grid.walls.values()) this.#materializeWall(structure, wall);
    }
    this.#clearPreview();
    return true;
  }

  #resolveFloorPlacement(playerPosition, facingDirection, constructionAim) {
    const target = this.#placementTarget(playerPosition, facingDirection, constructionAim);
    let best = null;

    for (const structure of this.registry.structures.values()) {
      for (const floor of structure.grid.floors.values()) {
        for (const direction of directionEntries) {
          const cellX = floor.x + direction.dx;
          const cellZ = floor.z + direction.dz;
          const key = panelCellKey({ x: cellX, z: cellZ, storey: floor.storey });
          if (structure.grid.floors.has(key)) continue;
          const center = this.registry.cellCenterWorld(structure, { x: cellX, z: cellZ });
          if (Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z) > PANEL_GRID.placementReach) continue;
          const terrain = this.#evaluateFloorTerrain(center.x, center.z, structure.yaw, floor.levelY);
          const candidate = {
            kind: 'floor',
            structureId: structure.id,
            newStructure: false,
            cellX,
            cellZ,
            storey: floor.storey,
            x: center.x,
            z: center.z,
            yaw: structure.yaw,
            baseY: floor.levelY,
            topY: floor.levelY + FLOOR_TOP_LIFT,
            valid: terrain.valid && this.#floorClear(center.x, center.z),
            score: this.#candidateScore(
              { x: center.x, y: floor.levelY, z: center.z },
              target,
              constructionAim
            )
          };
          if (!best || candidate.score < best.score) best = candidate;
        }
      }
    }

    if (best && best.score <= CANDIDATE_JOIN_SCORE) return best;

    const yaw = this.#snapYaw(Math.atan2(facingDirection.x, facingDirection.z));
    const x = this.#snapWorld(target.x);
    const z = this.#snapWorld(target.z);
    const centerGround = this.#baseHeightAt(x, z);
    const baseY = centerGround + PHYSICAL_LOG.floorGroundClearance;
    const terrain = this.#evaluateFloorTerrain(x, z, yaw, baseY);
    const inReach = Math.hypot(x - playerPosition.x, z - playerPosition.z) <= PANEL_GRID.placementReach;
    return {
      kind: 'floor',
      structureId: null,
      newStructure: true,
      cellX: 0,
      cellZ: 0,
      storey: 0,
      x,
      z,
      yaw,
      baseY,
      topY: baseY + FLOOR_TOP_LIFT,
      valid: inReach && terrain.valid && this.#floorClear(x, z),
      score: best?.score ?? 0
    };
  }

  #resolveWallPlacement(playerPosition, facingDirection, constructionAim) {
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
            valid: this.#wallClear(edge, floor.levelY),
            score: this.#candidateScore(
              { x: edge.x, y: floor.levelY + PANEL_GRID.storeyHeight * 0.5, z: edge.z },
              target,
              constructionAim
            )
          };
          if (!best || candidate.score < best.score) best = candidate;
        }
      }
    }
    return best && best.score <= PANEL_GRID.cellSize ? best : null;
  }

  #placementTarget(playerPosition, facingDirection, constructionAim) {
    if (finiteAim(constructionAim)) {
      const ground = this.#aimGroundTarget(constructionAim);
      if (ground) return ground;
    }
    const length = Math.hypot(facingDirection.x, facingDirection.z) || 1;
    return {
      x: playerPosition.x + facingDirection.x / length * NEW_STRUCTURE_TARGET_DISTANCE,
      z: playerPosition.z + facingDirection.z / length * NEW_STRUCTURE_TARGET_DISTANCE
    };
  }

  #aimGroundTarget(aim) {
    this.tempAimDirection.set(aim.direction.x, aim.direction.y, aim.direction.z);
    if (this.tempAimDirection.lengthSq() <= 0.000001) return null;
    this.tempAimDirection.normalize();
    const maxDistance = PANEL_GRID.placementReach + 1.4;
    for (let distance = 0.55; distance <= maxDistance; distance += AIM_GROUND_STEP) {
      const x = aim.origin.x + this.tempAimDirection.x * distance;
      const y = aim.origin.y + this.tempAimDirection.y * distance;
      const z = aim.origin.z + this.tempAimDirection.z * distance;
      const ground = this.#baseHeightAt(x, z);
      if (y <= ground + 0.1) return { x, z };
    }
    return null;
  }

  #candidateScore(point, target, aim) {
    if (finiteAim(aim)) {
      this.tempAimDirection.set(aim.direction.x, aim.direction.y, aim.direction.z);
      if (this.tempAimDirection.lengthSq() > 0.000001) {
        this.tempAimDirection.normalize();
        this.tempAimPoint.set(point.x, point.y, point.z);
        const ox = this.tempAimPoint.x - aim.origin.x;
        const oy = this.tempAimPoint.y - aim.origin.y;
        const oz = this.tempAimPoint.z - aim.origin.z;
        const along = ox * this.tempAimDirection.x + oy * this.tempAimDirection.y + oz * this.tempAimDirection.z;
        if (along > 0) {
          const cx = aim.origin.x + this.tempAimDirection.x * along;
          const cy = aim.origin.y + this.tempAimDirection.y * along;
          const cz = aim.origin.z + this.tempAimDirection.z * along;
          return Math.hypot(point.x - cx, point.y - cy, point.z - cz);
        }
      }
    }
    return Math.hypot(point.x - target.x, point.z - target.z);
  }

  #evaluateFloorTerrain(x, z, yaw, baseY) {
    const frame = {
      xX: Math.cos(yaw),
      xZ: -Math.sin(yaw),
      zX: Math.sin(yaw),
      zZ: Math.cos(yaw)
    };
    const half = PANEL_GRID.cellSize * 0.44;
    const samples = [];
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 0, 1]) {
        const px = x + frame.xX * half * sx + frame.zX * half * sz;
        const pz = z + frame.xZ * half * sx + frame.zZ * half * sz;
        if (this.terrain.isPlayable?.(px, pz, 0.3) === false) return { valid: false };
        samples.push(this.#baseHeightAt(px, pz));
      }
    }
    const minimum = Math.min(...samples);
    const maximum = Math.max(...samples);
    const highCut = Math.max(0, maximum - (baseY + PHYSICAL_LOG.floorTerrainSurfaceClearance));
    const supportDepth = Math.max(0, baseY - PHYSICAL_LOG.floorUndersideDepth - minimum);
    return {
      minimum,
      maximum,
      valid:
        highCut <= PHYSICAL_LOG.floorMaxTerrainCutDepth &&
        supportDepth <= PHYSICAL_LOG.floorMaxSupportDepth
    };
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
        (obstacle.type === 'panel-wall' && obstacle.topY <= baseY + 0.02)
      )
    });
  }

  #materializeFloor(structure, floor) {
    const placement = this.registry.floorPlacementWorld(structure, floor);
    const id = `panel:${structure.id}:${floor.key}`;
    const root = createFloorPanelVisual(id);
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'floor';
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

    const supportHandles = [];
    const frame = {
      zX: Math.sin(placement.yaw),
      zZ: Math.cos(placement.yaw)
    };
    for (const offset of [-PHYSICAL_LOG.floorWidth, 0, PHYSICAL_LOG.floorWidth]) {
      supportHandles.push(this.floorSupports.createForFloor({
        x: placement.x + frame.zX * offset,
        z: placement.z + frame.zZ * offset,
        yaw: placement.yaw,
        baseY: placement.baseY,
        topY: placement.topY
      }, this.nextSupportId));
      this.nextSupportId += 1;
    }

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
      supportHandles,
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #materializeWall(structure, wall) {
    const placement = this.registry.wallPlacementWorld(structure, wall.key);
    const id = `panel:${structure.id}:${wall.key}`;
    const root = createWallPanelVisual(id);
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'wall';
    this.group.add(root);

    const collisionHandle = this.collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PANEL_GRID.cellSize * 0.5,
      halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
      yaw: placement.yaw,
      type: 'panel-wall',
      label: id,
      bottomY: placement.baseY - 0.02,
      topY: placement.topY
    });
    const entry = {
      id,
      kind: 'wall',
      structureId: structure.id,
      stateKey: wall.key,
      cellX: wall.x,
      cellZ: wall.z,
      storey: wall.storey,
      direction: wall.direction,
      root,
      collisionHandle,
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #showPreview(mode, placement, valid) {
    if (!this.previewRoot || this.previewMode !== mode) {
      this.#clearPreview();
      this.previewRoot = createPanelPreview(mode, this.previewMaterial);
      this.previewMode = mode;
      this.group.add(this.previewRoot);
    }
    this.previewMaterial.color.setHex(valid ? PREVIEW_VALID : PREVIEW_INVALID);
    this.previewRoot.visible = true;
    this.previewRoot.position.set(placement.x, placement.baseY, placement.z);
    this.previewRoot.rotation.set(0, placement.yaw, 0);
  }

  #clearPreview() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }

  #clearRuntimeConstruction() {
    for (const entry of this.entries.values()) this.#removeEntryRuntime(entry);
    this.entries.clear();
    this.nextSupportId = 1;
  }

  #removeEntryRuntime(entry) {
    entry.active = false;
    if (entry.collisionHandle) this.collision.removeObstacle(entry.collisionHandle);
    for (const handle of entry.supportHandles ?? []) this.floorSupports.remove(handle);
    entry.root?.parent?.remove(entry.root);
  }

  #targetForEntry(entry) {
    const label = PANEL_BUILD_LABELS[entry.kind] ?? 'Construction panel';
    return {
      type: 'panel-construction',
      id: entry.id,
      kind: entry.kind,
      label,
      icon: 'hammer',
      actionLabel: `Demolish ${label.toLowerCase()}`,
      root: entry.root,
      position: {
        x: entry.root.position.x,
        y: entry.root.position.y,
        z: entry.root.position.z
      }
    };
  }

  #inReach(entry, playerPosition) {
    return Math.hypot(
      entry.root.position.x - playerPosition.x,
      entry.root.position.z - playerPosition.z
    ) <= INTERACTION_RADIUS;
  }

  #canAfford(mode) {
    const requirements = PANEL_BUILD_COSTS[mode] ?? [];
    return requirements.every(requirement => this.inventory.has(requirement.itemId, requirement.quantity));
  }

  #baseHeightAt(x, z) {
    return this.terrain.baseHeightAt?.(x, z) ?? this.terrain.heightAt(x, z);
  }

  #snapWorld(value) {
    return Math.round(value / PHYSICAL_LOG.gridStep) * PHYSICAL_LOG.gridStep;
  }

  #snapYaw(yaw) {
    return Math.round(yaw / PHYSICAL_LOG.yawStep) * PHYSICAL_LOG.yawStep;
  }
}
