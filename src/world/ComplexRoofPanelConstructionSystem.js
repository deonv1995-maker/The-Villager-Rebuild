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
import { StackedWallPanelConstructionSystem } from './StackedWallPanelConstructionSystem.js';
import { collectPanelWallEnclosureCells } from './PanelUpperStoreyRules.js';
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

const cellKey = cell => `${cell.x}:${cell.z}`;

const cellSignature = cells => cells
  .map(cellKey)
  .sort()
  .join('|');

/**
 * Semantic Roof specialization for arbitrary connected orthogonal support footprints.
 * The established Floor-backed path remains valid, while a completed wall-family ring
 * may also carry a Roof directly. Floor/Wall/Door/Window/Stairs otherwise remain owned
 * by the lower semantic construction layers.
 */
export class ComplexRoofPanelConstructionSystem extends StackedWallPanelConstructionSystem {
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
    const absorbedRoofZones = (placement.absorbedRoofZoneKeys ?? [])
      .map(key => structure.grid.roofZones.get(key))
      .filter(Boolean)
      .map(zone => ({ ...zone, cellKeys: [...zone.cellKeys] }));

    for (const zone of absorbedRoofZones) structure.grid.removeRoofZone(zone.key);
    const stateResult = structure.grid.placeRoofZone({
      cells: placement.cells,
      storey: placement.storey,
      form: 'gable',
      ridgeAxis: placement.plan.primaryAxis
    });
    if (!stateResult?.ok) {
      this.#restoreRoofZones(structure, absorbedRoofZones);
      return null;
    }

    if (!this.inventory.consume(cost)) {
      structure.grid.removeRoofZone(stateResult.roofZone.key);
      this.#restoreRoofZones(structure, absorbedRoofZones);
      return null;
    }

    for (const zone of absorbedRoofZones) {
      this.#removeRoofEntryRuntime(structure.id, zone.key);
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
    const savedRoofZones = new Map(
      (snapshot?.registry?.structures ?? []).map(saved => [
        saved.id,
        (saved.grid?.roofZones ?? []).map(zone => ({
          ...zone,
          cellKeys: [...(zone.cellKeys ?? [])]
        }))
      ])
    );
    const shellSnapshot = snapshot?.registry
      ? {
          ...snapshot,
          registry: {
            ...snapshot.registry,
            structures: (snapshot.registry.structures ?? []).map(saved => ({
              ...saved,
              grid: {
                ...saved.grid,
                roofZones: []
              }
            }))
          }
        }
      : snapshot;

    // Restore Floors, Walls and Stairs first. This deliberately keeps Roofs out of the
    // base restore path because a wall-supported Roof may have no coincident Floor.
    const restored = super.restore(shellSnapshot);

    for (const structure of this.registry.structures.values()) {
      for (const zone of savedRoofZones.get(structure.id) ?? []) {
        const cells = (zone.cellKeys ?? []).map(key => {
          const cell = parsePanelCellKey(key);
          if (!cell || cell.storey !== zone.storey) {
            throw new Error(`Invalid persisted roof cell: ${key}`);
          }
          return { x: cell.x, z: cell.z };
        });
        const result = structure.grid.placeRoofZone({
          cells,
          storey: zone.storey,
          form: zone.form ?? 'gable',
          ridgeAxis: zone.ridgeAxis ?? null
        });
        if (!result.ok) {
          throw new Error(`Invalid persisted roof zone: ${zone.key ?? 'unknown'}`);
        }
      }
    }

    // Older semantic saves may contain adjacent Roof zones created in separate build
    // passes. Canonicalize before materializing so floor-backed and wall-backed Roofs use
    // the same deterministic connected footprint after Continue.
    this.#coalesceRestoredRoofZones();

    for (const structure of this.registry.structures.values()) {
      for (const roofZone of structure.grid.roofZones.values()) {
        const placement = this.#placementForRoofZone(structure, roofZone);
        if (!placement) {
          throw new Error(`Could not resolve semantic Roof placement ${roofZone.key}`);
        }
        this.#materializeComplexRoof(structure, roofZone, placement);
      }
    }
    this.#clearRoofPreview();
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
      const supports = this.#collectRoofSupports(structure);
      for (const seed of supports) {
        const compatible = supports.filter(support => (
          support.storey === seed.storey &&
          Math.abs(support.baseY - seed.baseY) <= LEVEL_TOLERANCE
        ));
        const component = connectedSemanticRoofCells(compatible, seed);
        if (!component.length) continue;
        const componentId = `${structure.id}:${seed.storey}:${seed.baseY.toFixed(4)}:${cellSignature(component)}`;
        if (seenComponents.has(componentId)) continue;
        seenComponents.add(componentId);

        const connectedRoofZones = this.#connectedRoofZones(
          structure,
          component,
          seed.storey,
          seed.baseY
        );
        const integratedCells = [
          ...component,
          ...connectedRoofZones.flatMap(zone => (zone.cellKeys ?? [])
            .map(parsePanelCellKey)
            .filter(Boolean)
            .map(cell => ({ x: cell.x, z: cell.z })))
        ];
        const plan = planSemanticRoofFootprint(integratedCells, {
          cellSize: PANEL_GRID.cellSize
        });
        const placement = this.#placementForCells(structure, integratedCells, seed.storey, plan);
        if (!placement) continue;
        placement.roofCellCount = component.length;
        placement.integratedRoofCellCount = plan.cellCount;
        placement.absorbedRoofZoneKeys = connectedRoofZones.map(zone => zone.key);

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

        placement.valid = this.#roofSupported(structure, integratedCells, seed.storey);
        placement.score = nearestScore;
        const betterScore = !best || placement.score < best.score - 0.05;
        const sameAimHigherSupport = Boolean(best) &&
          Math.abs(placement.score - best.score) <= 0.05 &&
          placement.baseY > best.baseY + LEVEL_TOLERANCE;
        if (betterScore || sameAimHigherSupport) best = placement;
      }
    }

    return best && best.score <= PANEL_GRID.cellSize * 1.7 ? best : null;
  }

  #collectRoofSupports(structure) {
    const supports = new Map();
    const floors = [...structure.grid.floors.values()];
    for (const floor of floors) {
      if (!this.#floorIsRoofable(structure, floor)) continue;
      supports.set(floor.key, {
        x: floor.x,
        z: floor.z,
        storey: floor.storey,
        baseY: floor.levelY + PANEL_GRID.storeyHeight,
        supportKind: 'floor'
      });
    }

    for (const support of collectPanelWallEnclosureCells(
      [...structure.grid.walls.values()],
      { levelTolerance: LEVEL_TOLERANCE }
    )) {
      const key = panelCellKey({ x: support.x, z: support.z, storey: support.storey });
      if (structure.grid.floors.has(panelCellKey({
        x: support.x,
        z: support.z,
        storey: support.storey + 1
      }))) continue;
      if (this.#roofCellOccupied(structure, key)) continue;
      if ([...structure.grid.stairs.values()].some(stair => (
        stair.storey === support.storey &&
        (stair.sourceCellKey === key || stair.targetCellKey === key)
      ))) continue;

      const existing = supports.get(key);
      if (existing && Math.abs(existing.baseY - support.levelY) <= LEVEL_TOLERANCE) continue;
      supports.set(key, {
        x: support.x,
        z: support.z,
        storey: support.storey,
        baseY: support.levelY,
        supportKind: 'wall-enclosure'
      });
    }

    return [...supports.values()].sort((left, right) => (
      left.storey - right.storey ||
      left.x - right.x ||
      left.z - right.z
    ));
  }

  #connectedRoofZones(structure, seedCells, storey, roofBaseY) {
    const accepted = new Set(seedCells.map(cellKey));
    const pending = [...structure.grid.roofZones.values()]
      .filter(zone => zone.storey === storey);
    const connected = [];

    let found = true;
    while (found) {
      found = false;
      for (let index = 0; index < pending.length; index += 1) {
        const zone = pending[index];
        const cells = (zone.cellKeys ?? []).map(parsePanelCellKey).filter(Boolean);
        const sameLevel = cells.length > 0 && cells.every(cell => {
          const baseY = this.#roofBaseYForCell(structure, cell, storey);
          return Number.isFinite(baseY) && Math.abs(baseY - roofBaseY) <= LEVEL_TOLERANCE;
        });
        if (!sameLevel) continue;

        const touches = cells.some(cell => (
          accepted.has(cellKey(cell)) ||
          directionEntries.some(direction => accepted.has(cellKey({
            x: cell.x + direction.dx,
            z: cell.z + direction.dz
          })))
        ));
        if (!touches) continue;

        connected.push(zone);
        for (const cell of cells) accepted.add(cellKey(cell));
        pending.splice(index, 1);
        found = true;
        break;
      }
    }
    return connected;
  }

  #coalesceRestoredRoofZones() {
    let changed = false;
    for (const structure of this.registry.structures.values()) {
      const processed = new Set();
      for (const seedZone of [...structure.grid.roofZones.values()]) {
        if (processed.has(seedZone.key) || !structure.grid.roofZones.has(seedZone.key)) continue;
        const seedCells = (seedZone.cellKeys ?? []).map(parsePanelCellKey).filter(Boolean);
        if (!seedCells.length) continue;
        const seedBaseY = this.#roofBaseYForCell(structure, seedCells[0], seedZone.storey);
        if (!Number.isFinite(seedBaseY)) continue;
        const cluster = this.#connectedRoofZones(
          structure,
          seedCells.map(cell => ({ x: cell.x, z: cell.z })),
          seedZone.storey,
          seedBaseY
        );
        for (const zone of cluster) processed.add(zone.key);
        if (cluster.length <= 1) continue;

        const cells = cluster.flatMap(zone => (zone.cellKeys ?? [])
          .map(parsePanelCellKey)
          .filter(Boolean)
          .map(cell => ({ x: cell.x, z: cell.z })));
        const plan = planSemanticRoofFootprint(cells, { cellSize: PANEL_GRID.cellSize });
        if (!plan) continue;
        const backups = cluster.map(zone => ({ ...zone, cellKeys: [...zone.cellKeys] }));
        for (const zone of cluster) structure.grid.removeRoofZone(zone.key);
        const merged = structure.grid.placeRoofZone({
          cells: plan.cells,
          storey: seedZone.storey,
          form: 'gable',
          ridgeAxis: plan.primaryAxis
        });
        if (!merged.ok) {
          this.#restoreRoofZones(structure, backups);
          continue;
        }
        changed = true;
      }
    }
    return changed;
  }

  #restoreRoofZones(structure, zones) {
    for (const zone of zones) {
      const cells = (zone.cellKeys ?? []).map(parsePanelCellKey).filter(Boolean);
      const result = structure.grid.placeRoofZone({
        cells: cells.map(cell => ({ x: cell.x, z: cell.z })),
        storey: zone.storey,
        form: zone.form ?? 'gable',
        ridgeAxis: zone.ridgeAxis ?? null
      });
      if (!result.ok) {
        throw new Error(`Could not restore semantic Roof zone ${zone.key}`);
      }
    }
  }

  #removeRoofEntryRuntime(structureId, stateKey) {
    const id = `panel:${structureId}:${stateKey}`;
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.active = false;
    entry.root?.parent?.remove(entry.root);
    this.entries.delete(id);
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

  #roofBaseYForCell(structure, cell, storey) {
    const key = panelCellKey({ x: cell.x, z: cell.z, storey });
    const floor = structure.grid.floors.get(key);
    if (floor) return floor.levelY + PANEL_GRID.storeyHeight;

    const support = collectPanelWallEnclosureCells(
      [...structure.grid.walls.values()],
      { levelTolerance: LEVEL_TOLERANCE }
    ).find(candidate => (
      candidate.storey === storey &&
      candidate.x === cell.x &&
      candidate.z === cell.z
    ));
    return support?.levelY ?? null;
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

    const baseLevels = cells
      .map(cell => this.#roofBaseYForCell(structure, cell, storey));
    if (
      baseLevels.some(level => !Number.isFinite(level)) ||
      Math.max(...baseLevels) - Math.min(...baseLevels) > LEVEL_TOLERANCE
    ) return null;

    const localCenter = structure.grid.cellCenter({
      x: resolvedPlan.centerX,
      z: resolvedPlan.centerZ
    });
    const worldCenter = this.registry.localToWorld(structure, localCenter.x, localCenter.z);
    const roofBaseY = Math.max(...baseLevels);
    const rise = semanticRoofFootprintRise(resolvedPlan);
    return {
      kind: 'roof',
      structureId: structure.id,
      newStructure: false,
      cells: resolvedPlan.cells.map(cell => ({ ...cell })),
      cellKeys: resolvedPlan.cells.map(cell => panelCellKey({ ...cell, storey })),
      roofCellCount: resolvedPlan.cellCount,
      integratedRoofCellCount: resolvedPlan.cellCount,
      storey,
      x: worldCenter.x,
      z: worldCenter.z,
      yaw: structure.yaw,
      baseY: roofBaseY,
      topY: roofBaseY + rise,
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
    root.userData.panelRoofCellCount = placement.integratedRoofCellCount ?? placement.roofCellCount;
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
      roofCellCount: roofZone.cellKeys.length,
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
