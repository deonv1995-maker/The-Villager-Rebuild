import * as THREE from 'three';
import {
  LANDSCAPING_DEFINITIONS,
  LANDSCAPING_GRID,
  LANDSCAPING_MODES,
  LANDSCAPING_SCHEMA_VERSION,
  landscapingCost,
  landscapingDefinition,
  landscapingStrokeUnits
} from '../data/LandscapingDefinitions.js';

const PREVIEW_VALID = 0x65d879;
const PREVIEW_INVALID = 0xd85d57;
const TARGET_DISTANCE = LANDSCAPING_GRID.cellSize * 0.78;
const AIM_GROUND_STEP = 0.22;
const EPSILON = 0.000001;
const DUPLICATE_TOLERANCE = LANDSCAPING_GRID.cellSize * 0.08;
const X_AXIS = new THREE.Vector3(1, 0, 0);

const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const finiteAim = aim => (
  Number.isFinite(aim?.origin?.x) &&
  Number.isFinite(aim?.origin?.y) &&
  Number.isFinite(aim?.origin?.z) &&
  Number.isFinite(aim?.direction?.x) &&
  Number.isFinite(aim?.direction?.y) &&
  Number.isFinite(aim?.direction?.z)
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance2d = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
const quantize = value => Math.round(value / LANDSCAPING_GRID.previewQuantization) * LANDSCAPING_GRID.previewQuantization;

function disposeObject(root) {
  root?.traverse?.(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose?.());
    else object.material?.dispose?.();
  });
  root?.removeFromParent?.();
}

function stringHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, index, channel = 0) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 7, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function strokeYaw(start, end, fallback = 0) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  if (Math.hypot(dx, dz) <= EPSILON) return fallback;
  return Math.atan2(-dz, dx);
}

export class LandscapingSystem {
  constructor({ group, terrain, collision, inventory }) {
    if (!group || !terrain || !collision || !inventory) {
      throw new Error('LandscapingSystem requires group, terrain, collision and inventory');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.inventory = inventory;
    this.entries = new Map();
    this.nextEntryId = 0;
    this.active = false;
    this.mode = 'fence';
    this.strokeStart = null;
    this.strokeSeed = 0;
    this.currentTarget = null;
    this.currentTargetValid = false;
    this.previewRoot = null;
    this.previewStroke = null;
    this.previewValid = false;
    this.previewSignature = '';
    this.tempAimDirection = new THREE.Vector3();
  }

  isActive() {
    return this.active;
  }

  hasPinnedStart() {
    return Boolean(this.strokeStart);
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) this.#resetInteraction();
    return this.active;
  }

  setMode(mode) {
    if (!LANDSCAPING_MODES.includes(mode)) return false;
    this.mode = mode;
    this.#resetInteraction();
    return true;
  }

  getState() {
    const definition = landscapingDefinition(this.mode);
    const length = this.strokeStart ? (this.previewStroke?.length ?? 0) : 0;
    const cost = landscapingCost(this.mode, length);
    const materialQuantity = definition ? this.inventory.get(definition.resourceId) : 0;
    const canAfford = cost.every(item => this.inventory.get(item.itemId) >= item.quantity);
    const strokePinned = Boolean(this.strokeStart);
    return {
      mode: this.mode,
      label: definition?.label ?? 'Landscaping',
      cost,
      materialQuantity,
      canAfford,
      previewValid: strokePinned
        ? Boolean(this.previewValid && canAfford)
        : Boolean(this.currentTargetValid && canAfford),
      canPin: Boolean(!strokePinned && this.currentTargetValid && canAfford),
      strokePinned,
      interactionPhase: strokePinned ? 'drag' : 'pin',
      strokeLength: length,
      unitCount: landscapingStrokeUnits(this.mode, length),
      pathWidth: this.mode === 'cobble' ? definition?.width ?? LANDSCAPING_GRID.pathWidth : null,
      maxStrokeLength: definition?.maxStrokeLength ?? LANDSCAPING_GRID.maxStrokeLength,
      snappedToBuilding: false
    };
  }

  update(playerPosition, facingDirection, aim = null) {
    if (!this.active || !finitePoint(playerPosition) || !finitePoint(facingDirection)) {
      this.#clearPreview();
      this.currentTarget = null;
      this.currentTargetValid = false;
      return null;
    }

    const rawTarget = this.#placementTarget(playerPosition, facingDirection, aim);
    const target = this.#clampStrokeTarget(rawTarget);
    this.currentTarget = target;
    this.currentTargetValid = this.#targetValid(target, playerPosition);

    if (!this.strokeStart) {
      this.previewStroke = null;
      this.previewValid = false;
      this.#renderPinPreview(target, this.currentTargetValid);
      return target;
    }

    const stroke = this.#createStroke(this.strokeStart, target, this.strokeSeed);
    const cost = landscapingCost(this.mode, stroke.length);
    const canAfford = cost.every(item => this.inventory.get(item.itemId) >= item.quantity);
    stroke.valid = this.#strokeValid(stroke, playerPosition) && canAfford;
    this.previewStroke = stroke;
    this.previewValid = stroke.valid;
    this.#renderStrokePreview(stroke, stroke.valid);
    return stroke;
  }

  pin(playerPosition, facingDirection, aim = null) {
    if (!this.active || this.strokeStart) return false;
    this.update(playerPosition, facingDirection, aim);
    if (!this.currentTargetValid) return false;
    const minimumCost = landscapingCost(this.mode, 0);
    if (!minimumCost.every(item => this.inventory.get(item.itemId) >= item.quantity)) return false;

    this.strokeStart = { ...this.currentTarget };
    this.strokeSeed = stringHash([
      this.mode,
      quantize(this.strokeStart.x).toFixed(3),
      quantize(this.strokeStart.z).toFixed(3),
      this.nextEntryId
    ].join(':'));
    this.update(playerPosition, facingDirection, aim);
    return true;
  }

  cancelStroke() {
    if (!this.strokeStart) return false;
    this.strokeStart = null;
    this.strokeSeed = 0;
    this.previewStroke = null;
    this.previewValid = false;
    this.#clearPreview();
    return true;
  }

  build(playerPosition, facingDirection, aim = null) {
    if (!this.active || !this.strokeStart) return null;
    const stroke = this.update(playerPosition, facingDirection, aim);
    if (!stroke?.valid) return null;

    const cost = landscapingCost(this.mode, stroke.length);
    if (!cost.every(item => this.inventory.get(item.itemId) >= item.quantity)) return null;
    if (!this.inventory.consume(cost)) return null;

    const placement = {
      ...stroke,
      key: `landscape:stroke:${this.nextEntryId}`,
      mode: this.mode,
      entryKind: 'stroke'
    };
    this.nextEntryId += 1;
    const entry = this.#materialize(placement);
    this.strokeStart = null;
    this.strokeSeed = 0;
    this.previewStroke = null;
    this.previewValid = false;
    this.update(playerPosition, facingDirection, aim);
    return {
      ...entry,
      label: landscapingDefinition(this.mode)?.label ?? 'Landscaping',
      cost: cost.map(item => ({ ...item })),
      unitCount: landscapingStrokeUnits(this.mode, stroke.length),
      snapped: false
    };
  }

  snapshot() {
    return {
      schemaVersion: LANDSCAPING_SCHEMA_VERSION,
      mode: this.mode,
      nextEntryId: this.nextEntryId,
      entries: [...this.entries.values()].map(entry => ({
        key: entry.key,
        mode: entry.mode,
        entryKind: 'stroke',
        startX: entry.start.x,
        startZ: entry.start.z,
        endX: entry.end.x,
        endZ: entry.end.z,
        seed: entry.seed,
        width: entry.width ?? null,
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
    this.nextEntryId = Number.isInteger(snapshot?.nextEntryId) && snapshot.nextEntryId >= 0
      ? snapshot.nextEntryId
      : 0;
    this.active = false;

    for (const saved of snapshot?.entries ?? []) {
      if (typeof saved?.key !== 'string' || !LANDSCAPING_MODES.includes(saved?.mode)) continue;
      const restored = this.#restorePlacement(saved);
      if (!restored) continue;
      this.#materialize(restored);
      const idMatch = /^landscape:stroke:(\d+)$/.exec(saved.key);
      if (idMatch) this.nextEntryId = Math.max(this.nextEntryId, Number(idMatch[1]) + 1);
    }

    this.#resetInteraction();
    return true;
  }

  #restorePlacement(saved) {
    if (
      Number.isFinite(saved.startX) &&
      Number.isFinite(saved.startZ) &&
      Number.isFinite(saved.endX) &&
      Number.isFinite(saved.endZ)
    ) {
      return this.#createStroke(
        { x: saved.startX, z: saved.startZ },
        { x: saved.endX, z: saved.endZ },
        Number.isInteger(saved.seed) ? saved.seed >>> 0 : stringHash(saved.key),
        {
          key: saved.key,
          mode: saved.mode,
          entryKind: 'stroke',
          width: Number.isFinite(saved.width) && saved.width > 0 ? saved.width : undefined
        }
      );
    }

    // Schema-1 compatibility: convert old one-cell/one-edge entries into a single
    // stroke. Legacy cobble keeps its former full-cell width so existing saves do not
    // visually lose half their paving on Continue.
    if (
      !Number.isFinite(saved.x) ||
      !Number.isFinite(saved.z) ||
      !Number.isFinite(saved.yaw)
    ) return null;
    const halfLength = LANDSCAPING_GRID.cellSize * 0.5;
    const dx = Math.cos(saved.yaw) * halfLength;
    const dz = -Math.sin(saved.yaw) * halfLength;
    return this.#createStroke(
      { x: saved.x - dx, z: saved.z - dz },
      { x: saved.x + dx, z: saved.z + dz },
      stringHash(saved.key),
      {
        key: saved.key,
        mode: saved.mode,
        entryKind: 'stroke',
        width: saved.mode === 'cobble' ? LANDSCAPING_GRID.cellSize : undefined
      }
    );
  }

  #createStroke(start, end, seed, overrides = {}) {
    const mode = overrides.mode ?? this.mode;
    const definition = landscapingDefinition(mode);
    const length = distance2d(start, end);
    const midpoint = {
      x: (start.x + end.x) * 0.5,
      z: (start.z + end.z) * 0.5
    };
    return {
      key: overrides.key ?? null,
      mode,
      entryKind: overrides.entryKind ?? 'stroke',
      start: { x: start.x, z: start.z },
      end: { x: end.x, z: end.z },
      length,
      seed: seed >>> 0,
      width: overrides.width ?? (mode === 'cobble' ? definition?.width : null),
      x: midpoint.x,
      y: this.#baseHeightAt(midpoint.x, midpoint.z),
      z: midpoint.z,
      yaw: strokeYaw(start, end),
      valid: false
    };
  }

  #clampStrokeTarget(target) {
    if (!this.strokeStart) return target;
    const definition = landscapingDefinition(this.mode);
    const maxLength = definition?.maxStrokeLength ?? LANDSCAPING_GRID.maxStrokeLength;
    const dx = target.x - this.strokeStart.x;
    const dz = target.z - this.strokeStart.z;
    const length = Math.hypot(dx, dz);
    if (length <= maxLength || length <= EPSILON) return target;
    const scale = maxLength / length;
    return {
      x: this.strokeStart.x + dx * scale,
      z: this.strokeStart.z + dz * scale
    };
  }

  #targetValid(target, playerPosition) {
    if (!finitePoint(target)) return false;
    const inReach = distance2d(target, playerPosition) <= LANDSCAPING_GRID.placementReach;
    return inReach && this.terrain.isPlayable?.(target.x, target.z, 0.16) !== false;
  }

  #strokeValid(stroke, playerPosition) {
    const definition = landscapingDefinition(stroke.mode);
    if (!definition || stroke.length < definition.minStrokeLength) return false;
    if (stroke.length > definition.maxStrokeLength + EPSILON) return false;
    if (!this.#targetValid(stroke.end, playerPosition)) return false;
    if (!this.#strokePlayable(stroke)) return false;
    if (stroke.mode === 'fence' && this.#duplicatesFence(stroke)) return false;
    return true;
  }

  #strokePlayable(stroke) {
    const step = Math.max(0.3, Math.min(LANDSCAPING_GRID.pathWidth * 0.5, LANDSCAPING_GRID.cellSize * 0.5));
    const samples = Math.max(1, Math.ceil(stroke.length / step));
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const x = THREE.MathUtils.lerp(stroke.start.x, stroke.end.x, t);
      const z = THREE.MathUtils.lerp(stroke.start.z, stroke.end.z, t);
      if (this.terrain.isPlayable?.(x, z, 0.16) === false) return false;
    }
    return true;
  }

  #duplicatesFence(stroke) {
    for (const entry of this.entries.values()) {
      if (entry.mode !== 'fence') continue;
      const direct = distance2d(stroke.start, entry.start) <= DUPLICATE_TOLERANCE &&
        distance2d(stroke.end, entry.end) <= DUPLICATE_TOLERANCE;
      const reverse = distance2d(stroke.start, entry.end) <= DUPLICATE_TOLERANCE &&
        distance2d(stroke.end, entry.start) <= DUPLICATE_TOLERANCE;
      if (direct || reverse) return true;
    }
    return false;
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

  #renderPinPreview(target, valid) {
    if (!target) {
      this.#clearPreview();
      return;
    }
    const signature = [
      'pin',
      this.mode,
      quantize(target.x).toFixed(3),
      quantize(target.z).toFixed(3),
      valid ? 'valid' : 'invalid'
    ].join(':');
    if (this.previewRoot && signature === this.previewSignature) return;

    this.#disposePreviewRoot();
    const material = this.#previewMaterial(valid);
    this.previewRoot = this.#createPinVisual(target, material);
    this.previewRoot.name = `landscape-preview-${this.mode}-pin`;
    this.group.add(this.previewRoot);
    this.previewSignature = signature;
  }

  #renderStrokePreview(stroke, valid) {
    if (!stroke) {
      this.#clearPreview();
      return;
    }
    const signature = [
      'stroke',
      stroke.mode,
      quantize(stroke.start.x).toFixed(3),
      quantize(stroke.start.z).toFixed(3),
      quantize(stroke.end.x).toFixed(3),
      quantize(stroke.end.z).toFixed(3),
      valid ? 'valid' : 'invalid'
    ].join(':');
    if (this.previewRoot && signature === this.previewSignature) return;

    this.#disposePreviewRoot();
    const material = this.#previewMaterial(valid);
    this.previewRoot = stroke.length < EPSILON
      ? this.#createPinVisual(stroke.start, material)
      : stroke.mode === 'fence'
        ? this.#createFenceVisual(stroke, material)
        : this.#createCobbleVisual(stroke, material);
    this.previewRoot.name = `landscape-preview-${stroke.mode}-stroke`;
    this.group.add(this.previewRoot);
    this.previewSignature = signature;
  }

  #previewMaterial(valid) {
    return new THREE.MeshBasicMaterial({
      color: valid ? PREVIEW_VALID : PREVIEW_INVALID,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
  }

  #createPinVisual(target, sourceMaterial) {
    const definition = landscapingDefinition(this.mode);
    const root = new THREE.Group();
    const y = this.#baseHeightAt(target.x, target.z);
    if (this.mode === 'fence') {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(definition.postThickness, definition.height, definition.postThickness),
        sourceMaterial.clone()
      );
      post.position.set(target.x, y + definition.height * 0.5, target.z);
      root.add(post);
    } else {
      const radius = (definition.width ?? LANDSCAPING_GRID.pathWidth) * 0.12;
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.08, definition.thickness, 7),
        sourceMaterial.clone()
      );
      marker.position.set(target.x, y + definition.thickness * 0.5, target.z);
      root.add(marker);
    }
    sourceMaterial.dispose();
    return root;
  }

  #materialize(stroke) {
    const definition = LANDSCAPING_DEFINITIONS[stroke.mode];
    const material = stroke.mode === 'fence'
      ? new THREE.MeshStandardMaterial({ color: 0x6f4e32, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: 0x78766f, roughness: 1 });
    const root = stroke.mode === 'fence'
      ? this.#createFenceVisual(stroke, material)
      : this.#createCobbleVisual(stroke, material);
    root.name = stroke.key;
    root.userData.landscapingKey = stroke.key;
    root.userData.landscapingMode = stroke.mode;
    root.userData.pathWidth = stroke.mode === 'cobble' ? stroke.width : null;
    this.group.add(root);

    const collisionHandles = stroke.mode === 'fence'
      ? this.#createFenceCollision(stroke, definition)
      : [];

    const entry = {
      key: stroke.key,
      mode: stroke.mode,
      entryKind: 'stroke',
      start: { ...stroke.start },
      end: { ...stroke.end },
      length: stroke.length,
      seed: stroke.seed >>> 0,
      width: stroke.width ?? null,
      x: stroke.x,
      y: stroke.y,
      z: stroke.z,
      yaw: stroke.yaw,
      root,
      collisionHandles
    };
    this.entries.set(entry.key, entry);
    return entry;
  }

  #createFenceVisual(stroke, sourceMaterial) {
    const definition = LANDSCAPING_DEFINITIONS.fence;
    const root = new THREE.Group();
    const spans = Math.max(1, Math.ceil(stroke.length / definition.postSpacing));
    const points = [];
    for (let index = 0; index <= spans; index += 1) {
      const t = index / spans;
      const x = THREE.MathUtils.lerp(stroke.start.x, stroke.end.x, t);
      const z = THREE.MathUtils.lerp(stroke.start.z, stroke.end.z, t);
      points.push({ x, y: this.#baseHeightAt(x, z), z });
    }

    for (const point of points) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(definition.postThickness, definition.height, definition.postThickness),
        sourceMaterial.clone()
      );
      post.position.set(point.x, point.y + definition.height * 0.5, point.z);
      post.castShadow = true;
      post.receiveShadow = true;
      root.add(post);
    }

    const railLevels = [definition.height * 0.36, definition.height * 0.68];
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      for (const railHeight of railLevels) {
        const fromPoint = new THREE.Vector3(from.x, from.y + railHeight, from.z);
        const toPoint = new THREE.Vector3(to.x, to.y + railHeight, to.z);
        const vector = toPoint.clone().sub(fromPoint);
        const railLength = vector.length();
        if (railLength <= EPSILON) continue;
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(railLength, definition.railThickness, definition.railThickness),
          sourceMaterial.clone()
        );
        rail.position.copy(fromPoint).add(toPoint).multiplyScalar(0.5);
        rail.quaternion.setFromUnitVectors(X_AXIS, vector.normalize());
        rail.castShadow = true;
        rail.receiveShadow = true;
        root.add(rail);
      }
    }
    sourceMaterial.dispose();
    return root;
  }

  #createFenceCollision(stroke, definition) {
    const handles = [];
    const spans = Math.max(1, Math.ceil(stroke.length / definition.postSpacing));
    for (let index = 0; index < spans; index += 1) {
      const startT = index / spans;
      const endT = (index + 1) / spans;
      const start = {
        x: THREE.MathUtils.lerp(stroke.start.x, stroke.end.x, startT),
        z: THREE.MathUtils.lerp(stroke.start.z, stroke.end.z, startT)
      };
      const end = {
        x: THREE.MathUtils.lerp(stroke.start.x, stroke.end.x, endT),
        z: THREE.MathUtils.lerp(stroke.start.z, stroke.end.z, endT)
      };
      const length = distance2d(start, end);
      if (length <= EPSILON) continue;
      const startY = this.#baseHeightAt(start.x, start.z);
      const endY = this.#baseHeightAt(end.x, end.z);
      handles.push(this.collision.addBox({
        x: (start.x + end.x) * 0.5,
        z: (start.z + end.z) * 0.5,
        halfX: length * 0.5,
        halfZ: definition.postThickness * 0.48,
        yaw: strokeYaw(start, end),
        type: 'landscape-fence',
        label: `${stroke.key}:${index}`,
        bottomY: Math.min(startY, endY) - 0.03,
        topY: Math.max(startY, endY) + definition.height
      }));
    }
    return handles;
  }

  #createCobbleVisual(stroke, sourceMaterial) {
    const definition = LANDSCAPING_DEFINITIONS.cobble;
    const root = new THREE.Group();
    const width = stroke.width ?? definition.width;
    root.userData.pathWidth = width;

    const length = Math.max(stroke.length, definition.rowSpacing);
    const forwardX = stroke.length > EPSILON ? (stroke.end.x - stroke.start.x) / stroke.length : 1;
    const forwardZ = stroke.length > EPSILON ? (stroke.end.z - stroke.start.z) / stroke.length : 0;
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const rowCount = Math.max(1, Math.ceil(length / definition.rowSpacing));
    const rowLength = stroke.length > EPSILON ? stroke.length / rowCount : definition.rowSpacing;

    let stoneIndex = 0;
    for (let row = 0; row < rowCount; row += 1) {
      const t = rowCount === 1 ? 0.5 : (row + 0.5) / rowCount;
      const centerX = THREE.MathUtils.lerp(stroke.start.x, stroke.end.x, t);
      const centerZ = THREE.MathUtils.lerp(stroke.start.z, stroke.end.z, t);
      const columns = row % 2 === 0 ? 3 : 2;
      const slotWidth = width / columns;
      for (let column = 0; column < columns; column += 1) {
        const baseLateral = (column - (columns - 1) * 0.5) * slotWidth;
        const lateralJitter = (seededUnit(stroke.seed, stoneIndex, 1) - 0.5) * slotWidth * 0.22;
        const longitudinalJitter = (seededUnit(stroke.seed, stoneIndex, 2) - 0.5) * rowLength * 0.28;
        const stoneX = centerX + rightX * (baseLateral + lateralJitter) + forwardX * longitudinalJitter;
        const stoneZ = centerZ + rightZ * (baseLateral + lateralJitter) + forwardZ * longitudinalJitter;
        const radius = slotWidth * (0.38 + seededUnit(stroke.seed, stoneIndex, 3) * 0.08);
        const longScale = clamp(
          rowLength / Math.max(radius * 2, EPSILON) * (0.82 + seededUnit(stroke.seed, stoneIndex, 4) * 0.2),
          0.72,
          1.5
        );
        const crossScale = 0.82 + seededUnit(stroke.seed, stoneIndex, 5) * 0.2;
        const thicknessScale = 0.82 + seededUnit(stroke.seed, stoneIndex, 6) * 0.34;
        const stone = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius * (0.94 + seededUnit(stroke.seed, stoneIndex, 7) * 0.1), definition.thickness * thicknessScale, 6),
          sourceMaterial.clone()
        );
        stone.scale.set(longScale, 1, crossScale);
        stone.position.set(
          stoneX,
          this.#baseHeightAt(stoneX, stoneZ) + definition.thickness * thicknessScale * 0.5 + 0.008,
          stoneZ
        );
        stone.rotation.y = stroke.yaw + (seededUnit(stroke.seed, stoneIndex, 8) - 0.5) * 0.34;
        stone.receiveShadow = true;
        root.add(stone);
        stoneIndex += 1;
      }
    }

    sourceMaterial.dispose();
    return root;
  }

  #disposePreviewRoot() {
    if (!this.previewRoot) return;
    disposeObject(this.previewRoot);
    this.previewRoot = null;
  }

  #clearPreview() {
    this.#disposePreviewRoot();
    this.previewSignature = '';
  }

  #resetInteraction() {
    this.strokeStart = null;
    this.strokeSeed = 0;
    this.currentTarget = null;
    this.currentTargetValid = false;
    this.previewStroke = null;
    this.previewValid = false;
    this.#clearPreview();
  }

  #clearRuntimeEntries() {
    for (const entry of this.entries.values()) {
      for (const handle of entry.collisionHandles ?? []) {
        if (handle) this.collision.removeObstacle(handle);
      }
      disposeObject(entry.root);
    }
    this.entries.clear();
  }
}
