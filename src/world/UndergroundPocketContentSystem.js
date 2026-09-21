import * as THREE from 'three';
import {
  UNDERGROUND_POCKET_CONTENT,
  UNDERGROUND_POCKET_REWARDS
} from '../data/UndergroundPocketContentDefinitions.js';
import {
  undergroundPocketFloorYAt,
  undergroundPocketVerticalSpanAt
} from './UndergroundPocketProfile.js';

const STATE_KIND = 'underground-pocket-content-v1';

const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ Math.imul(salt | 0, 374761393), 668265263);
  value = Math.imul(value ^ Math.imul(z | 0, 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

const deterministicCount = (min, max, value) => {
  const low = Math.max(0, Math.floor(min));
  const high = Math.max(low, Math.floor(max));
  return low + Math.floor(clamp01(value) * (high - low + 0.999999));
};

const finitePocket = pocket => (
  typeof pocket?.id === 'string' &&
  [pocket.x, pocket.y, pocket.z, pocket.radius, pocket.ix, pocket.iz].every(Number.isFinite) &&
  pocket.radius > 0
);

export class UndergroundPocketContentSystem {
  constructor({ group, chunks = null } = {}) {
    if (!group) throw new Error('UndergroundPocketContentSystem requires a group');
    this.group = group;
    this.chunks = chunks;
    this.config = UNDERGROUND_POCKET_CONTENT;

    this.root = new THREE.Group();
    this.root.name = 'underground-pocket-content';
    this.root.userData.undergroundPocketContent = true;
    this.group.add(this.root);

    this.pocketRoots = new Map();
    this.pocketSummaries = new Map();
    this.collectibles = new Map();
    this.collectedIds = new Set();
    this.tempWorld = new THREE.Vector3();

    this.geometry = Object.freeze({
      rock: new THREE.DodecahedronGeometry(0.34, 0),
      wallShelf: new THREE.DodecahedronGeometry(0.48, 0),
      pebble: new THREE.DodecahedronGeometry(0.19, 0),
      stalagmite: new THREE.ConeGeometry(0.24, 0.9, 5),
      stalactite: new THREE.ConeGeometry(0.25, 1.1, 5),
      crystal: new THREE.ConeGeometry(0.12, 0.62, 5),
      shard: new THREE.OctahedronGeometry(0.22, 0),
      pillar: new THREE.BoxGeometry(0.34, 1.8, 0.34),
      lintel: new THREE.BoxGeometry(1.55, 0.3, 0.36),
      pedestal: new THREE.CylinderGeometry(0.34, 0.44, 0.48, 6),
      cache: new THREE.BoxGeometry(0.76, 0.46, 0.58),
      cacheLid: new THREE.BoxGeometry(0.82, 0.18, 0.64),
      relic: new THREE.OctahedronGeometry(0.2, 0)
    });

    this.material = Object.freeze({
      rock: new THREE.MeshStandardMaterial({
        color: 0x6f6a60,
        roughness: 1,
        flatShading: true
      }),
      darkStone: new THREE.MeshStandardMaterial({
        color: 0x504b43,
        roughness: 1,
        flatShading: true
      }),
      deepStone: new THREE.MeshStandardMaterial({
        color: 0x45494a,
        roughness: 1,
        flatShading: true
      }),
      ancientStone: new THREE.MeshStandardMaterial({
        color: 0x736c5b,
        roughness: 0.96,
        flatShading: true
      }),
      crystal: new THREE.MeshStandardMaterial({
        color: 0x73c7d8,
        emissive: 0x1d6072,
        emissiveIntensity: 0.82,
        roughness: 0.52,
        flatShading: true
      }),
      shard: new THREE.MeshStandardMaterial({
        color: 0x62d8f0,
        emissive: 0x1d8da9,
        emissiveIntensity: 1.15,
        roughness: 0.3,
        metalness: 0.08,
        flatShading: true
      }),
      treasure: new THREE.MeshStandardMaterial({
        color: 0xb8924f,
        emissive: 0x3a2508,
        emissiveIntensity: 0.25,
        roughness: 0.58,
        metalness: 0.28,
        flatShading: true
      })
    });
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
    let nearestDistanceSq = this.config.interactionRadius * this.config.interactionRadius;

    for (const entry of this.collectibles.values()) {
      if (!entry.active) continue;
      entry.root.getWorldPosition(this.tempWorld);
      const distanceSq = this.tempWorld.distanceToSquared(playerPosition);
      if (distanceSq > nearestDistanceSq) continue;
      nearest = entry;
      nearestDistanceSq = distanceSq;
    }

    if (!nearest) return null;
    nearest.root.getWorldPosition(this.tempWorld);
    return {
      type: 'underground-collectible',
      id: nearest.id,
      pocketId: nearest.pocketId,
      resourceId: nearest.resourceId,
      quantity: nearest.quantity,
      label: nearest.label,
      icon: nearest.resourceId,
      actionLabel: `Collect ${nearest.label}`,
      position: this.tempWorld.clone()
    };
  }

  collect(target, { playerPosition = null, canStore = null } = {}) {
    if (target?.type !== 'underground-collectible' || typeof target.id !== 'string') return null;
    const entry = this.collectibles.get(target.id);
    if (!entry?.active) return null;

    if (playerPosition) {
      entry.root.getWorldPosition(this.tempWorld);
      const maxDistance = this.config.interactionRadius + this.config.interactionGrace;
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
    this.collectedIds.add(entry.id);
    return {
      collected: true,
      id: entry.id,
      pocketId: entry.pocketId,
      resourceId: entry.resourceId,
      quantity: entry.quantity,
      label: entry.label
    };
  }

  captureState() {
    return {
      kind: STATE_KIND,
      schemaVersion: this.config.schemaVersion,
      collectedIds: [...this.collectedIds].sort()
    };
  }

  restoreState(state, discoveredPockets = []) {
    this.#clearPocketPresentations();
    this.collectedIds.clear();

    if (
      state?.kind === STATE_KIND &&
      state?.schemaVersion === this.config.schemaVersion
    ) {
      for (const id of Array.isArray(state.collectedIds) ? state.collectedIds : []) {
        if (typeof id === 'string') this.collectedIds.add(id);
      }
    }

    this.syncDiscoveredPockets(discoveredPockets);
    return true;
  }

  getDebugState() {
    return {
      kind: STATE_KIND,
      pocketCount: this.pocketRoots.size,
      hiddenStructurePocketIds: [...this.pocketSummaries.values()]
        .filter(summary => summary.hasHiddenStructure)
        .map(summary => summary.pocketId)
        .sort(),
      treasurePocketIds: [...this.pocketSummaries.values()]
        .filter(summary => summary.hasTreasure)
        .map(summary => summary.pocketId)
        .sort(),
      shardPocketIds: [...this.pocketSummaries.values()]
        .filter(summary => summary.sproutShardCount > 0)
        .map(summary => summary.pocketId)
        .sort(),
      collectedIds: [...this.collectedIds].sort(),
      collectibles: [...this.collectibles.values()]
        .map(entry => {
          entry.root.getWorldPosition(this.tempWorld);
          return {
            id: entry.id,
            pocketId: entry.pocketId,
            resourceId: entry.resourceId,
            quantity: entry.quantity,
            active: entry.active,
            position: {
              x: Number(this.tempWorld.x.toFixed(4)),
              y: Number(this.tempWorld.y.toFixed(4)),
              z: Number(this.tempWorld.z.toFixed(4))
            }
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id))
    };
  }

  #buildPocket(pocket) {
    const pocketRoot = new THREE.Group();
    pocketRoot.name = `underground-pocket-content-${pocket.ix}-${pocket.iz}`;
    pocketRoot.userData.pocketId = pocket.id;
    const pocketFloorY = undergroundPocketFloorYAt(pocket);
    pocketRoot.position.set(
      pocket.x,
      Number.isFinite(pocketFloorY)
        ? pocketFloorY
        : pocket.y - pocket.radius,
      pocket.z
    );
    if (this.chunks) this.chunks.addObjectAt(pocketRoot, pocket.x, pocket.z);
    else this.root.add(pocketRoot);
    this.pocketRoots.set(pocket.id, pocketRoot);

    const ix = pocket.ix;
    const iz = pocket.iz;
    const angleOffset = hash01(ix, iz, 203) * Math.PI * 2;
    const contentRadius = Number.isFinite(pocket.contentRadius)
      ? pocket.contentRadius
      : pocket.radius;
    // Chamber floors are authored as a real horizontal cave floor rather than
    // the lower half of a sphere. Dressing therefore shares one floor plane.
    const floorRiseAtRadius = () => 0;
    const rootWorldY = pocketRoot.position.y;
    const verticalSpanAt = (localX, localZ) =>
      this.#verticalSpanAt(pocket, localX, localZ, rootWorldY);

    const decorativeRockCount = deterministicCount(
      this.config.decorativeRockMin,
      this.config.decorativeRockMax,
      hash01(ix, iz, 211)
    );
    for (let index = 0; index < decorativeRockCount; index += 1) {
      const angle = angleOffset + index * Math.PI * 2 / decorativeRockCount
        + (hash01(ix + index, iz, 223) - 0.5) * 0.34;
      const radius = contentRadius * lerp(0.58, 0.82, hash01(ix, iz + index, 227));
      const scale = lerp(0.52, 1.22, hash01(ix + index, iz, 229));
      const rock = new THREE.Mesh(this.geometry.rock, this.material.rock);
      rock.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius) + 0.12 * scale,
        Math.sin(angle) * radius
      );
      rock.scale.set(scale, scale * lerp(0.55, 0.9, hash01(ix, iz + index, 233)), scale);
      rock.rotation.set(
        hash01(ix, iz + index, 239) * 0.6,
        hash01(ix + index, iz, 241) * Math.PI * 2,
        hash01(ix, iz + index, 251) * 0.5
      );
      rock.castShadow = false;
      rock.receiveShadow = true;
      pocketRoot.add(rock);
    }

    const stalagmiteCount = deterministicCount(
      this.config.stalagmiteMin,
      this.config.stalagmiteMax,
      hash01(ix, iz, 257)
    );
    for (let index = 0; index < stalagmiteCount; index += 1) {
      const angle = angleOffset + 0.42 + index * Math.PI * 2 / Math.max(1, stalagmiteCount);
      const radius = contentRadius * lerp(0.58, 0.76, hash01(ix + index, iz, 263));
      const height = lerp(0.62, 1.35, hash01(ix, iz + index, 269));
      const spike = new THREE.Mesh(this.geometry.stalagmite, this.material.darkStone);
      spike.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius) + height * 0.5 - 0.02,
        Math.sin(angle) * radius
      );
      spike.scale.set(lerp(0.72, 1.16, hash01(ix, iz + index, 271)), height / 0.9, lerp(0.72, 1.16, hash01(ix + index, iz, 277)));
      spike.rotation.y = hash01(ix + index, iz, 281) * Math.PI * 2;
      spike.castShadow = false;
      spike.receiveShadow = true;
      pocketRoot.add(spike);
    }

    // Strong cave silhouettes need ceiling and wall detail as well as floor
    // clutter. These formations are deterministic, presentation-only and
    // restricted to discovered pockets so traversal/collision stay authoritative
    // in the tunneling density system.
    const stalactiteTargetCount = deterministicCount(
      this.config.stalactiteMin,
      this.config.stalactiteMax,
      hash01(ix, iz, 353)
    );
    let stalactiteCount = 0;
    for (let index = 0; index < stalactiteTargetCount; index += 1) {
      const angle = angleOffset + 0.18
        + index * Math.PI * 2 / Math.max(1, stalactiteTargetCount)
        + (hash01(ix + index * 3, iz, 359) - 0.5) * 0.38;
      const radius = contentRadius * lerp(0.42, 0.74, hash01(ix, iz + index, 367));
      const localX = Math.cos(angle) * radius;
      const localZ = Math.sin(angle) * radius;
      const span = verticalSpanAt(localX, localZ);
      if (!span || span.clearance < 2.05) continue;

      const height = Math.min(
        lerp(0.68, 1.52, hash01(ix + index, iz, 373)),
        span.clearance * 0.31
      );
      const spike = new THREE.Mesh(this.geometry.stalactite, this.material.deepStone);
      spike.position.set(
        localX,
        span.ceilingY - height * 0.5 + 0.04,
        localZ
      );
      spike.scale.set(
        lerp(0.72, 1.22, hash01(ix, iz + index, 379)),
        height / 1.1,
        lerp(0.72, 1.22, hash01(ix + index, iz, 383))
      );
      spike.rotation.set(
        Math.PI + (hash01(ix, iz + index, 389) - 0.5) * 0.13,
        hash01(ix + index, iz, 397) * Math.PI * 2,
        (hash01(ix, iz + index, 401) - 0.5) * 0.16
      );
      spike.castShadow = false;
      spike.receiveShadow = true;
      pocketRoot.add(spike);
      stalactiteCount += 1;
    }

    const wallFormationTargetCount = deterministicCount(
      this.config.wallFormationMin,
      this.config.wallFormationMax,
      hash01(ix, iz, 409)
    );
    let wallFormationCount = 0;
    for (let formation = 0; formation < wallFormationTargetCount; formation += 1) {
      const angle = angleOffset + 0.73
        + formation * Math.PI * 2 / Math.max(1, wallFormationTargetCount)
        + (hash01(ix + formation * 5, iz, 419) - 0.5) * 0.42;
      const radius = contentRadius * lerp(0.72, 0.88, hash01(ix, iz + formation, 421));
      const localX = Math.cos(angle) * radius;
      const localZ = Math.sin(angle) * radius;
      const span = verticalSpanAt(localX, localZ);
      if (!span || span.clearance < 1.8) continue;

      const formationRoot = new THREE.Group();
      formationRoot.position.set(
        localX,
        span.floorY + span.clearance * lerp(0.2, 0.42, hash01(ix + formation, iz, 431)),
        localZ
      );
      formationRoot.rotation.y = -angle + Math.PI * 0.5;

      const rockCount = deterministicCount(
        this.config.wallFormationRockMin,
        this.config.wallFormationRockMax,
        hash01(ix, iz + formation, 433)
      );
      for (let rockIndex = 0; rockIndex < rockCount; rockIndex += 1) {
        const shelf = new THREE.Mesh(
          this.geometry.wallShelf,
          rockIndex === 0 ? this.material.deepStone : this.material.rock
        );
        const offset = rockIndex - (rockCount - 1) * 0.5;
        const scale = lerp(0.86, 1.34, hash01(ix + formation, iz + rockIndex, 439));
        shelf.position.set(
          offset * 0.36,
          (hash01(ix + rockIndex, iz + formation, 443) - 0.5) * 0.24,
          (hash01(ix + formation, iz + rockIndex, 449) - 0.5) * 0.26
        );
        shelf.scale.set(
          scale * lerp(1.25, 1.75, hash01(ix, iz + rockIndex, 457)),
          scale * lerp(0.48, 0.8, hash01(ix + rockIndex, iz, 461)),
          scale * lerp(0.72, 1.08, hash01(ix + formation, iz, 463))
        );
        shelf.rotation.set(
          (hash01(ix, iz + rockIndex, 467) - 0.5) * 0.35,
          hash01(ix + rockIndex, iz + formation, 479) * Math.PI,
          (hash01(ix + formation, iz + rockIndex, 487) - 0.5) * 0.28
        );
        shelf.castShadow = false;
        shelf.receiveShadow = true;
        formationRoot.add(shelf);
      }

      if (hash01(ix + formation, iz, 491) <= this.config.wallCrystalChance) {
        for (let crystalIndex = 0; crystalIndex < 2; crystalIndex += 1) {
          const crystal = new THREE.Mesh(this.geometry.crystal, this.material.crystal);
          crystal.position.set(
            (crystalIndex - 0.5) * 0.26,
            0.38 + crystalIndex * 0.08,
            -0.08
          );
          crystal.rotation.z = (crystalIndex - 0.5) * 0.24;
          crystal.rotation.y = crystalIndex * 0.7;
          crystal.scale.set(
            0.92,
            lerp(0.92, 1.45, hash01(ix + formation, iz + crystalIndex, 499)),
            0.92
          );
          formationRoot.add(crystal);
        }
      }

      pocketRoot.add(formationRoot);
      wallFormationCount += 1;
    }

    let columnFormationCount = 0;
    if (hash01(ix, iz, 503) <= this.config.columnFormationChance) {
      const angle = angleOffset + Math.PI * lerp(0.2, 1.65, hash01(ix, iz, 509));
      const radius = contentRadius * lerp(0.62, 0.76, hash01(ix, iz, 521));
      const localX = Math.cos(angle) * radius;
      const localZ = Math.sin(angle) * radius;
      const span = verticalSpanAt(localX, localZ);
      if (span && span.clearance >= 2.55) {
        const gap = THREE.MathUtils.clamp(span.clearance * 0.16, 0.42, 0.72);
        const formationHeight = span.clearance - gap;
        const lowerHeight = formationHeight * 0.52;
        const upperHeight = formationHeight - lowerHeight;

        const lower = new THREE.Mesh(this.geometry.stalagmite, this.material.deepStone);
        lower.position.set(localX, span.floorY + lowerHeight * 0.5, localZ);
        lower.scale.set(1.34, lowerHeight / 0.9, 1.2);
        lower.rotation.y = angle + 0.35;
        lower.receiveShadow = true;
        pocketRoot.add(lower);

        const upper = new THREE.Mesh(this.geometry.stalactite, this.material.deepStone);
        upper.position.set(localX, span.ceilingY - upperHeight * 0.5, localZ);
        upper.scale.set(1.2, upperHeight / 1.1, 1.34);
        upper.rotation.set(Math.PI, angle - 0.28, 0.04);
        upper.receiveShadow = true;
        pocketRoot.add(upper);
        columnFormationCount = 1;
      }
    }

    const crystalClusterCount = deterministicCount(
      this.config.crystalClusterMin,
      this.config.crystalClusterMax,
      hash01(ix, iz, 283)
    );
    for (let cluster = 0; cluster < crystalClusterCount; cluster += 1) {
      const angle = angleOffset + 1.1 + cluster * Math.PI * 2 / Math.max(1, crystalClusterCount);
      const radius = contentRadius * lerp(0.5, 0.72, hash01(ix + cluster, iz, 293));
      const clusterRoot = new THREE.Group();
      clusterRoot.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius),
        Math.sin(angle) * radius
      );
      for (let spike = 0; spike < 3; spike += 1) {
        const crystal = new THREE.Mesh(this.geometry.crystal, this.material.crystal);
        crystal.position.set((spike - 1) * 0.14, 0.25 + spike * 0.05, (spike % 2) * 0.09);
        crystal.rotation.z = (spike - 1) * 0.22;
        crystal.rotation.y = angle + spike * 0.7;
        crystal.scale.y = lerp(0.72, 1.24, hash01(ix + cluster, iz + spike, 307));
        clusterRoot.add(crystal);
      }
      pocketRoot.add(clusterRoot);
    }

    const hasHiddenStructure = hash01(ix, iz, 311) <= this.config.hiddenStructureChance;
    if (hasHiddenStructure) {
      this.#addHiddenStructure(
        pocketRoot,
        pocket,
        angleOffset + 2.2,
        floorRiseAtRadius
      );
    }

    const stoneCount = deterministicCount(
      this.config.collectibleStoneMin,
      this.config.collectibleStoneMax,
      hash01(ix, iz, 313)
    );
    for (let index = 0; index < stoneCount; index += 1) {
      const angle = angleOffset + 0.2 + index * Math.PI * 2 / stoneCount;
      const radius = contentRadius * lerp(0.25, 0.5, hash01(ix + index, iz, 317));
      const quantity = deterministicCount(
        this.config.collectibleStoneQuantityMin,
        this.config.collectibleStoneQuantityMax,
        hash01(ix, iz + index, 331)
      );
      const root = this.#createStoneCollectible();
      root.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius) + 0.12,
        Math.sin(angle) * radius
      );
      pocketRoot.add(root);
      this.#registerCollectible({
        id: `${pocket.id}:stone:${index}`,
        pocketId: pocket.id,
        resourceId: UNDERGROUND_POCKET_REWARDS.stone.resourceId,
        label: UNDERGROUND_POCKET_REWARDS.stone.label,
        quantity,
        root
      });
    }

    const hasTreasure = hash01(ix, iz, 337) <= this.config.treasureChance;
    if (hasTreasure) {
      const root = this.#createTreasureCollectible();
      const angle = angleOffset + 3.6;
      const radius = contentRadius * (hasHiddenStructure ? 0.27 : 0.4);
      root.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius) + 0.24,
        Math.sin(angle) * radius
      );
      root.rotation.y = angle + Math.PI * 0.5;
      pocketRoot.add(root);
      this.#registerCollectible({
        id: `${pocket.id}:treasure`,
        pocketId: pocket.id,
        resourceId: UNDERGROUND_POCKET_REWARDS.treasure.resourceId,
        label: UNDERGROUND_POCKET_REWARDS.treasure.label,
        quantity: 1,
        root
      });
    }

    const sproutShardCount = hash01(ix, iz, 347) <= this.config.sproutShardChance
      ? deterministicCount(
          this.config.sproutShardMin,
          this.config.sproutShardMax,
          hash01(ix, iz, 349)
        )
      : 0;
    for (let index = 0; index < sproutShardCount; index += 1) {
      const angle = angleOffset + 4.35 + index * 0.7;
      const radius = contentRadius * lerp(0.16, 0.34, hash01(ix + index, iz, 353));
      const root = this.#createShardCollectible();
      root.position.set(
        Math.cos(angle) * radius,
        floorRiseAtRadius(radius) + 0.58,
        Math.sin(angle) * radius
      );
      root.rotation.y = angle;
      pocketRoot.add(root);
      this.#registerCollectible({
        id: `${pocket.id}:sprout-shard:${index}`,
        pocketId: pocket.id,
        resourceId: UNDERGROUND_POCKET_REWARDS.sproutShard.resourceId,
        label: UNDERGROUND_POCKET_REWARDS.sproutShard.label,
        quantity: 1,
        root
      });
    }

    this.pocketSummaries.set(pocket.id, Object.freeze({
      pocketId: pocket.id,
      decorativeRockCount,
      stalagmiteCount,
      crystalClusterCount,
      stalactiteCount,
      wallFormationCount,
      columnFormationCount,
      stoneCount,
      hasHiddenStructure,
      hasTreasure,
      sproutShardCount
    }));
  }

  #verticalSpanAt(pocket, localX, localZ, rootWorldY) {
    const span = undergroundPocketVerticalSpanAt(
      pocket,
      pocket.x + localX,
      pocket.z + localZ
    );
    if (!span) return null;
    return {
      floorY: span.floorY - rootWorldY,
      ceilingY: span.ceilingY - rootWorldY,
      clearance: span.clearance
    };
  }

  #addHiddenStructure(parent, pocket, angle, floorRiseAtRadius) {
    const ruin = new THREE.Group();
    ruin.name = `hidden-ruin-${pocket.ix}-${pocket.iz}`;
    const contentRadius = Number.isFinite(pocket.contentRadius)
      ? pocket.contentRadius
      : pocket.radius;
    const radius = contentRadius * 0.38;
    ruin.position.set(
      Math.cos(angle) * radius,
      floorRiseAtRadius(radius),
      Math.sin(angle) * radius
    );
    ruin.rotation.y = angle + Math.PI * 0.5;

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(this.geometry.pillar, this.material.ancientStone);
      pillar.position.set(side * 0.62, 0.9, 0);
      pillar.rotation.z = side * 0.035;
      pillar.receiveShadow = true;
      ruin.add(pillar);

      const rubble = new THREE.Mesh(this.geometry.pebble, this.material.darkStone);
      rubble.position.set(side * 0.9, 0.13, 0.18);
      rubble.scale.set(1.4, 0.75, 1.1);
      rubble.rotation.y = side * 0.8;
      ruin.add(rubble);
    }

    const lintel = new THREE.Mesh(this.geometry.lintel, this.material.ancientStone);
    lintel.position.set(0, 1.78, 0);
    lintel.rotation.z = 0.025;
    lintel.receiveShadow = true;
    ruin.add(lintel);

    const pedestal = new THREE.Mesh(this.geometry.pedestal, this.material.ancientStone);
    pedestal.position.set(0, 0.24, -0.58);
    pedestal.receiveShadow = true;
    ruin.add(pedestal);

    parent.add(ruin);
  }

  #createStoneCollectible() {
    const root = new THREE.Group();
    for (let index = 0; index < 3; index += 1) {
      const stone = new THREE.Mesh(this.geometry.pebble, this.material.rock);
      stone.position.set((index - 1) * 0.18, index === 1 ? 0.11 : 0, (index % 2) * 0.12);
      stone.rotation.set(index * 0.17, index * 1.7, index * 0.21);
      stone.scale.set(1.1 - index * 0.08, 0.82 + index * 0.07, 1);
      root.add(stone);
    }
    return root;
  }

  #createShardCollectible() {
    const root = new THREE.Group();
    const pedestal = new THREE.Mesh(this.geometry.pedestal, this.material.darkStone);
    pedestal.position.y = -0.34;
    pedestal.scale.set(0.72, 0.48, 0.72);
    root.add(pedestal);

    for (let index = 0; index < 3; index += 1) {
      const shard = new THREE.Mesh(this.geometry.shard, this.material.shard);
      shard.position.set((index - 1) * 0.16, index === 1 ? 0.12 : 0, 0);
      shard.rotation.z = (index - 1) * 0.32;
      shard.rotation.y = index * 0.85;
      shard.scale.set(index === 1 ? 1.05 : 0.72, index === 1 ? 1.45 : 1, index === 1 ? 1.05 : 0.72);
      root.add(shard);
    }
    return root;
  }

  #createTreasureCollectible() {
    const root = new THREE.Group();
    const base = new THREE.Mesh(this.geometry.cache, this.material.ancientStone);
    base.receiveShadow = true;
    root.add(base);

    const lid = new THREE.Mesh(this.geometry.cacheLid, this.material.darkStone);
    lid.position.y = 0.3;
    lid.rotation.z = -0.04;
    root.add(lid);

    const relic = new THREE.Mesh(this.geometry.relic, this.material.treasure);
    relic.position.set(0, 0.62, 0);
    relic.rotation.set(0.35, 0.8, 0.2);
    relic.scale.set(1.15, 1.45, 1.15);
    root.add(relic);
    return root;
  }

  #registerCollectible({ id, pocketId, resourceId, label, quantity, root }) {
    const active = !this.collectedIds.has(id);
    root.visible = active;
    root.userData.undergroundCollectibleId = id;
    root.userData.resourceId = resourceId;
    this.collectibles.set(id, {
      id,
      pocketId,
      resourceId,
      label,
      quantity,
      root,
      active
    });
  }

  #summaryFor(pocketId) {
    const summary = this.pocketSummaries.get(pocketId);
    return summary ? { ...summary } : null;
  }

  #clearPocketPresentations() {
    for (const pocketRoot of this.pocketRoots.values()) {
      pocketRoot.parent?.remove(pocketRoot);
    }
    this.root.clear();
    this.pocketRoots.clear();
    this.pocketSummaries.clear();
    this.collectibles.clear();
  }
}
