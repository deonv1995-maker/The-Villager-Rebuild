import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import {
  createPhysicalLogVisual,
  createSplitHalfLogVisual
} from './PhysicalLogVisual.js';

export const WALL_PANEL_VARIANTS = Object.freeze(['solid', 'door', 'window']);
export const WALL_CUSTOMIZE_RANGE = 2.65;

const WALL_STOREY_TOLERANCE = 0.58;
const WALL_SIDE_SEARCH_DISTANCE = 2.25;
const TARGET_STOREY_TOLERANCE = 1.4;

const {
  wallThickness: WALL_THICKNESS,
  wallSectionStep: WALL_SECTION_STEP,
  wallSectionTopOffset: WALL_SECTION_TOP_OFFSET,
  wallCompletionTopTolerance: WALL_COMPLETION_TOP_TOLERANCE,
  wallTopTuck: WALL_TOP_TUCK,
  wallRowRadius: WALL_ROW_RADIUS,
  doorClearWidth: DOOR_WIDTH,
  doorClearHeight: DOOR_HEIGHT,
  openingJambOutset: OPENING_JAMB_OUTSET,
  windowClearWidth: WINDOW_WIDTH,
  windowSillHeight: WINDOW_BOTTOM,
  windowHeadHeight: WINDOW_TOP
} = CONSTRUCTION_DIMENSIONS;

const snapYaw = yaw => {
  const snapped = Math.round(yaw / PHYSICAL_LOG.yawStep) * PHYSICAL_LOG.yawStep;
  return Object.is(snapped, -0) ? 0 : snapped;
};

export function axisYawDelta(a, b) {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
}

export function canonicalWallAxisYaw(yaw) {
  let value = yaw % Math.PI;
  if (value < 0) value += Math.PI;
  if (Math.abs(value - Math.PI) < 0.000001) value = 0;
  return value;
}

const basis = yaw => ({
  xX: Math.cos(yaw),
  xZ: -Math.sin(yaw),
  zX: Math.sin(yaw),
  zZ: Math.cos(yaw)
});

export function wallPanelTopY(pairTopY) {
  if (!Number.isFinite(pairTopY)) return pairTopY;
  return pairTopY - PHYSICAL_LOG.radius + WALL_TOP_TUCK;
}

export function resolveWallInwardYaw({ x, z, yaw, baseY, floors }) {
  const wallBasis = basis(yaw ?? 0);
  let positive = 0;
  let negative = 0;

  for (const floor of floors ?? []) {
    if (
      Number.isFinite(baseY) &&
      Number.isFinite(floor.topY) &&
      Math.abs(floor.topY - baseY) > WALL_STOREY_TOLERANCE
    ) continue;

    const dx = floor.x - x;
    const dz = floor.z - z;
    const localX = dx * wallBasis.xX + dz * wallBasis.xZ;
    const localZ = dx * wallBasis.zX + dz * wallBasis.zZ;
    if (Math.abs(localX) > PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorWidth * 0.72) continue;
    if (Math.abs(localZ) > WALL_SIDE_SEARCH_DISTANCE || Math.abs(localZ) < 0.06) continue;

    const weight = 1 / (0.18 + Math.abs(localZ));
    if (localZ > 0) positive += weight;
    else negative += weight;
  }

  if (positive === 0 && negative === 0) return yaw;
  return positive >= negative ? yaw : snapYaw((yaw ?? 0) + Math.PI);
}

export function wallPanelIsComplete(entries, pairTopY) {
  if (!entries?.length || !Number.isFinite(pairTopY)) return false;
  const maxTopY = Math.max(...entries.map(entry => entry.topY));
  const targetTopY = wallPanelTopY(pairTopY);
  return maxTopY + WALL_SECTION_STEP > targetTopY + WALL_COMPLETION_TOP_TOLERANCE;
}

export function doorSideColliderSpecs({ x, z, yaw, bottomY, topY }) {
  const sideLength = (PHYSICAL_LOG.length - DOOR_WIDTH) * 0.5;
  const offset = DOOR_WIDTH * 0.5 + sideLength * 0.5;
  const wallBasis = basis(yaw);
  return [-1, 1].map(sign => ({
    x: x + wallBasis.xX * offset * sign,
    z: z + wallBasis.xZ * offset * sign,
    halfX: sideLength * 0.5,
    halfZ: WALL_THICKNESS,
    yaw,
    bottomY,
    topY
  }));
}

export function windowColliderSpecs({ x, z, yaw, baseY, topY }) {
  const openingBottomY = Math.min(topY, baseY + WINDOW_BOTTOM);
  const openingTopY = Math.min(topY, baseY + WINDOW_TOP);
  const sideLength = (PHYSICAL_LOG.length - WINDOW_WIDTH) * 0.5;
  const sideOffset = WINDOW_WIDTH * 0.5 + sideLength * 0.5;
  const wallBasis = basis(yaw);
  const specs = [];

  if (openingBottomY > baseY - 0.01) {
    specs.push({
      x,
      z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: WALL_THICKNESS,
      yaw,
      bottomY: baseY - 0.02,
      topY: openingBottomY
    });
  }

  if (openingTopY > openingBottomY + 0.01 && sideLength > 0.08) {
    for (const sign of [-1, 1]) {
      specs.push({
        x: x + wallBasis.xX * sideOffset * sign,
        z: z + wallBasis.xZ * sideOffset * sign,
        halfX: sideLength * 0.5,
        halfZ: WALL_THICKNESS,
        yaw,
        bottomY: openingBottomY,
        topY: openingTopY
      });
    }
  }

  if (topY > openingTopY + 0.01) {
    specs.push({
      x,
      z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: WALL_THICKNESS,
      yaw,
      bottomY: openingTopY,
      topY
    });
  }

  return specs;
}

export class WallPanelCustomizationSystem {
  constructor({ group, collision, physicalLogs }) {
    if (!group || !collision || !physicalLogs) {
      throw new Error('WallPanelCustomizationSystem requires group, collision and physicalLogs');
    }
    this.group = group;
    this.collision = collision;
    this.physicalLogs = physicalLogs;
    this.bays = [];
    this.baysByKey = new Map();
    this.customizations = new Map();
    this.lastStructureRevision = -1;
  }

  sync() {
    const revision = this.physicalLogs.structureRevision ?? this.physicalLogs.builtLogs.length;
    if (revision === this.lastStructureRevision) return this.bays;

    const nextBays = this.#collectBays();
    const nextByKey = new Map(nextBays.map(bay => [bay.key, bay]));

    for (const [key, state] of this.customizations) {
      const bay = nextByKey.get(key);
      const signature = bay ? this.#baySignature(bay) : null;
      if (!bay?.complete || signature !== state.signature) {
        this.#removeCustomizationState(state);
        this.customizations.delete(key);
        if (bay) this.#restoreOriginalEntries(bay.entries);
      }
    }

    for (const bay of nextBays) {
      this.#orientEntriesInward(bay);
      this.#fitCompleteBayToFrame(bay);
      const state = this.customizations.get(bay.key);
      if (!state) continue;
      state.root.position.set(bay.x, bay.baseY, bay.z);
      state.root.rotation.y = bay.yaw;
      this.#hideOriginalEntries(bay.entries);
    }

    this.bays = nextBays;
    this.baysByKey = nextByKey;
    this.lastStructureRevision = revision;
    return this.bays;
  }

  resolveInwardYawAt(placement) {
    if (!placement) return placement?.yaw ?? 0;
    return resolveWallInwardYaw({
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      baseY: placement.baseY ?? placement.ground,
      floors: this.#activeEntries('floor')
    });
  }

  getTarget(playerPosition) {
    if (!playerPosition) return null;
    this.sync();
    let best = null;
    let bestDistanceSq = WALL_CUSTOMIZE_RANGE * WALL_CUSTOMIZE_RANGE;

    for (const bay of this.bays) {
      if (!bay.complete) continue;
      if (
        Number.isFinite(playerPosition.y) &&
        Math.abs(playerPosition.y - bay.baseY) > TARGET_STOREY_TOLERANCE
      ) continue;
      const dx = bay.x - playerPosition.x;
      const dz = bay.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = bay;
    }

    if (!best) return null;
    const state = this.customizations.get(best.key);
    return {
      id: best.key,
      type: 'wall-panel',
      label: 'Wall panel',
      variant: state?.variant ?? 'solid',
      position: {
        x: best.x,
        y: best.baseY + (best.topY - best.baseY) * 0.5,
        z: best.z
      },
      options: [...WALL_PANEL_VARIANTS]
    };
  }

  customize(panelKey, variant) {
    if (!WALL_PANEL_VARIANTS.includes(variant)) return null;
    this.sync();
    const bay = this.baysByKey.get(panelKey);
    if (!bay?.complete) return null;

    const existing = this.customizations.get(panelKey);
    if (existing?.variant === variant) {
      return { id: panelKey, variant, label: this.#variantLabel(variant) };
    }

    if (existing) {
      this.#removeCustomizationState(existing);
      this.customizations.delete(panelKey);
    }

    if (variant === 'solid') {
      this.#restoreOriginalEntries(bay.entries);
      return { id: panelKey, variant, label: 'Solid wall' };
    }

    this.#hideOriginalEntries(bay.entries);
    const root = this.#createVariantRoot(bay, variant);
    this.group.add(root);
    const collisionHandles = this.#createVariantCollisions(bay, variant);
    const state = {
      key: panelKey,
      variant,
      root,
      collisionHandles,
      signature: this.#baySignature(bay)
    };
    this.customizations.set(panelKey, state);
    return { id: panelKey, variant, label: this.#variantLabel(variant) };
  }

  #collectBays() {
    const walls = this.#activeEntries('wall');
    const groups = new Map();

    for (const wall of walls) {
      const axis = canonicalWallAxisYaw(wall.yaw ?? 0);
      const key = `${Math.round(wall.x * 20)}:${Math.round(wall.z * 20)}:${Math.round(axis * 1000)}`;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(wall);
    }

    const floors = this.#activeEntries('floor');
    const frames = this.#activeEntries('frame');
    const bays = [];

    for (const entries of groups.values()) {
      const pair = this.#findFramePair(entries, frames);
      if (!pair) continue;
      const yaw = resolveWallInwardYaw({
        x: pair.x,
        z: pair.z,
        yaw: pair.yaw,
        baseY: pair.baseY,
        floors
      });
      const sortedEntries = [...entries].sort((left, right) => left.centerY - right.centerY);
      const entryTopY = Math.max(...sortedEntries.map(entry => entry.topY));
      const complete = wallPanelIsComplete(sortedEntries, pair.topY);
      bays.push({
        key: `wall:${pair.anchorIds.join('-')}`,
        x: pair.x,
        z: pair.z,
        yaw,
        baseY: pair.baseY,
        topY: complete ? wallPanelTopY(pair.topY) : entryTopY,
        pairTopY: pair.topY,
        anchorIds: pair.anchorIds,
        entries: sortedEntries,
        complete
      });
    }

    return bays;
  }

  #findFramePair(entries, frames) {
    if (!entries.length) return null;
    const wall = entries[0];
    const wallAxis = canonicalWallAxisYaw(wall.yaw ?? 0);
    const groupBaseY = Math.min(...entries.map(entry => entry.baseY));
    let best = null;
    let bestDistance = 0.46;

    for (let aIndex = 0; aIndex < frames.length; aIndex += 1) {
      const a = frames[aIndex];
      for (let bIndex = aIndex + 1; bIndex < frames.length; bIndex += 1) {
        const b = frames[bIndex];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const spacing = Math.hypot(dx, dz);
        if (Math.abs(spacing - PHYSICAL_LOG.length) > PHYSICAL_LOG.frameSpacingTolerance) continue;
        if (Math.abs(a.topY - b.topY) > 0.3) continue;
        const pairYaw = snapYaw(Math.atan2(-dz, dx));
        if (axisYawDelta(wallAxis, pairYaw) > 0.16) continue;
        const pairBaseY = Math.max(a.baseY, b.baseY);
        if (Math.abs(pairBaseY - groupBaseY) > 0.45) continue;
        const x = (a.x + b.x) * 0.5;
        const z = (a.z + b.z) * 0.5;
        const distance = Math.hypot(x - wall.x, z - wall.z);
        if (distance >= bestDistance) continue;
        const anchorIds = [a.id, b.id].sort((left, right) => left - right);
        bestDistance = distance;
        best = {
          x,
          z,
          yaw: pairYaw,
          baseY: pairBaseY,
          topY: (a.topY + b.topY) * 0.5,
          anchorIds
        };
      }
    }
    return best;
  }

  #orientEntriesInward(bay) {
    for (const entry of bay.entries) {
      entry.yaw = bay.yaw;
      entry.wallFlatFaceInward = true;
      entry.root.rotation.y = bay.yaw;
      entry.root.userData.wallFlatFaceInward = true;
    }
  }

  #fitCompleteBayToFrame(bay) {
    if (!bay.complete || !bay.entries.length) return;
    const topEntry = bay.entries[bay.entries.length - 1];
    const targetTopY = bay.topY;
    if (!Number.isFinite(targetTopY) || targetTopY <= topEntry.centerY + 0.05) return;

    const targetScaleY = Math.max(1, (targetTopY - topEntry.centerY) / WALL_SECTION_TOP_OFFSET);
    topEntry.root.scale.y = targetScaleY;
    if (Math.abs(topEntry.topY - targetTopY) <= 0.001) return;

    const hadCollision = Boolean(topEntry.collisionHandle);
    if (hadCollision) {
      this.collision.removeObstacle(topEntry.collisionHandle);
      topEntry.collisionHandle = null;
    }
    topEntry.topY = targetTopY;
    if (hadCollision) topEntry.collisionHandle = this.#addOriginalEntryCollision(topEntry);
  }

  #hideOriginalEntries(entries) {
    for (const entry of entries) {
      if (!entry.active) continue;
      entry.root.visible = false;
      if (entry.collisionHandle) {
        this.collision.removeObstacle(entry.collisionHandle);
        entry.collisionHandle = null;
      }
    }
  }

  #restoreOriginalEntries(entries) {
    for (const entry of entries) {
      if (!entry.active) continue;
      entry.root.visible = true;
      if (entry.collisionHandle) continue;
      entry.collisionHandle = this.#addOriginalEntryCollision(entry);
    }
  }

  #addOriginalEntryCollision(entry) {
    return this.collision.addBox({
      x: entry.x,
      z: entry.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: WALL_THICKNESS,
      yaw: entry.yaw,
      type: 'placed-log',
      label: entry.root.name,
      bottomY: entry.centerY - WALL_THICKNESS,
      topY: entry.topY
    });
  }

  #createVariantRoot(bay, variant) {
    const root = new THREE.Group();
    root.name = `wall-panel-${variant}-${bay.key}`;
    root.userData.wallPanelVariant = variant;
    root.userData.wallFlatFaceInward = true;
    root.position.set(bay.x, bay.baseY, bay.z);
    root.rotation.y = bay.yaw;

    const rows = this.#wallRows(bay);
    for (const rowY of rows) {
      if (variant === 'door' && rowY <= DOOR_HEIGHT) {
        this.#addOpeningRow(root, rowY, DOOR_WIDTH);
      } else if (variant === 'window' && rowY >= WINDOW_BOTTOM && rowY <= WINDOW_TOP) {
        this.#addOpeningRow(root, rowY, WINDOW_WIDTH);
      } else {
        this.#addSplitSegment(root, rowY, -PHYSICAL_LOG.halfLength, PHYSICAL_LOG.halfLength);
      }
    }

    if (variant === 'door') {
      const jambX = DOOR_WIDTH * 0.5 + OPENING_JAMB_OUTSET;
      const jambTop = Math.min(DOOR_HEIGHT, bay.topY - bay.baseY);
      this.#addJamb(root, -jambX, 0, jambTop);
      this.#addJamb(root, jambX, 0, jambTop);
    } else if (variant === 'window') {
      const jambX = WINDOW_WIDTH * 0.5 + OPENING_JAMB_OUTSET;
      this.#addJamb(root, -jambX, WINDOW_BOTTOM, WINDOW_TOP);
      this.#addJamb(root, jambX, WINDOW_BOTTOM, WINDOW_TOP);
    }

    return root;
  }

  #wallRows(bay) {
    const unique = new Set();
    for (const entry of bay.entries) {
      for (const y of [entry.centerY - bay.baseY, entry.centerY + 0.5 - bay.baseY]) {
        if (y < -0.05 || bay.baseY + y > bay.topY + WALL_COMPLETION_TOP_TOLERANCE) continue;
        unique.add(Math.round(y * 1000) / 1000);
      }
    }

    if (bay.complete) {
      const closureY = bay.topY - bay.baseY - WALL_ROW_RADIUS;
      const highest = unique.size ? Math.max(...unique) : -Infinity;
      if (closureY > highest + 0.05) unique.add(Math.round(closureY * 1000) / 1000);
    }

    return [...unique].sort((left, right) => left - right);
  }

  #addOpeningRow(root, y, openingWidth) {
    const halfOpening = openingWidth * 0.5;
    this.#addSplitSegment(root, y, -PHYSICAL_LOG.halfLength, -halfOpening);
    this.#addSplitSegment(root, y, halfOpening, PHYSICAL_LOG.halfLength);
  }

  #addSplitSegment(root, y, minX, maxX) {
    const length = maxX - minX;
    if (length <= 0.08) return;
    const half = createSplitHalfLogVisual('WallPanelSplitLog');
    half.rotation.x = Math.PI / 2;
    half.position.set((minX + maxX) * 0.5, y, 0);
    half.scale.x = length / PHYSICAL_LOG.length;
    root.add(half);
  }

  #addJamb(root, x, bottomY, topY) {
    const height = topY - bottomY;
    if (height <= 0.08) return;
    const jamb = createPhysicalLogVisual('WallOpeningJamb');
    jamb.position.set(x, bottomY + height * 0.5, 0);
    jamb.rotation.z = Math.PI / 2;
    jamb.scale.x = height / PHYSICAL_LOG.length;
    root.add(jamb);
  }

  #createVariantCollisions(bay, variant) {
    if (variant === 'door') {
      return doorSideColliderSpecs({
        x: bay.x,
        z: bay.z,
        yaw: bay.yaw,
        bottomY: bay.baseY - 0.02,
        topY: bay.topY
      }).map((spec, index) =>
        this.collision.addBox({
          ...spec,
          type: 'placed-log',
          label: `wall-panel-door-${bay.key}-${index}`
        })
      );
    }

    return windowColliderSpecs({
      x: bay.x,
      z: bay.z,
      yaw: bay.yaw,
      baseY: bay.baseY,
      topY: bay.topY
    }).map((spec, index) =>
      this.collision.addBox({
        ...spec,
        type: 'placed-log',
        label: `wall-panel-window-${bay.key}-${index}`
      })
    );
  }

  #removeCustomizationState(state) {
    if (!state) return;
    for (const handle of state.collisionHandles ?? []) {
      this.collision.removeObstacle(handle);
    }
    if (state.root) this.group.remove(state.root);
  }

  #baySignature(bay) {
    return bay.entries.map(entry => entry.id).sort((a, b) => a - b).join('-');
  }

  #activeEntries(mode) {
    return this.physicalLogs.builtLogs.filter(entry => entry.active && entry.mode === mode);
  }

  #variantLabel(variant) {
    if (variant === 'door') return 'Door wall';
    if (variant === 'window') return 'Window wall';
    return 'Solid wall';
  }
}
