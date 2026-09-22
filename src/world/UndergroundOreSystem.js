import * as THREE from 'three';
import {
  CAVE_ORE_DISTRIBUTION,
  ORE_DEFINITIONS,
  canPickaxeTierMine,
  oreSpawnWeight
} from '../data/MiningResourceDefinitions.js';
import { undergroundPocketFloorYAt } from './UndergroundPocketProfile.js';

const STATE_KIND = 'underground-ore-v1';
const INTERACTION_RADIUS = 2.7;
const INTERACTION_GRACE = 0.75;

const clamp01 = value => Math.max(0, Math.min(1, value));

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ Math.imul(salt | 0, 374761393), 668265263);
  value = Math.imul(value ^ Math.imul(z | 0, 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

const finitePocket = pocket => (
  typeof pocket?.id === 'string'
  && [pocket.x, pocket.y, pocket.z, pocket.radius, pocket.ix, pocket.iz].every(Number.isFinite)
  && pocket.radius > 0
);

const nodeSizeForRoll = (resourceId, roll) => {
  const value = clamp01(roll);
  if (resourceId === 'diamond') {
    if (value < 0.7) return 'small';
    if (value < 0.95) return 'medium';
    return 'large';
  }
  if (resourceId === 'iron') {
    if (value < 0.48) return 'small';
    if (value < 0.86) return 'medium';
    return 'large';
  }
  if (value < 0.4) return 'small';
  if (value < 0.78) return 'medium';
  return 'large';
};

const sizeScale = size => {
  if (size === 'large') return 1.42;
  if (size === 'medium') return 1.08;
  return 0.82;
};

export class UndergroundOreSystem {
  constructor({ group, chunks = null } = {}) {
    if (!group) throw new Error('UndergroundOreSystem requires a group');
    this.group = group;
    this.chunks = chunks;

    this.root = new THREE.Group();
    this.root.name = 'underground-ore-system';
    this.root.userData.undergroundOreSystem = true;
    this.group.add(this.root);

    this.pocketRoots = new Map();
    this.pocketSummaries = new Map();
    this.nodes = new Map();
    this.loose = new Map();
    this.nodeHits = new Map();
    this.collectedLooseIds = new Set();
    this.tempWorld = new THREE.Vector3();

    this.geometry = Object.freeze({
      nodeRock: new THREE.DodecahedronGeometry(0.48, 0),
      oreChunk: new THREE.DodecahedronGeometry(0.19, 0),
      looseOre: new THREE.DodecahedronGeometry(0.23, 0)
    });

    this.darkStoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f514f,
      roughness: 1,
      flatShading: true
    });

    this.oreMaterials = Object.freeze(
      Object.fromEntries(Object.values(ORE_DEFINITIONS).map(definition => [
        definition.id,
        new THREE.MeshStandardMaterial({
          color: definition.color,
          emissive: definition.emissive,
          emissiveIntensity: definition.id === 'diamond' ? 0.48 : 0.12,
          roughness: definition.id === 'diamond' ? 0.4 : 0.78,
          metalness: definition.id === 'diamond' ? 0.08 : 0.28,
          flatShading: true
        })
      ]))
    );
  }

  create() {
    return 0;
  }

  discoverPocket(pocket) {
    if (!finitePocket(pocket)) return null;
    if (!this.pocketRoots.has(pocket.id)) this.#buildPocket(pocket);
    return this.#summaryFor(pocket.id);
  }

  syncDiscoveredPockets(pockets = []) {
    const valid = (Array.isArray(pockets) ? pockets : [])
      .filter(finitePocket)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const pocket of valid) this.discoverPocket(pocket);
    return valid.length;
  }

  getInteractionTarget(playerPosition) {
    if (!playerPosition) return null;
    let nearest = null;
    let nearestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;

    for (const entry of this.loose.values()) {
      if (!entry.active || entry.reservedBy) continue;
      entry.root.getWorldPosition(this.tempWorld);
      const distanceSq = this.tempWorld.distanceToSquared(playerPosition);
      if (distanceSq > nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = {
        kind: 'loose',
        entry,
        position: this.tempWorld.clone()
      };
    }

    for (const node of this.nodes.values()) {
      if (!node.active) continue;
      node.root.getWorldPosition(this.tempWorld);
      const distanceSq = this.tempWorld.distanceToSquared(playerPosition);
      if (distanceSq > nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = {
        kind: 'node',
        entry: node,
        position: this.tempWorld.clone()
      };
    }

    if (!nearest) return null;
    if (nearest.kind === 'loose') {
      return {
        type: 'underground-collectible',
        source: 'ore',
        id: nearest.entry.id,
        resourceId: nearest.entry.resourceId,
        quantity: nearest.entry.quantity,
        label: nearest.entry.label,
        icon: nearest.entry.resourceId,
        actionLabel: `Collect ${nearest.entry.label}`,
        position: nearest.position
      };
    }

    const node = nearest.entry;
    return {
      type: 'underground-ore-node',
      source: 'ore',
      id: node.id,
      resourceId: node.resourceId,
      label: `${node.label} deposit`,
      icon: 'pickaxe',
      actionLabel: `Mine ${node.label}`,
      requiredPickaxeTier: node.requiredPickaxeTier,
      remainingHits: Math.max(0, node.hitsRequired - (this.nodeHits.get(node.id) ?? 0)),
      position: nearest.position
    };
  }

  mine(target, { pickaxeTier = 'stone', playerPosition = null } = {}) {
    if (target?.type !== 'underground-ore-node' || target.source !== 'ore') return null;
    const node = this.nodes.get(target.id);
    if (!node?.active) return null;

    if (playerPosition) {
      node.root.getWorldPosition(this.tempWorld);
      const maxDistance = INTERACTION_RADIUS + INTERACTION_GRACE;
      if (this.tempWorld.distanceToSquared(playerPosition) > maxDistance * maxDistance) return null;
    }

    if (!canPickaxeTierMine(pickaxeTier, node.requiredPickaxeTier)) {
      return {
        mined: false,
        reason: 'pickaxe-tier',
        id: node.id,
        resourceId: node.resourceId,
        label: node.label,
        requiredPickaxeTier: node.requiredPickaxeTier
      };
    }

    const nextHits = (this.nodeHits.get(node.id) ?? 0) + 1;
    this.nodeHits.set(node.id, nextHits);
    const remainingHits = Math.max(0, node.hitsRequired - nextHits);
    if (remainingHits > 0) {
      return {
        mined: true,
        broken: false,
        id: node.id,
        resourceId: node.resourceId,
        label: node.label,
        size: node.size,
        remainingHits
      };
    }

    node.active = false;
    node.root.visible = false;
    for (const dropId of node.dropIds) {
      const loose = this.loose.get(dropId);
      if (!loose || this.collectedLooseIds.has(dropId)) continue;
      loose.active = true;
      loose.root.visible = true;
    }

    return {
      mined: true,
      broken: true,
      id: node.id,
      resourceId: node.resourceId,
      label: node.label,
      size: node.size,
      remainingHits: 0,
      yield: node.yield
    };
  }

  collect(target, { playerPosition = null, canStore = null } = {}) {
    if (
      target?.type !== 'underground-collectible'
      || target.source !== 'ore'
      || typeof target.id !== 'string'
    ) return null;
    const entry = this.loose.get(target.id);
    if (!entry?.active || entry.reservedBy) return null;

    if (playerPosition) {
      entry.root.getWorldPosition(this.tempWorld);
      const maxDistance = INTERACTION_RADIUS + INTERACTION_GRACE;
      if (this.tempWorld.distanceToSquared(playerPosition) > maxDistance * maxDistance) return null;
    }

    if (typeof canStore === 'function' && !canStore(entry.resourceId, entry.quantity)) {
      return {
        collected: false,
        reason: 'capacity',
        id: entry.id,
        resourceId: entry.resourceId,
        quantity: entry.quantity,
        label: entry.label
      };
    }

    entry.active = false;
    entry.root.visible = false;
    this.collectedLooseIds.add(entry.id);
    return {
      collected: true,
      id: entry.id,
      pocketId: entry.pocketId,
      resourceId: entry.resourceId,
      quantity: entry.quantity,
      label: entry.label
    };
  }

  findNearestLooseResource(position, maxDistance, filter = null) {
    if (!position || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    let nearest = null;
    let nearestDistanceSq = maxDistance * maxDistance;

    for (const entry of this.loose.values()) {
      if (!entry.active || entry.reservedBy) continue;
      if (filter && !filter(entry.resourceId, entry.quantity)) continue;
      entry.root.getWorldPosition(this.tempWorld);
      const distanceSq = this.tempWorld.distanceToSquared(position);
      if (distanceSq > nearestDistanceSq) continue;
      nearest = entry;
      nearestDistanceSq = distanceSq;
    }

    if (!nearest) return null;
    nearest.root.getWorldPosition(this.tempWorld);
    return {
      id: nearest.id,
      source: 'underground-ore',
      resourceId: nearest.resourceId,
      label: nearest.label,
      quantity: nearest.quantity,
      root: nearest.root,
      position: this.tempWorld.clone()
    };
  }

  reserveLooseResource(id, owner, { canStore = null } = {}) {
    if (!owner) throw new Error('Underground ore reservations require an owner token');
    const entry = this.loose.get(id);
    if (!entry?.active || (entry.reservedBy && entry.reservedBy !== owner)) return null;
    if (typeof canStore === 'function' && !canStore(entry.resourceId, entry.quantity)) return null;
    entry.reservedBy = owner;
    entry.root.visible = false;
    entry.root.getWorldPosition(this.tempWorld);
    return {
      id: entry.id,
      source: 'underground-ore',
      resourceId: entry.resourceId,
      label: entry.label,
      quantity: entry.quantity,
      root: entry.root,
      position: this.tempWorld.clone()
    };
  }

  releaseLooseResource(id, owner) {
    const entry = this.loose.get(id);
    if (!entry?.active || entry.reservedBy !== owner) return false;
    entry.reservedBy = null;
    entry.root.visible = true;
    return true;
  }

  takeReservedLooseResource(id, owner, { canStore = null } = {}) {
    const entry = this.loose.get(id);
    if (!entry?.active || entry.reservedBy !== owner) return null;
    if (typeof canStore === 'function' && !canStore(entry.resourceId, entry.quantity)) {
      entry.reservedBy = null;
      entry.root.visible = true;
      return null;
    }
    entry.reservedBy = null;
    entry.active = false;
    entry.root.visible = false;
    this.collectedLooseIds.add(entry.id);
    return {
      id: entry.id,
      resourceId: entry.resourceId,
      label: entry.label,
      quantity: entry.quantity
    };
  }

  captureState() {
    return {
      kind: STATE_KIND,
      nodeHits: [...this.nodeHits.entries()]
        .filter(([, hits]) => Number(hits) > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
      collectedLooseIds: [...this.collectedLooseIds].sort()
    };
  }

  restoreState(state, discoveredPockets = []) {
    this.#clearPresentations();
    this.nodeHits.clear();
    this.collectedLooseIds.clear();

    if (state?.kind === STATE_KIND) {
      for (const pair of Array.isArray(state.nodeHits) ? state.nodeHits : []) {
        const [id, hits] = Array.isArray(pair) ? pair : [];
        if (typeof id !== 'string' || !Number.isFinite(hits) || hits <= 0) continue;
        this.nodeHits.set(id, Math.floor(hits));
      }
      for (const id of Array.isArray(state.collectedLooseIds) ? state.collectedLooseIds : []) {
        if (typeof id === 'string') this.collectedLooseIds.add(id);
      }
    }

    this.syncDiscoveredPockets(discoveredPockets);
    return true;
  }

  getDebugState() {
    return {
      kind: STATE_KIND,
      pocketCount: this.pocketRoots.size,
      nodes: [...this.nodes.values()].map(node => ({
        id: node.id,
        pocketId: node.pocketId,
        resourceId: node.resourceId,
        size: node.size,
        requiredPickaxeTier: node.requiredPickaxeTier,
        hitsRequired: node.hitsRequired,
        hits: this.nodeHits.get(node.id) ?? 0,
        yield: node.yield,
        active: node.active
      })).sort((left, right) => left.id.localeCompare(right)),
      loose: [...this.loose.values()].map(entry => ({
        id: entry.id,
        pocketId: entry.pocketId,
        resourceId: entry.resourceId,
        active: entry.active,
        reserved: Boolean(entry.reservedBy),
        unlockedByNodeId: entry.unlockedByNodeId
      })).sort((left, right) => left.id.localeCompare(right)),
      collectedLooseIds: [...this.collectedLooseIds].sort()
    };
  }

  #buildPocket(pocket) {
    const pocketRoot = new THREE.Group();
    pocketRoot.name = `underground-ore-pocket-${pocket.ix}-${pocket.iz}`;
    pocketRoot.userData.pocketId = pocket.id;
    const floorY = undergroundPocketFloorYAt(pocket);
    pocketRoot.position.set(
      pocket.x,
      Number.isFinite(floorY) ? floorY : pocket.y - pocket.radius,
      pocket.z
    );
    if (this.chunks) this.chunks.addObjectAt(pocketRoot, pocket.x, pocket.z);
    else this.root.add(pocketRoot);
    this.pocketRoots.set(pocket.id, pocketRoot);

    const contentRadius = Number.isFinite(pocket.contentRadius)
      ? pocket.contentRadius
      : pocket.radius * 0.72;
    const depth = Number.isFinite(pocket.depth)
      ? Math.max(0, pocket.depth)
      : Math.max(0, -pocket.y);

    const summary = {
      pocketId: pocket.id,
      depth,
      copperNodes: 0,
      ironNodes: 0,
      diamondNodes: 0,
      looseCopper: 0,
      looseIron: 0,
      looseDiamond: 0
    };

    for (const [resourceIndex, definition] of Object.values(ORE_DEFINITIONS).entries()) {
      const weight = oreSpawnWeight(definition.id, depth);
      let nodeCount = 0;
      if (hash01(pocket.ix + resourceIndex * 17, pocket.iz, 601) <= weight) nodeCount += 1;
      if (
        hash01(pocket.ix, pocket.iz - resourceIndex * 19, 607)
        <= weight * CAVE_ORE_DISTRIBUTION.secondNodeChanceScale
      ) nodeCount += 1;

      for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
        const size = nodeSizeForRoll(
          definition.id,
          hash01(pocket.ix + nodeIndex * 11, pocket.iz + resourceIndex * 13, 613)
        );
        const profile = definition.nodeProfiles[size];
        const nodeId = `${pocket.id}:ore-node:${definition.id}:${nodeIndex}`;
        const angle = (
          resourceIndex * 2.11
          + nodeIndex * 2.67
          + hash01(pocket.ix + nodeIndex, pocket.iz, 617) * 1.35
        ) % (Math.PI * 2);
        const radius = contentRadius * (
          0.5 + hash01(pocket.ix, pocket.iz + nodeIndex + resourceIndex, 619) * 0.24
        );
        const root = this.#createNodeVisual(definition.id, size, nodeIndex + resourceIndex * 5);
        root.position.set(Math.cos(angle) * radius, 0.18 * sizeScale(size), Math.sin(angle) * radius);
        root.rotation.y = angle + 0.4;
        pocketRoot.add(root);

        const hits = this.nodeHits.get(nodeId) ?? 0;
        const broken = hits >= profile.hitsRequired;
        const dropIds = [];

        for (let dropIndex = 0; dropIndex < profile.yield; dropIndex += 1) {
          const dropId = `${nodeId}:drop:${dropIndex}`;
          dropIds.push(dropId);
          const drop = this.#createLooseVisual(definition.id, dropIndex);
          const dropAngle = angle + dropIndex * 2.399963229728653;
          const dropRadius = 0.48 + (dropIndex % 3) * 0.13;
          drop.position.set(
            Math.cos(angle) * radius + Math.cos(dropAngle) * dropRadius,
            0.2,
            Math.sin(angle) * radius + Math.sin(dropAngle) * dropRadius
          );
          drop.rotation.set(0.13 * dropIndex, dropAngle, 0.08 * dropIndex);
          pocketRoot.add(drop);
          this.#registerLoose({
            id: dropId,
            pocketId: pocket.id,
            resourceId: definition.id,
            label: definition.label,
            quantity: 1,
            root: drop,
            unlockedByNodeId: nodeId,
            initiallyUnlocked: broken
          });
        }

        root.visible = !broken;
        this.nodes.set(nodeId, {
          id: nodeId,
          pocketId: pocket.id,
          resourceId: definition.id,
          label: definition.label,
          size,
          requiredPickaxeTier: definition.requiredPickaxeTier,
          hitsRequired: profile.hitsRequired,
          yield: profile.yield,
          root,
          dropIds,
          active: !broken
        });
        summary[`${definition.id}Nodes`] += 1;
      }

      const looseChance = Math.min(
        0.9,
        CAVE_ORE_DISTRIBUTION.looseOreBaseChance
          + weight * CAVE_ORE_DISTRIBUTION.looseOreWeightScale
      );
      const looseCount = hash01(pocket.ix - resourceIndex * 23, pocket.iz, 631) <= looseChance
        ? 1 + (
          hash01(pocket.ix, pocket.iz + resourceIndex * 29, 641) <= looseChance * 0.33
            ? Math.max(0, CAVE_ORE_DISTRIBUTION.looseOreMaxPerPocket - 1)
            : 0
        )
        : 0;

      for (let looseIndex = 0; looseIndex < looseCount; looseIndex += 1) {
        const id = `${pocket.id}:loose-ore:${definition.id}:${looseIndex}`;
        const angle = (
          resourceIndex * 1.74
          + looseIndex * 2.3
          + hash01(pocket.ix + looseIndex, pocket.iz, 643) * 1.1
        ) % (Math.PI * 2);
        const radius = contentRadius * (
          0.2 + hash01(pocket.ix, pocket.iz + looseIndex + resourceIndex, 647) * 0.27
        );
        const root = this.#createLooseVisual(definition.id, looseIndex + 7);
        root.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius);
        root.rotation.set(0.18 * looseIndex, angle, 0.1 * resourceIndex);
        pocketRoot.add(root);
        this.#registerLoose({
          id,
          pocketId: pocket.id,
          resourceId: definition.id,
          label: definition.label,
          quantity: 1,
          root,
          unlockedByNodeId: null,
          initiallyUnlocked: true
        });
        summary[`loose${definition.id[0].toUpperCase()}${definition.id.slice(1)}`] += 1;
      }
    }

    this.pocketSummaries.set(pocket.id, Object.freeze(summary));
  }

  #createNodeVisual(resourceId, size, index) {
    const definition = ORE_DEFINITIONS[resourceId];
    const group = new THREE.Group();
    const scale = sizeScale(size);

    const rock = new THREE.Mesh(this.geometry.nodeRock, this.darkStoneMaterial);
    rock.scale.set(scale * 1.2, scale * 0.78, scale);
    rock.rotation.set(0.12 + index * 0.03, index * 0.49, 0.08);
    rock.castShadow = false;
    rock.receiveShadow = true;
    group.add(rock);

    for (let chunkIndex = 0; chunkIndex < 5; chunkIndex += 1) {
      const chunk = new THREE.Mesh(this.geometry.oreChunk, this.oreMaterials[resourceId]);
      const angle = chunkIndex / 5 * Math.PI * 2 + index * 0.37;
      chunk.position.set(
        Math.cos(angle) * scale * 0.42,
        scale * (0.22 + (chunkIndex % 2) * 0.16),
        Math.sin(angle) * scale * 0.34
      );
      chunk.scale.setScalar(scale * (0.68 + (chunkIndex % 3) * 0.12));
      chunk.rotation.set(chunkIndex * 0.19, angle, chunkIndex * 0.13);
      chunk.castShadow = false;
      chunk.receiveShadow = true;
      group.add(chunk);
    }

    group.name = `${definition.id}-ore-node-${size}`;
    return group;
  }

  #createLooseVisual(resourceId, index) {
    const group = new THREE.Group();
    const rock = new THREE.Mesh(this.geometry.looseOre, this.darkStoneMaterial);
    rock.scale.set(1, 0.72, 0.9);
    rock.rotation.set(index * 0.11, index * 0.47, index * 0.07);
    group.add(rock);

    const ore = new THREE.Mesh(this.geometry.oreChunk, this.oreMaterials[resourceId]);
    ore.position.set(0.08, 0.13, -0.04);
    ore.scale.set(0.82, 0.64, 0.78);
    ore.rotation.set(0.2, index * 0.63, -0.12);
    group.add(ore);
    group.name = `loose-${resourceId}-ore`;
    return group;
  }

  #registerLoose({
    id,
    pocketId,
    resourceId,
    label,
    quantity,
    root,
    unlockedByNodeId,
    initiallyUnlocked
  }) {
    const active = Boolean(initiallyUnlocked) && !this.collectedLooseIds.has(id);
    root.visible = active;
    root.userData.undergroundOreLooseId = id;
    root.userData.resourceId = resourceId;
    this.loose.set(id, {
      id,
      pocketId,
      resourceId,
      label,
      quantity,
      root,
      unlockedByNodeId,
      active,
      reservedBy: null
    });
  }

  #summaryFor(pocketId) {
    const summary = this.pocketSummaries.get(pocketId);
    return summary ? { ...summary } : null;
  }

  #clearPresentations() {
    for (const pocketRoot of this.pocketRoots.values()) pocketRoot.parent?.remove(pocketRoot);
    this.root.clear();
    this.pocketRoots.clear();
    this.pocketSummaries.clear();
    this.nodes.clear();
    this.loose.clear();
  }
}
