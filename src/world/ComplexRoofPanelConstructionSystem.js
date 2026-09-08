import * as THREE from 'three';
import {
  PANEL_BUILD_LABELS,
  PANEL_DIRECTIONS,
  PANEL_GRID,
  panelBuildCost
} from '../data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  panelCellKey,
  panelEdgeDescriptor,
  parsePanelCellKey
} from './PanelConstructionGrid.js';
import { PanelConstructionSystem } from './PanelConstructionSystem.js';
import { tintConstructionPreview } from './PhysicalLogVisual.js';
import {
  createSemanticRoofFootprintVisual,
  semanticRoofFootprintRise
} from './SemanticRoofFootprintGeometry.js';
import {
  connectedSemanticRoofCells,
  planSemanticRoofFootprint
} from './SemanticRoofFootprintPlanner.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const LEVEL_TOLERANCE = PANEL_GRID.snapTolerance + 0.001;
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

const cellSignature = cells => cells
  .map(cell => `${cell.x}:${cell.z}`)
  .sort()
  .join('|');

/**
 * Semantic Roof specialization for arbitrary connected orthogonal Floor footprints.
 * Floor/Wall/Door/Window/Stairs remain owned by PanelConstructionSystem; only Roof
 * targeting, footprint planning and presentation are replaced here.
 */
export class ComplexRoofPanelConstructionSystem extends PanelConstructionSystem {
  update(playerPosition, facingDirection, constructionAim = null) {
    if (this.buildMode !== 'roof') {
      return super.update(playerPosition, facingDirection, constructionAim);
    }
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      this.#clearRoofPreview();
      return this.getBuildState();
    }

    const placement = this.#resolveComplexRoofPlacement(playerPosition, constructionAim);
    this.previewPlacement = placement;
    if (!placement) {
      this.#clearRoofPreview();
      return this.getBuildState();
    }

    const cost = panelBuildCost('roof', { roofCellCount: placement.roofCellCount });
    const canAfford = cost.every(requirement => (
      this.inventory.has(requirement.itemId, requirement.quantity)
    ));
    this.previewValid = Boolean(placement.valid) && canAfford;
    this.#showRoofPreview(placement, this.previewValid);
    return this.getBuildState();
  }

  build(playerPosition, facingDirection, constructionAim = null) {
    if (this.buildMode !== 'roof') {
      return super.build(playerPosition, facingDirection, constructionAim);
    }

    this.update(playerPosition, facingDirection, constructionAim);
    const placement = this.previewPlacement;
    if (!this.previewValid || !placement) return null;

    const structure = this.registry.get(placement.structureId);
    if (!structure) return null;
    const cost = panelBuildCost('roof', { roofCellCount: placement.roofCellCount });
    const stateResult = structure.grid.placeRoofZone({
      cells: placement.cells,
      storey: placement.storey,
      form: 'gable',
      ridgeAxis: placement.plan.primaryAxis
    });
    if (!stateResult?.ok) return null;

    if (!this.inventory.consume(cost)) {
      structure.grid.removeRoofZone(stateResult.roofZone.key);
      return null;
    }

    const entry = this.#materializeComplexRoof(structure, stateResult.roofZone, placement);
    this.update(playerPosition, facingDirection, constructionAim);
    return {
      ...this.#targetForRoofEntry(entry, playerPosition),
      cost: cost.map(item => ({ ...item })),
      snapped: true
    };
  }

  restore(snapshot) {
    const restored = super.restore(snapshot);
    for (const structure of this.registry.structures.values()) {
      for (const roofZone of structure.grid.roofZones.values()) {
        const id = `panel:${structure.id}:${roofZone.key}`;
        const entry = this.entries.get(id);
        if (!entry) continue;
        const placement = this.#placementForRoofZone(structure, roofZone);
        if (!placement) continue;
        entry.root?.parent?.remove(entry.root);
        const root = this.#createRoofRoot(id, placement);
        this.group.add(root);
        entry.root = root;
        entry.cellKeys = [...roofZone.cellKeys];
        entry.roofCellCount = placement.roofCellCount;
        entry.ridgeAxis = placement.plan.primaryAxis;
        entry.roofWingCount = placement.plan.wings.length;
        entry.roofShapeKey = placement.plan.shapeKey;
      }
    }
    return restored;
  }

  getDemolitionTarget(playerPosition, targetId = null) {
    if (!finitePoint(playerPosition)) return null;
    if (targetId) {
      const entry = this.entries.get(targetId);
      if (entry?.active && entry.kind === 'roof') {
        const distance = this.#roofEntryDistance(entry, playerPosition);
        return distance <= PHYSICAL_LOG.pickupRange
          ? this.#targetForRoofEntry(entry, playerPosition)
          : null;
      }
      return super.getDemolitionTarget(playerPosition, targetId);
    }

    let best = super.getDemolitionTarget(playerPosition);
    let bestDistance = best?.position
      ? Math.hypot(best.position.x - playerPosition.x, best.position.z - playerPosition.z)
      : Number.POSITIVE_INFINITY;

    for (const entry of this.entries.values()) {
      if (!entry.active || entry.kind !== 'roof') continue;
      const distance = this.#roofEntryDistance(entry, playerPosition);
      if (distance > PHYSICAL_LOG.pickupRange || distance >= bestDistance) continue;
      bestDistance = distance;
      best = this.#targetForRoofEntry(entry, playerPosition);
    }
    return best;
  }

  #resolveComplexRoofPlacement(playerPosition, constructionAim) {
    let best = null;
    const seenComponents = new Set();

    for (const structure of this.registry.structures.values()) {
      const floors = [...structure.grid.floors.values()];
      for (const seed of floors) {
        if (!this.#floorIsRoofable(structure, seed)) continue;

        const roofableFloors = floors.filter(floor => (
          floor.storey === seed.storey &&
          Math.abs(floor.levelY - seed.levelY) <= LEVEL_TOLERANCE &&
          this.#floorIsRoofable(structure, floor)
        ));
        const component = connectedSemanticRoofCells(roofableFloors, seed);
        if (!component.length) continue;
        const componentId = `${structure.id}:${seed.storey}:${cellSignature(component)}`;
        if (seenComponents.has(componentId)) continue;
        seenComponents.add(componentId);

        const plan = planSemanticRoofFootprint(component, {
          cellSize: PANEL_GRID.cellSize
        });
        const placement = this.#placementForCells(structure, component, seed.storey, plan);
        if (!placement) continue;

        let nearestDistance = Number.POSITIVE_INFINITY;
        let nearestScore = Number.POSITIVE_INFINITY;
        for (const cell of component) {
          const center = this.registry.cellCenterWorld(structure, cell);
          nearestDistance = Math.min(
            nearestDistance,
            Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z)
          );
          nearestScore = Math.min(
            nearestScore,
            this.#roofCandidateScore(
              {
                x: center.x,
                y: placement.baseY + semanticRoofFootprintRise(plan) * 0.5,
                z: center.z
              },
              playerPosition,
              constructionAim
            )
          );
        }
        if (nearestDistance > PANEL_GRID.placementReach + PANEL_GRID.cellSize * 0.3) continue;

        placement.valid = this.#roofSupported(structure, component, seed.storey);
        placement.score = nearestScore;
        if (!best || placement.score < best.score) best = placement;
      }
    }

    return best && best.score <= PANEL_GRID.cellSize * 1.7 ? best : null;
  }

  #floorIsRoofable(structure, floor) {
    if (structure.grid.floors.has(panelCellKey({
      x: floor.x,
      z: floor.z,
      storey: floor.storey + 1
    }))) return false;
    if (this.#roofCellOccupied(structure, floor.key)) return false;
    return ![...structure.grid.stairs.values()].some(stair => (
      stair.storey === floor.storey &&
      (stair.sourceCellKey === floor.key || stair.targetCellKey === floor.key)
    ));
  }

  #roofCellOccupied(structure, cellKey) {
    return [...structure.grid.roofZones.values()].some(zone => (
      zone.cellKeys.includes(cellKey)
    ));
  }

  #roofSupported(structure, cells, storey) {
    const candidateKeys = new Set(cells.map(cell => panelCellKey({ ...cell, storey })));
    const existingRoofKeys = new Set(
      [...structure.grid.roofZones.values()].flatMap(zone => zone.cellKeys)
    );

    for (const cell of cells) {
      for (const direction of directionEntries) {
        const neighbourKey = panelCellKey({
          x: cell.x + direction.dx,
          z: cell.z + direction.dz,
          storey
        });
        if (candidateKeys.has(neighbourKey) || existingRoofKeys.has(neighbourKey)) continue;
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

  #placementForRoofZone(structure, roofZone) {
    const cells = (roofZone.cellKeys ?? []).map(parsePanelCellKey).filter(Boolean);
    const plan = planSemanticRoofFootprint(cells, {
      cellSize: PANEL_GRID.cellSize,
      preferredAxis: roofZone.ridgeAxis ?? null
    });
    return this.#placementForCells(structure, cells, roofZone.storey, plan);
  }

  #placementForCells(structure, cells, storey, plan = null) {
    const resolvedPlan = plan ?? planSemanticRoofFootprint(cells, {
      cellSize: PANEL_GRID.cellSize
    });
    if (!resolvedPlan) return null;

    const floors = cells.map(cell => structure.grid.floors.get(panelCellKey({
      x: cell.x,
      z: cell.z,
      storey
    }))).filter(Boolean);
    if (floors.length !== cells.length) return null;

    const localCenter = structure.grid.cellCenter({
      x: resolvedPlan.centerX,
      z: resolvedPlan.centerZ
    });
    const worldCenter = this.registry.localToWorld(structure, localCenter.x, localCenter.z);
    const floorLevel = Math.max(...floors.map(floor => floor.levelY));
    const rise = semanticRoofFootprintRise(resolvedPlan);
    return {
      kind: 'roof',
      structureId: structure.id,
      newStructure: false,
      cells: resolvedPlan.cells.map(cell => ({ ...cell })),
      cellKeys: resolvedPlan.cells.map(cell => panelCellKey({ ...cell, storey })),
      roofCellCount: resolvedPlan.cellCount,
      storey,
      x: worldCenter.x,
      z: worldCenter.z,
      yaw: structure.yaw,
      baseY: floorLevel + PANEL_GRID.storeyHeight,
      topY: floorLevel + PANEL_GRID.storeyHeight + rise,
      width: resolvedPlan.width,
      depth: resolvedPlan.depth,
      ridgeAxis: resolvedPlan.primaryAxis,
      plan: resolvedPlan,
      previewShapeKey: resolvedPlan.shapeKey,
      valid: true,
      score: 0
    };
  }

  #roofCandidateScore(point, playerPosition, aim) {
    if (finiteAim(aim)) {
      const dx = aim.direction.x;
      const dy = aim.direction.y;
      const dz = aim.direction.z;
      const magnitude = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / magnitude;
      const uy = dy / magnitude;
      const uz = dz / magnitude;
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
    return Math.hypot(point.x - playerPosition.x, point.z - playerPosition.z);
  }

  #showRoofPreview(placement, valid) {
    if (
      !this.previewRoot ||
      this.previewMode !== 'roof' ||
      this.previewShapeKey !== placement.previewShapeKey
    ) {
      if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
      this.previewRoot = createSemanticRoofFootprintVisual('PanelRoofFootprintPreview', {
        plan: placement.plan
      });
      tintConstructionPreview(this.previewRoot, this.previewMaterial);
      this.previewMode = 'roof';
      this.previewShapeKey = placement.previewShapeKey;
      this.group.add(this.previewRoot);
    }
    this.previewMaterial.color.setHex(valid ? PREVIEW_VALID : PREVIEW_INVALID);
    this.previewRoot.visible = true;
    this.previewRoot.position.set(placement.x, placement.baseY, placement.z);
    this.previewRoot.rotation.set(0, placement.yaw, 0);
  }

  #clearRoofPreview() {
    if (this.previewRoot) this.previewRoot.parent?.remove(this.previewRoot);
    this.previewRoot = null;
    this.previewMode = null;
    this.previewShapeKey = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }

  #createRoofRoot(id, placement) {
    const root = createSemanticRoofFootprintVisual(id, { plan: placement.plan });
    root.position.set(placement.x, placement.baseY, placement.z);
    root.rotation.y = placement.yaw;
    root.userData.panelConstructionId = id;
    root.userData.panelConstructionKind = 'roof';
    root.userData.panelRoofCellCount = placement.roofCellCount;
    root.userData.panelRoofRidgeAxis = placement.plan.primaryAxis;
    root.userData.panelRoofWingCount = placement.plan.wings.length;
    root.userData.panelRoofShapeKey = placement.plan.shapeKey;
    return root;
  }

  #materializeComplexRoof(structure, roofZone, placement = null) {
    const resolvedPlacement = placement ?? this.#placementForRoofZone(structure, roofZone);
    const id = `panel:${structure.id}:${roofZone.key}`;
    const root = this.#createRoofRoot(id, resolvedPlacement);
    this.group.add(root);

    const entry = {
      id,
      kind: 'roof',
      structureId: structure.id,
      stateKey: roofZone.key,
      cellKeys: [...roofZone.cellKeys],
      roofCellCount: resolvedPlacement.roofCellCount,
      storey: roofZone.storey,
      ridgeAxis: resolvedPlacement.plan.primaryAxis,
      roofWingCount: resolvedPlacement.plan.wings.length,
      roofShapeKey: resolvedPlacement.plan.shapeKey,
      root,
      collisionHandle: null,
      collisionHandles: [],
      supportHandles: [],
      active: true
    };
    this.entries.set(id, entry);
    return entry;
  }

  #roofEntryDistance(entry, playerPosition) {
    const structure = this.registry.get(entry.structureId);
    if (!structure) return Number.POSITIVE_INFINITY;
    let nearest = Number.POSITIVE_INFINITY;
    for (const key of entry.cellKeys ?? []) {
      const cell = parsePanelCellKey(key);
      if (!cell) continue;
      const center = this.registry.cellCenterWorld(structure, cell);
      nearest = Math.min(
        nearest,
        Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z)
      );
    }
    return nearest;
  }

  #targetForRoofEntry(entry, playerPosition = null) {
    const structure = this.registry.get(entry.structureId);
    let position = {
      x: entry.root.position.x,
      y: entry.root.position.y,
      z: entry.root.position.z
    };
    if (structure && finitePoint(playerPosition)) {
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const key of entry.cellKeys ?? []) {
        const cell = parsePanelCellKey(key);
        if (!cell) continue;
        const center = this.registry.cellCenterWorld(structure, cell);
        const distance = Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z);
        if (distance >= nearestDistance) continue;
        nearestDistance = distance;
        position = { x: center.x, y: entry.root.position.y, z: center.z };
      }
    }
    return {
      type: 'panel-construction',
      id: entry.id,
      kind: 'roof',
      variant: null,
      label: PANEL_BUILD_LABELS.roof,
      icon: 'hammer',
      actionLabel: 'Demolish roof',
      cost: panelBuildCost('roof', { roofCellCount: entry.roofCellCount }),
      root: entry.root,
      position
    };
  }
}
