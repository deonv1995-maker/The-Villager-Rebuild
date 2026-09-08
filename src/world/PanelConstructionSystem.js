import * as THREE from 'three';
import {
  PANEL_BUILD_LABELS,
  PANEL_BUILD_MODES,
  PANEL_CONSTRUCTION_RESOURCE_ID,
  PANEL_DIRECTIONS,
  PANEL_GRID,
  PANEL_STAIR,
  panelBuildCost
} from '../data/PanelConstructionDefinitions.js';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import {
  panelCellKey,
  panelEdgeDescriptor,
  panelStairKey,
  parsePanelCellKey
} from './PanelConstructionGrid.js';
import {
  createFloorPanelVisual,
  createPanelPreview,
  createWallPanelVisual
} from './PanelConstructionVisual.js';
import { FloorSupportVisual } from './FloorSupportVisual.js';
import { PanelStructureRegistry } from './PanelStructureRegistry.js';
import { semanticDoorColliderSpecs } from './SemanticDoorPanelGeometry.js';
import {
  createSemanticRoofZoneVisual,
  semanticRoofRise
} from './SemanticRoofZoneGeometry.js';
import {
  createSemanticStairPanelVisual,
  semanticStairColliderSpecs
} from './SemanticStairPanelGeometry.js';
import { semanticWindowColliderSpecs } from './SemanticWindowPanelGeometry.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const INTERACTION_RADIUS = PHYSICAL_LOG.pickupRange;
const FLOOR_TOP_LIFT = 0.028;
const FLOOR_CLEARANCE_RADIUS = PANEL_GRID.cellSize * 0.36;
const NEW_STRUCTURE_TARGET_DISTANCE = PHYSICAL_LOG.placeDistance + PANEL_GRID.cellSize * 0.12;
const CANDIDATE_JOIN_SCORE = PANEL_GRID.cellSize * 0.82;
const AIM_GROUND_STEP = 0.22;
const LEVEL_TOLERANCE = PANEL_GRID.snapTolerance + 0.001;

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

const wallVariantForBuildMode = mode => (
  mode === 'door' || mode === 'window' ? mode : 'solid'
);

const buildModeForEntry = entry => (
  entry?.kind === 'wall' && (entry.variant === 'door' || entry.variant === 'window')
    ? entry.variant
    : entry?.kind
);

const cellXZKey = (x, z) => `${x}:${z}`;

const rectangleFromSeed = (floors, seed, primaryAxis) => {
  const available = new Map(floors.map(floor => [cellXZKey(floor.x, floor.z), floor]));
  const primaryCoord = floor => primaryAxis === 'x' ? floor.x : floor.z;
  const secondaryCoord = floor => primaryAxis === 'x' ? floor.z : floor.x;
  const makeCoord = (primary, secondary) => primaryAxis === 'x'
    ? { x: primary, z: secondary }
    : { x: secondary, z: primary };
  const seedPrimary = primaryCoord(seed);
  const seedSecondary = secondaryCoord(seed);

  let minPrimary = seedPrimary;
  let maxPrimary = seedPrimary;
  while (available.has(cellXZKey(...Object.values(makeCoord(minPrimary - 1, seedSecondary))))) minPrimary -= 1;
  while (available.has(cellXZKey(...Object.values(makeCoord(maxPrimary + 1, seedSecondary))))) maxPrimary += 1;

  const rowExists = secondary => {
    for (let primary = minPrimary; primary <= maxPrimary; primary += 1) {
      const coord = makeCoord(primary, secondary);
      if (!available.has(cellXZKey(coord.x, coord.z))) return false;
    }
    return true;
  };

  let minSecondary = seedSecondary;
  let maxSecondary = seedSecondary;
  while (rowExists(minSecondary - 1)) minSecondary -= 1;
  while (rowExists(maxSecondary + 1)) maxSecondary += 1;

  const cells = [];
  for (let secondary = minSecondary; secondary <= maxSecondary; secondary += 1) {
    for (let primary = minPrimary; primary <= maxPrimary; primary += 1) {
      cells.push(makeCoord(primary, secondary));
    }
  }
  return cells;
};

const chooseRoofRectangle = (floors, seed) => {
  const alongX = rectangleFromSeed(floors, seed, 'x');
  const alongZ = rectangleFromSeed(floors, seed, 'z');
  if (alongZ.length > alongX.length) return alongZ;
  if (alongX.length > alongZ.length) return alongX;

  const bounds = cells => ({
    width: Math.max(...cells.map(cell => cell.x)) - Math.min(...cells.map(cell => cell.x)) + 1,
    depth: Math.max(...cells.map(cell => cell.z)) - Math.min(...cells.map(cell => cell.z)) + 1
  });
  const xBounds = bounds(alongX);
  const zBounds = bounds(alongZ);
  return xBounds.width >= zBounds.depth ? alongX : alongZ;
};

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
    this.previewShapeKey = null;
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
    const cost = this.#costFor(this.buildMode, this.previewPlacement);
    return {
      active: this.active,
      carrying: false,
      mode: this.buildMode,
      label: PANEL_BUILD_LABELS[this.buildMode],
      modes: [...PANEL_BUILD_MODES],
      previewValid: this.previewValid,
      previewing: Boolean(this.previewRoot && this.previewPlacement),
      canAfford: this.#canAfford(this.buildMode, this.previewPlacement),
      cost,
      materialQuantity: this.inventory.get(PANEL_CONSTRUCTION_RESOURCE_ID)
    };
  }

  update(playerPosition, facingDirection, constructionAim = null) {
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      this.#clearPreview();
      return this.getBuildState();
    }

    let placement = null;
    if (this.buildMode === 'floor') {
      placement = this.#resolveFloorPlacement(playerPosition, facingDirection, constructionAim);
    } else if (this.buildMode === 'wall' || this.buildMode === 'door' || this.buildMode === 'window') {
      placement = this.#resolveWallPlacement(playerPosition, facingDirection, constructionAim);
    } else if (this.buildMode === 'stairs') {
      placement = this.#resolveStairPlacement(playerPosition, constructionAim);
    } else if (this.buildMode === 'roof') {
      placement = this.#resolveRoofPlacement(playerPosition, constructionAim);
    }

    this.previewPlacement = placement;
    this.previewValid = Boolean(placement?.valid) && this.#canAfford(this.buildMode, placement);
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

    const cost = this.#costFor(this.buildMode, placement);
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
    } else if (this.buildMode === 'wall' || this.buildMode === 'door' || this.buildMode === 'window') {
      stateResult = structure.grid.placeWall({
        x: placement.cellX,
        z: placement.cellZ,
        storey: placement.storey ?? 0,
        direction: placement.direction,
        variant: wallVariantForBuildMode(this.buildMode)
      });
    } else if (this.buildMode === 'stairs') {
      stateResult = structure.grid.placeStair({
        x: placement.cellX,
        z: placement.cellZ,
        storey: placement.storey ?? 0,
        direction: placement.direction
      });
    } else if (this.buildMode === 'roof') {
      stateResult = structure.grid.placeRoofZone({
        cells: placement.cells,
        storey: placement.storey ?? 0,
        form: 'gable',
        ridgeAxis: placement.ridgeAxis
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
      } else if (this.buildMode === 'wall' || this.buildMode === 'door' || this.buildMode === 'window') {
        structure.grid.removeWall(stateResult.wall.key);
      } else if (this.buildMode === 'stairs') {
        structure.grid.removeStair(stateResult.stair.key);
      } else if (this.buildMode === 'roof') {
        structure.grid.removeRoofZone(stateResult.roofZone.key);
      }
      if (createdStructure) this.registry.removeIfEmpty(structure.id);
      return null;
    }

    let entry;
    if (this.buildMode === 'floor') {
      entry = this.#materializeFloor(structure, stateResult.floor);
    } else if (this.buildMode === 'wall' || this.buildMode === 'door' || this.buildMode === 'window') {
      entry = this.#materializeWall(structure, stateResult.wall);
    } else if (this.buildMode === 'stairs') {
      entry = this.#materializeStair(structure, stateResult.stair);
    } else {
      entry = this.#materializeRoof(structure, stateResult.roofZone);
    }

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
    if (!entry) return null;
    const structure = this.registry.get(entry.structureId);
    if (!structure) return null;

    let removed = false;
    if (entry.kind === 'wall') {
      removed = structure.grid.removeWall(entry.stateKey);
    } else if (entry.kind === 'floor') {
      removed = structure.grid.removeFloor({
        x: entry.cellX,
        z: entry.cellZ,
        storey: entry.storey
      });
    } else if (entry.kind === 'stairs') {
      removed = structure.grid.removeStair(entry.stateKey);
    } else if (entry.kind === 'roof') {
      removed = structure.grid.removeRoofZone(entry.stateKey);
    }
    if (!removed) return null;

    const refund = this.#costForEntry(entry);
    this.#removeEntryRuntime(entry);
    this.entries.delete(entry.id);
    this.registry.removeIfEmpty(structure.id);
    for (const requirement of refund) {
      this.inventory.add(requirement.itemId, requirement.quantity);
    }
    return {
      ...target,
      refund: refund.map(item => ({ ...item }))
    };
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
      for (const stair of structure.grid.stairs.values()) this.#materializeStair(structure, stair);
      for (const roofZone of structure.grid.roofZones.values()) this.#materializeRoof(structure, roofZone);
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
          const terrain = floor.storey === 0
            ? this.#evaluateFloorTerrain(center.x, center.z, structure.yaw, floor.levelY)
            : { valid: true };
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

  #resolveStairPlacement(playerPosition, constructionAim) {
    let best = null;

    for (const structure of this.registry.structures.values()) {
      const floors = [...structure.grid.floors.values()];
      for (const floor of floors) {
        const sourceCenter = this.registry.cellCenterWorld(structure, floor);
        for (const direction of directionEntries) {
          const targetFloor = structure.grid.floors.get(panelCellKey({
            x: floor.x + direction.dx,
            z: floor.z + direction.dz,
            storey: floor.storey
          }));
          if (!targetFloor || Math.abs(targetFloor.levelY - floor.levelY) > LEVEL_TOLERANCE) continue;
          const stairKey = panelStairKey({
            x: floor.x,
            z: floor.z,
            storey: floor.storey,
            direction: direction.id
          });
          if (structure.grid.stairs.has(stairKey)) continue;
          const sourceOrTargetOccupied = [...structure.grid.stairs.values()].some(stair => (
            stair.sourceCellKey === floor.key ||
            stair.targetCellKey === floor.key ||
            stair.sourceCellKey === targetFloor.key ||
            stair.targetCellKey === targetFloor.key
          ));
          if (sourceOrTargetOccupied) continue;

          const edge = panelEdgeDescriptor({
            x: floor.x,
            z: floor.z,
            storey: floor.storey,
            direction: direction.id
          });
          if (structure.grid.walls.has(edge.key)) continue;

          const targetCenter = this.registry.cellCenterWorld(structure, targetFloor);
          const x = (sourceCenter.x + targetCenter.x) * 0.5;
          const z = (sourceCenter.z + targetCenter.z) * 0.5;
          if (Math.hypot(x - playerPosition.x, z - playerPosition.z) > PANEL_GRID.placementReach) continue;
          const dx = targetCenter.x - sourceCenter.x;
          const dz = targetCenter.z - sourceCenter.z;
          const length = Math.hypot(dx, dz) || 1;
          const runX = dx / length;
          const runZ = dz / length;
          const yaw = Math.atan2(runX, runZ);
          const lowPoint = {
            x: x - runX * PANEL_STAIR.runLength * 0.42,
            y: floor.levelY + FLOOR_TOP_LIFT,
            z: z - runZ * PANEL_STAIR.runLength * 0.42
          };
          const placement = {
            kind: 'stairs',
            structureId: structure.id,
            newStructure: false,
            cellX: floor.x,
            cellZ: floor.z,
            targetCellX: targetFloor.x,
            targetCellZ: targetFloor.z,
            storey: floor.storey,
            direction: direction.id,
            stateKey: stairKey,
            x,
            z,
            yaw,
            baseY: floor.levelY + FLOOR_TOP_LIFT,
            topY: floor.levelY + FLOOR_TOP_LIFT + PANEL_GRID.storeyHeight,
            valid: this.#stairClear(x, z),
            score: this.#candidateScore(lowPoint, lowPoint, constructionAim)
          };
          if (!best || placement.score < best.score) best = placement;
        }
      }
    }
    return best && best.score <= PANEL_GRID.cellSize * 1.15 ? best : null;
  }

  #resolveRoofPlacement(playerPosition, constructionAim) {
    let best = null;

    for (const structure of this.registry.structures.values()) {
      const floors = [...structure.grid.floors.values()];
      for (const seed of floors) {
        if (structure.grid.floors.has(panelCellKey({ x: seed.x, z: seed.z, storey: seed.storey + 1 }))) continue;
        if (this.#roofCellOccupied(structure, seed.key)) continue;
        if ([...structure.grid.stairs.values()].some(stair => (
          stair.storey === seed.storey && (stair.sourceCellKey === seed.key || stair.targetCellKey === seed.key)
        ))) continue;

        const roofableFloors = floors.filter(floor => (
          floor.storey === seed.storey &&
          Math.abs(floor.levelY - seed.levelY) <= LEVEL_TOLERANCE &&
          !structure.grid.floors.has(panelCellKey({ x: floor.x, z: floor.z, storey: floor.storey + 1 })) &&
          !this.#roofCellOccupied(structure, floor.key) &&
          ![...structure.grid.stairs.values()].some(stair => (
            stair.storey === floor.storey && (stair.sourceCellKey === floor.key || stair.targetCellKey === floor.key)
          ))
        ));
        if (!roofableFloors.length) continue;

        const cells = chooseRoofRectangle(roofableFloors, seed);
        const placement = this.#roofPlacementForCells(structure, cells, seed.storey);
        if (!placement) continue;
        if (Math.hypot(placement.x - playerPosition.x, placement.z - playerPosition.z) > PANEL_GRID.placementReach + PANEL_GRID.cellSize) {
          continue;
        }
        placement.valid = this.#roofSupported(structure, cells, seed.storey);
        placement.score = this.#candidateScore(
          {
            x: placement.x,
            y: placement.baseY + semanticRoofRise(placement),
            z: placement.z
          },
          { x: placement.x, z: placement.z },
          constructionAim
        );
        if (!best || placement.score < best.score) best = placement;
      }
    }
    return best && best.score <= PANEL_GRID.cellSize * 1.6 ? best : null;
  }

  #roofPlacementForCells(structure, cells, storey, ridgeAxis = null) {
    if (!cells?.length) return null;
    const xs = cells.map(cell => cell.x);
    const zs = cells.map(cell => cell.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const width = (maxX - minX + 1) * PANEL_GRID.cellSize;
    const depth = (maxZ - minZ + 1) * PANEL_GRID.cellSize;
    const localCenter = structure.grid.cellCenter({
      x: (minX + maxX) * 0.5,
      z: (minZ + maxZ) * 0.5
    });
    const worldCenter = this.registry.localToWorld(structure, localCenter.x, localCenter.z);
    const floors = cells
      .map(cell => structure.grid.floors.get(panelCellKey({ x: cell.x, z: cell.z, storey })))
      .filter(Boolean);
    if (floors.length !== cells.length) return null;
    const floorLevel = Math.max(...floors.map(floor => floor.levelY));
    const resolvedAxis = ridgeAxis ?? (width >= depth ? 'x' : 'z');
    return {
      kind: 'roof',
      structureId: structure.id,
      newStructure: false,
      cells: cells.map(cell => ({ x: cell.x, z: cell.z })),
      cellKeys: cells.map(cell => panelCellKey({ x: cell.x, z: cell.z, storey })),
      roofCellCount: cells.length,
      storey,
      x: worldCenter.x,
      z: worldCenter.z,
      yaw: structure.yaw,
      baseY: floorLevel + PANEL_GRID.storeyHeight,
      topY: floorLevel + PANEL_GRID.storeyHeight + semanticRoofRise({ width, depth, ridgeAxis: resolvedAxis }),
      width,
      depth,
      ridgeAxis: resolvedAxis,
      previewShapeKey: `${width.toFixed(3)}:${depth.toFixed(3)}:${resolvedAxis}`,
      valid: true,
      score: 0
    };
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
        obstacle.type === 'panel-stair' ||
        (obstacle.type === 'panel-wall' && obstacle.topY <= baseY + 0.02)
      )
    });
  }

  #stairClear(x, z) {
    return this.collision.isCircleClear(x, z, PANEL_STAIR.width * 0.38, {
      ignore: obstacle => obstacle.type === 'panel-floor' || obstacle.type === 'panel-stair'
    });
  }

  #roofCellOccupied(structure, cellKey) {
    return [...structure.grid.roofZones.values()].some(zone => zone.cellKeys.includes(cellKey));
  }

  #roofSupported(structure, cells, storey) {
    const floorKeys = new Set(
      [...structure.grid.floors.values()]
        .filter(floor => floor.storey === storey)
        .map(floor => floor.key)
    );
    for (const cell of cells) {
      for (const direction of directionEntries) {
        const neighborKey = panelCellKey({
          x: cell.x + direction.dx,
          z: cell.z + direction.dz,
          storey
        });
        if (floorKeys.has(neighborKey)) continue;
        const edge = panelEdgeDescriptor({
          x: cell.x,
          z: cell.z,
          storey,
          direction: direction.id
        });
        if (!structure.grid.walls.has(edge.key)) return false;
      }
    }
    return true;
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
    if (floor.storey === 0) {
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
    const variant = wall.variant ?? 'solid';
    const root = createWallPanelVisual(id, variant);
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'wall';
    root.userData.panelWallVariant = variant;
    this.group.add(root);

    let collisionSpecs;
    if (variant === 'door') {
      collisionSpecs = semanticDoorColliderSpecs({
        x: placement.x,
        z: placement.z,
        yaw: placement.yaw,
        bottomY: placement.baseY - 0.02,
        topY: placement.topY
      });
    } else if (variant === 'window') {
      collisionSpecs = semanticWindowColliderSpecs({
        x: placement.x,
        z: placement.z,
        yaw: placement.yaw,
        baseY: placement.baseY,
        topY: placement.topY
      });
    } else {
      collisionSpecs = [{
        x: placement.x,
        z: placement.z,
        halfX: PANEL_GRID.cellSize * 0.5,
        halfZ: CONSTRUCTION_DIMENSIONS.wallThickness,
        yaw: placement.yaw,
        bottomY: placement.baseY - 0.02,
        topY: placement.topY
      }];
    }
    const collisionHandles = collisionSpecs.map((spec, index) => this.collision.addBox({
      ...spec,
      type: 'panel-wall',
      label: collisionSpecs.length === 1 ? id : `${id}:${variant}:${index}`
    }));
    const entry = {
      id,
      kind: 'wall',
      variant,
      structureId: structure.id,
      stateKey: wall.key,
      cellX: wall.x,
      cellZ: wall.z,
      storey: wall.storey,
      direction: wall.direction,
      root,
      collisionHandle: collisionHandles[0] ?? null,
      collisionHandles,
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #stairPlacementWorld(structure, stair) {
    const source = this.registry.cellCenterWorld(structure, { x: stair.x, z: stair.z });
    const target = this.registry.cellCenterWorld(structure, { x: stair.targetX, z: stair.targetZ });
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const length = Math.hypot(dx, dz) || 1;
    const runX = dx / length;
    const runZ = dz / length;
    return {
      x: (source.x + target.x) * 0.5,
      z: (source.z + target.z) * 0.5,
      yaw: Math.atan2(runX, runZ),
      baseY: stair.baseY + FLOOR_TOP_LIFT,
      topY: stair.topY + FLOOR_TOP_LIFT
    };
  }

  #materializeStair(structure, stair) {
    const placement = this.#stairPlacementWorld(structure, stair);
    const id = `panel:${structure.id}:${stair.key}`;
    const root = createSemanticStairPanelVisual(id);
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'stairs';
    this.group.add(root);

    const collisionHandles = semanticStairColliderSpecs(placement).map((spec, index) => this.collision.addBox({
      ...spec,
      type: 'panel-stair',
      label: `${id}:step:${index}`
    }));
    const entry = {
      id,
      kind: 'stairs',
      structureId: structure.id,
      stateKey: stair.key,
      cellX: stair.x,
      cellZ: stair.z,
      targetCellX: stair.targetX,
      targetCellZ: stair.targetZ,
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

  #roofPlacementWorld(structure, roofZone) {
    const cells = (roofZone.cellKeys ?? []).map(parsePanelCellKey).filter(Boolean);
    return this.#roofPlacementForCells(structure, cells, roofZone.storey, roofZone.ridgeAxis ?? null);
  }

  #materializeRoof(structure, roofZone) {
    const placement = this.#roofPlacementWorld(structure, roofZone);
    const id = `panel:${structure.id}:${roofZone.key}`;
    const root = createSemanticRoofZoneVisual(id, {
      width: placement.width,
      depth: placement.depth,
      ridgeAxis: placement.ridgeAxis
    });
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'roof';
    root.userData.panelRoofCellCount = placement.roofCellCount;
    root.userData.panelRoofRidgeAxis = placement.ridgeAxis;
    this.group.add(root);

    const entry = {
      id,
      kind: 'roof',
      structureId: structure.id,
      stateKey: roofZone.key,
      cellKeys: [...roofZone.cellKeys],
      roofCellCount: placement.roofCellCount,
      storey: roofZone.storey,
      ridgeAxis: placement.ridgeAxis,
      root,
      collisionHandle: null,
      collisionHandles: [],
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #showPreview(mode, placement, valid) {
    const shapeKey = mode === 'roof' ? placement.previewShapeKey : mode;
    if (!this.previewRoot || this.previewMode !== mode || this.previewShapeKey !== shapeKey) {
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

  #clearPreview() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewShapeKey = null;
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
    const collisionHandles = entry.collisionHandles?.length
      ? entry.collisionHandles
      : entry.collisionHandle
        ? [entry.collisionHandle]
        : [];
    for (const handle of collisionHandles) this.collision.removeObstacle(handle);
    for (const handle of entry.supportHandles ?? []) this.floorSupports.remove(handle);
    entry.root?.parent?.remove(entry.root);
  }

  #targetForEntry(entry) {
    const mode = buildModeForEntry(entry);
    const label = PANEL_BUILD_LABELS[mode] ?? 'Construction panel';
    return {
      type: 'panel-construction',
      id: entry.id,
      kind: entry.kind,
      variant: entry.variant ?? null,
      label,
      icon: 'hammer',
      actionLabel: `Demolish ${label.toLowerCase()}`,
      cost: this.#costForEntry(entry),
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

  #costFor(mode, placement = null) {
    return panelBuildCost(mode, {
      roofCellCount: placement?.roofCellCount ?? placement?.cellKeys?.length ?? 1
    });
  }

  #costForEntry(entry) {
    return this.#costFor(buildModeForEntry(entry), entry);
  }

  #canAfford(mode, placement = null) {
    const requirements = this.#costFor(mode, placement);
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
