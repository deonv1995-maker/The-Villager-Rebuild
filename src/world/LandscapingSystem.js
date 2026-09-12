import * as THREE from 'three';
import {
  LANDSCAPING_DEFINITIONS,
  LANDSCAPING_GRID,
  LANDSCAPING_MODES,
  LANDSCAPING_SCHEMA_VERSION,
  landscapingCost,
  landscapingDefinition
} from '../data/LandscapingDefinitions.js';
import { PANEL_DIRECTIONS } from '../data/PanelConstructionDefinitions.js';
import { panelCellKey } from './PanelConstructionGrid.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const TARGET_DISTANCE = LANDSCAPING_GRID.cellSize * 0.78;
const AIM_GROUND_STEP = 0.22;
const EPSILON = 0.000001;

const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const finiteAim = aim => (
  Number.isFinite(aim?.origin?.x) &&
  Number.isFinite(aim?.origin?.y) &&
  Number.isFinite(aim?.origin?.z) &&
  Number.isFinite(aim?.direction?.x) &&
  Number.isFinite(aim?.direction?.y) &&
  Number.isFinite(aim?.direction?.z)
);

const directionEntries = Object.values(PANEL_DIRECTIONS);

const disposeObject = root => {
  root?.traverse?.(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose?.());
    else object.material?.dispose?.();
  });
  root?.removeFromParent?.();
};

export class LandscapingSystem {
  constructor({ group, terrain, collision, inventory, panelConstruction }) {
    if (!group || !terrain || !collision || !inventory || !panelConstruction) {
      throw new Error('LandscapingSystem requires group, terrain, collision, inventory and panelConstruction');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.inventory = inventory;
    this.panelConstruction = panelConstruction;
    this.entries = new Map();
    this.active = false;
    this.mode = 'fence';
    this.previewRoot = null;
    this.previewPlacement = null;
    this.previewValid = false;
    this.tempAimDirection = new THREE.Vector3();
  }

  isActive() {
    return this.active;
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) this.#clearPreview();
    return this.active;
  }

  setMode(mode) {
    if (!LANDSCAPING_MODES.includes(mode)) return false;
    this.mode = mode;
    this.#clearPreview();
    return true;
  }

  getState() {
    const definition = landscapingDefinition(this.mode);
    const cost = landscapingCost(this.mode);
    const materialQuantity = definition ? this.inventory.get(definition.resourceId) : 0;
    const required = cost[0]?.quantity ?? 0;
    const canAfford = materialQuantity >= required;
    return {
      mode: this.mode,
      label: definition?.label ?? 'Landscaping',
      cost,
      materialQuantity,
      canAfford,
      previewValid: Boolean(this.previewValid && canAfford),
      snappedToBuilding: this.previewPlacement?.gridKind === 'structure'
    };
  }

  update(playerPosition, facingDirection, aim = null) {
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      this.#clearPreview();
      return null;
    }
    const placement = this.#resolvePlacement(playerPosition, facingDirection, aim);
    const cost = landscapingCost(this.mode);
    const canAfford = cost.every(item => this.inventory.get(item.itemId) >= item.quantity);
    this.previewPlacement = placement;
    this.previewValid = Boolean(placement?.valid && canAfford);
    this.#renderPreview(placement, this.previewValid);
    return placement;
  }

  build(playerPosition, facingDirection, aim = null) {
    if (!this.active) return null;
    const placement = this.update(playerPosition, facingDirection, aim);
    if (!placement?.valid) return null;
    const cost = landscapingCost(this.mode);
    if (!cost.every(item => this.inventory.get(item.itemId) >= item.quantity)) return null;
    if (this.entries.has(placement.key)) return null;
    if (!this.inventory.consume(cost)) return null;

    const entry = this.#materialize({
      ...placement,
      mode: this.mode
    });
    this.update(playerPosition, facingDirection, aim);
    return {
      ...entry,
      label: landscapingDefinition(this.mode)?.label ?? 'Landscaping',
      cost: cost.map(item => ({ ...item })),
      snapped: placement.gridKind === 'structure'
    };
  }

  snapshot() {
    return {
      schemaVersion: LANDSCAPING_SCHEMA_VERSION,
      mode: this.mode,
      entries: [...this.entries.values()].map(entry => ({
        key: entry.key,
        mode: entry.mode,
        gridKind: entry.gridKind,
        structureId: entry.structureId ?? null,
        cellX: entry.cellX ?? null,
        cellZ: entry.cellZ ?? null,
        edgeKey: entry.edgeKey ?? null,
        x: entry.x,
        y: entry.y,
        z: entry.z,
        yaw: entry.yaw
      }))
    };
  }

  restore(snapshot) {
    this.#clearRuntimeEntries();
    this.mode = LANDSCAPING_MODES.includes(snapshot?.mode) ? snapshot.mode : 'fence';
    this.active = false;
    for (const saved of snapshot?.entries ?? []) {
      if (
        typeof saved?.key !== 'string' ||
        !LANDSCAPING_MODES.includes(saved?.mode) ||
        !Number.isFinite(saved?.x) ||
        !Number.isFinite(saved?.y) ||
        !Number.isFinite(saved?.z) ||
        !Number.isFinite(saved?.yaw)
      ) continue;
      this.#materialize({
        key: saved.key,
        mode: saved.mode,
        gridKind: saved.gridKind === 'structure' ? 'structure' : 'world',
        structureId: typeof saved.structureId === 'string' ? saved.structureId : null,
        cellX: Number.isInteger(saved.cellX) ? saved.cellX : null,
        cellZ: Number.isInteger(saved.cellZ) ? saved.cellZ : null,
        edgeKey: typeof saved.edgeKey === 'string' ? saved.edgeKey : null,
        x: saved.x,
        y: saved.y,
        z: saved.z,
        yaw: saved.yaw,
        valid: true
      });
    }
    this.#clearPreview();
    return true;
  }

  #resolvePlacement(playerPosition, facingDirection, aim) {
    const target = this.#placementTarget(playerPosition, facingDirection, aim);
    const registry = this.panelConstruction.registry;
    const structure = registry?.nearestStructure?.(
      target.x,
      target.z,
      LANDSCAPING_GRID.structureJoinRange
    );
    const placement = structure
      ? this.#structurePlacement(structure, target)
      : this.#worldPlacement(target);
    if (!placement) return null;
    const inReach = Math.hypot(placement.x - playerPosition.x, placement.z - playerPosition.z) <= LANDSCAPING_GRID.placementReach;
    const playable = this.terrain.isPlayable?.(placement.x, placement.z, 0.16) !== false;
    const occupied = this.entries.has(placement.key);
    return {
      ...placement,
      valid: inReach && playable && !occupied && placement.structuralConflict !== true
    };
  }

  #structurePlacement(structure, target) {
    const registry = this.panelConstruction.registry;
    const cell = registry.worldToCell(structure, target.x, target.z);
    if (!cell) return null;

    if (this.mode === 'cobble') {
      const center = registry.cellCenterWorld(structure, cell);
      const cellKey = panelCellKey({ x: cell.x, z: cell.z, storey: 0 });
      return {
        key: `landscape:${structure.id}:cobble:${cellKey}`,
        gridKind: 'structure',
        structureId: structure.id,
        cellX: cell.x,
        cellZ: cell.z,
        x: center.x,
        y: this.#baseHeightAt(center.x, center.z),
        z: center.z,
        yaw: structure.yaw,
        structuralConflict: false
      };
    }

    let best = null;
    for (const direction of directionEntries) {
      const edge = registry.edgePlacementWorld(structure, {
        x: cell.x,
        z: cell.z,
        storey: 0,
        direction: direction.id
      });
      if (!edge) continue;
      const distance = Math.hypot(edge.x - target.x, edge.z - target.z);
      if (!best || distance < best.distance) best = { edge, distance };
    }
    if (!best) return null;
    return {
      key: `landscape:${structure.id}:fence:${best.edge.key}`,
      gridKind: 'structure',
      structureId: structure.id,
      cellX: cell.x,
      cellZ: cell.z,
      edgeKey: best.edge.key,
      x: best.edge.x,
      y: this.#baseHeightAt(best.edge.x, best.edge.z),
      z: best.edge.z,
      yaw: best.edge.yaw,
      structuralConflict: structure.grid.walls.has(best.edge.key)
    };
  }

  #worldPlacement(target) {
    const cellSize = LANDSCAPING_GRID.cellSize;
    const centerX = Math.round(target.x / cellSize) * cellSize;
    const centerZ = Math.round(target.z / cellSize) * cellSize;
    const cellX = Math.round(centerX / cellSize);
    const cellZ = Math.round(centerZ / cellSize);

    if (this.mode === 'cobble') {
      return {
        key: `landscape:world:cobble:${cellX}:${cellZ}`,
        gridKind: 'world',
        structureId: null,
        cellX,
        cellZ,
        x: centerX,
        y: this.#baseHeightAt(centerX, centerZ),
        z: centerZ,
        yaw: 0,
        structuralConflict: false
      };
    }

    const half = cellSize * 0.5;
    const candidates = [
      { axis: 'x', x: centerX, z: centerZ - half, yaw: 0, edgeKey: `x:${cellX}:${cellZ}` },
      { axis: 'x', x: centerX, z: centerZ + half, yaw: Math.PI, edgeKey: `x:${cellX}:${cellZ + 1}` },
      { axis: 'z', x: centerX + half, z: centerZ, yaw: Math.PI * 0.5, edgeKey: `z:${cellX + 1}:${cellZ}` },
      { axis: 'z', x: centerX - half, z: centerZ, yaw: -Math.PI * 0.5, edgeKey: `z:${cellX}:${cellZ}` }
    ];
    candidates.sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
    const edge = candidates[0];
    return {
      key: `landscape:world:fence:${edge.edgeKey}`,
      gridKind: 'world',
      structureId: null,
      cellX,
      cellZ,
      edgeKey: edge.edgeKey,
      x: edge.x,
      y: this.#baseHeightAt(edge.x, edge.z),
      z: edge.z,
      yaw: edge.yaw,
      structuralConflict: false
    };
  }

  #placementTarget(playerPosition, facingDirection, aim) {
    if (finiteAim(aim)) {
      this.tempAimDirection.set(aim.direction.x, aim.direction.y, aim.direction.z);
      if (this.tempAimDirection.lengthSq() > EPSILON) {
        this.tempAimDirection.normalize();
        const maxDistance = LANDSCAPING_GRID.placementReach + 1.4;
        for (let distance = 0.55; distance <= maxDistance; distance += AIM_GROUND_STEP) {
          const x = aim.origin.x + this.tempAimDirection.x * distance;
          const y = aim.origin.y + this.tempAimDirection.y * distance;
          const z = aim.origin.z + this.tempAimDirection.z * distance;
          if (y <= this.#baseHeightAt(x, z) + 0.1) return { x, z };
        }
      }
    }
    const length = Math.hypot(facingDirection.x, facingDirection.z) || 1;
    return {
      x: playerPosition.x + facingDirection.x / length * TARGET_DISTANCE,
      z: playerPosition.z + facingDirection.z / length * TARGET_DISTANCE
    };
  }

  #baseHeightAt(x, z) {
    if (typeof this.terrain.baseHeightAt === 'function') return this.terrain.baseHeightAt(x, z);
    if (typeof this.terrain.heightAt === 'function') return this.terrain.heightAt(x, z);
    return 0;
  }

  #renderPreview(placement, valid) {
    if (!placement) {
      this.#clearPreview();
      return;
    }
    this.#clearPreview();
    const material = new THREE.MeshBasicMaterial({
      color: valid ? PREVIEW_VALID : PREVIEW_INVALID,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.previewRoot = this.mode === 'fence'
      ? this.#createFenceVisual(placement, material)
      : this.#createCobbleVisual(placement, material);
    this.previewRoot.name = `landscape-preview-${this.mode}`;
    this.group.add(this.previewRoot);
  }

  #materialize(placement) {
    const definition = LANDSCAPING_DEFINITIONS[placement.mode];
    const material = placement.mode === 'fence'
      ? new THREE.MeshStandardMaterial({ color: 0x6f4e32, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: 0x78766f, roughness: 1 });
    const root = placement.mode === 'fence'
      ? this.#createFenceVisual(placement, material)
      : this.#createCobbleVisual(placement, material);
    root.name = placement.key;
    root.userData.landscapingKey = placement.key;
    root.userData.landscapingMode = placement.mode;
    this.group.add(root);

    let collisionHandle = null;
    if (placement.mode === 'fence') {
      collisionHandle = this.collision.addBox({
        x: placement.x,
        z: placement.z,
        halfX: LANDSCAPING_GRID.cellSize * 0.48,
        halfZ: definition.postThickness * 0.48,
        yaw: placement.yaw,
        type: 'landscape-fence',
        label: placement.key,
        bottomY: placement.y - 0.03,
        topY: placement.y + definition.height
      });
    }

    const entry = {
      key: placement.key,
      mode: placement.mode,
      gridKind: placement.gridKind,
      structureId: placement.structureId ?? null,
      cellX: placement.cellX ?? null,
      cellZ: placement.cellZ ?? null,
      edgeKey: placement.edgeKey ?? null,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      yaw: placement.yaw,
      root,
      collisionHandle
    };
    this.entries.set(entry.key, entry);
    return entry;
  }

  #createFenceVisual(placement, material) {
    const definition = LANDSCAPING_DEFINITIONS.fence;
    const root = new THREE.Group();
    root.position.set(placement.x, placement.y, placement.z);
    root.rotation.y = placement.yaw;
    const usableLength = LANDSCAPING_GRID.cellSize * 0.92;
    const postGeometry = new THREE.BoxGeometry(definition.postThickness, definition.height, definition.postThickness);
    for (const x of [-usableLength * 0.5, usableLength * 0.5]) {
      const post = new THREE.Mesh(postGeometry.clone(), material.clone());
      post.position.set(x, definition.height * 0.5, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      root.add(post);
    }
    for (const y of [definition.height * 0.36, definition.height * 0.68]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(usableLength, definition.railThickness, definition.railThickness),
        material.clone()
      );
      rail.position.set(0, y, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      root.add(rail);
    }
    material.dispose();
    return root;
  }

  #createCobbleVisual(placement, material) {
    const definition = LANDSCAPING_DEFINITIONS.cobble;
    const root = new THREE.Group();
    root.position.set(placement.x, placement.y + definition.thickness * 0.5, placement.z);
    root.rotation.y = placement.yaw;
    const count = 4;
    const available = LANDSCAPING_GRID.cellSize - definition.inset * 2;
    const gap = 0.045;
    const stoneSize = (available - gap * (count - 1)) / count;
    const start = -available * 0.5 + stoneSize * 0.5;
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(stoneSize, definition.thickness, stoneSize),
          material.clone()
        );
        stone.position.set(
          start + column * (stoneSize + gap),
          0,
          start + row * (stoneSize + gap)
        );
        stone.receiveShadow = true;
        root.add(stone);
      }
    }
    material.dispose();
    return root;
  }

  #clearPreview() {
    if (!this.previewRoot) return;
    disposeObject(this.previewRoot);
    this.previewRoot = null;
    this.previewPlacement = null;
    this.previewValid = false;
  }

  #clearRuntimeEntries() {
    for (const entry of this.entries.values()) {
      if (entry.collisionHandle) this.collision.removeObstacle(entry.collisionHandle);
      disposeObject(entry.root);
    }
    this.entries.clear();
  }
}
