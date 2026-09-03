import * as THREE from 'three';
import { HARVESTABLE_DEFINITIONS } from '../data/HarvestDefinitions.js';
import { HarvestHitFeedback } from './HarvestHitFeedback.js';
import { TreeHitShakeSystem } from './TreeHitShakeSystem.js';
import { TreeRegrowthPresentation } from './TreeRegrowthPresentation.js';

const TREE_LABEL_PATTERN = /^forest-tree-(\d+)$/;
const MAX_REGROW_STEP_SECONDS = 0.25;
const PLAYER_REGROW_CLEARANCE = 1.15;
const BUILT_REGROW_BLOCKERS = new Set(['placed-log', 'campfire']);
const BLOCKED_COMPLETION_EPSILON_SECONDS = 0.05;
const STUMP_LOG_DISTANCE = 0.82;
const STUMP_LOG_ANGLE_STEP = Math.PI * (3 - Math.sqrt(5));

export class TreeHarvestSystem {
  constructor({ group, terrain, collision, gatherables, treeRenderRegistry = null, now = null }) {
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.gatherables = gatherables;
    this.treeRenderRegistry = treeRenderRegistry ?? terrain?.chunks ?? null;
    this.definition = HARVESTABLE_DEFINITIONS.forestTree;
    this.now = typeof now === 'function'
      ? now
      : () => globalThis.performance?.now?.() ?? Date.now();
    this.lastRegrowthUpdateAt = this.now();
    this.target = null;
    this.choppedCount = 0;
    this.treeBatches = this.treeRenderRegistry ? new Map() : this.#collectTreeBatches();
    this.treeVariantCount = Math.max(1, this.treeBatches.size);
    this.trees = this.#collectTrees();
    this.hitFeedback = new HarvestHitFeedback({ group });
    this.treeShake = new TreeHitShakeSystem({ treeRenderRegistry: this.treeRenderRegistry });
    this.regrowthPresentation = new TreeRegrowthPresentation({
      group,
      terrain,
      treeRenderRegistry: this.treeRenderRegistry,
      timing: this.definition.regrowth
    });
    this.#createIndicator();
  }

  hasChoppedTree() {
    return this.choppedCount > 0;
  }

  captureRegrowthState() {
    return this.trees
      .filter(tree => !tree.active)
      .map(tree => ({
        treeId: tree.treeId,
        remainingSeconds: Math.max(0, Number(tree.regrowRemaining) || 0),
        stumpRemoved: Boolean(tree.stumpRemoved),
        cleared: Boolean(tree.cleared)
      }));
  }

  restoreRegrowthState(state) {
    const savedById = new Map(
      (Array.isArray(state) ? state : [])
        .filter(entry => Number.isInteger(entry?.treeId))
        .map(entry => [entry.treeId, entry])
    );

    for (const tree of this.trees) {
      if (tree.active) continue;
      const saved = savedById.get(tree.treeId);
      tree.cleared = Boolean(saved?.cleared ?? saved?.stumpRemoved);
      tree.stumpRemoved = tree.cleared || Boolean(saved?.stumpRemoved);

      if (tree.cleared) {
        tree.regrowRemaining = 0;
        this.#removeStump(tree);
        this.regrowthPresentation.removeSprout(tree);
        continue;
      }

      const remaining = Number(saved?.remainingSeconds);
      tree.regrowRemaining = Number.isFinite(remaining)
        ? Math.min(this.definition.regrowSeconds, Math.max(0, remaining))
        : this.definition.regrowSeconds;
      if (!tree.regrowthVisual) this.regrowthPresentation.begin(tree);
      this.#syncRegrowthGrounding(tree);
      this.regrowthPresentation.update(tree, this.#regrowthAge(tree));
    }
    this.lastRegrowthUpdateAt = this.now();
  }

  update(playerPosition, enabled = true) {
    this.#advanceRegrowth(playerPosition);
    this.hitFeedback.update();
    this.treeShake.update();
    if (!enabled) {
      this.target = null;
      this.indicator.visible = false;
      return null;
    }

    let nearest = null;
    let nearestDistanceSq = this.definition.interactionRadius ** 2;

    for (const tree of this.trees) {
      if (!tree.active) continue;
      const dx = tree.obstacle.x - playerPosition.x;
      const dz = tree.obstacle.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = tree;
      nearestDistanceSq = distanceSq;
    }

    this.target = nearest;
    this.indicator.visible = Boolean(nearest);
    if (nearest) {
      this.indicator.position.set(
        nearest.obstacle.x,
        this.terrain.heightAt(nearest.obstacle.x, nearest.obstacle.z) + 0.035,
        nearest.obstacle.z
      );
    }
    return this.getTarget();
  }

  getTarget() {
    if (!this.target) return null;
    return {
      type: 'tree',
      label: this.definition.label,
      icon: 'axe',
      actionLabel: 'Chop tree',
      position: new THREE.Vector3(
        this.target.obstacle.x,
        this.terrain.heightAt(this.target.obstacle.x, this.target.obstacle.z),
        this.target.obstacle.z
      )
    };
  }

  getStumpTarget(playerPosition) {
    const tree = this.#nearestStump(playerPosition);
    if (!tree) return null;
    return {
      type: 'stump',
      treeId: tree.treeId,
      label: 'Stump',
      icon: 'shovel',
      actionLabel: 'Dig out stump',
      position: new THREE.Vector3(
        tree.collisionTemplate.x,
        this.terrain.heightAt(tree.collisionTemplate.x, tree.collisionTemplate.z),
        tree.collisionTemplate.z
      )
    };
  }

  removeStump(playerPosition) {
    const tree = this.#nearestStump(playerPosition);
    if (!tree) return null;

    const position = new THREE.Vector3(
      tree.collisionTemplate.x,
      this.terrain.heightAt(tree.collisionTemplate.x, tree.collisionTemplate.z),
      tree.collisionTemplate.z
    );
    tree.stumpRemoved = true;
    tree.cleared = true;
    tree.regrowRemaining = 0;
    this.#removeStump(tree);
    this.regrowthPresentation.removeSprout(tree);

    const angle = (tree.treeId * STUMP_LOG_ANGLE_STEP + 0.65) % (Math.PI * 2);
    this.gatherables.spawn(this.definition.dropResourceId, {
      x: tree.collisionTemplate.x + Math.cos(angle) * STUMP_LOG_DISTANCE,
      z: tree.collisionTemplate.z + Math.sin(angle) * STUMP_LOG_DISTANCE,
      quantity: 1,
      yaw: angle + Math.PI / 2
    });

    return {
      removed: true,
      treeId: tree.treeId,
      label: 'Stump',
      position,
      dropResourceId: this.definition.dropResourceId,
      dropCount: 1
    };
  }

  chop(playerPosition) {
    this.update(playerPosition, true);
    if (!this.target) return null;

    const tree = this.target;
    tree.hits += 1;
    const remainingHits = Math.max(0, this.definition.hitsRequired - tree.hits);
    const position = new THREE.Vector3(
      tree.obstacle.x,
      this.terrain.heightAt(tree.obstacle.x, tree.obstacle.z),
      tree.obstacle.z
    );
    this.hitFeedback.emit(position, 'wood');

    if (remainingHits > 0) {
      this.treeShake.hit(tree.treeId, playerPosition, tree.obstacle);
      return {
        chopped: false,
        remainingHits,
        label: this.definition.label,
        position
      };
    }

    tree.active = false;
    tree.regrowRemaining = this.definition.regrowSeconds;
    tree.stumpRemoved = false;
    tree.cleared = false;
    this.#hideTreeInstance(tree);
    this.collision.removeObstacle(tree.obstacle);
    tree.stump = this.#createStump(tree);
    this.regrowthPresentation.begin(tree);
    this.#syncRegrowthGrounding(tree);
    this.#spawnDrops(tree);
    this.choppedCount += 1;
    this.target = null;
    this.indicator.visible = false;

    return {
      chopped: true,
      remainingHits: 0,
      label: this.definition.label,
      position,
      dropResourceId: this.definition.dropResourceId,
      dropCount: this.definition.dropCount
    };
  }

  #advanceRegrowth(playerPosition) {
    const now = this.now();
    const elapsed = Math.min(
      MAX_REGROW_STEP_SECONDS,
      Math.max(0, (now - this.lastRegrowthUpdateAt) / 1000)
    );
    this.lastRegrowthUpdateAt = now;
    if (elapsed <= 0) return;

    for (const tree of this.trees) {
      if (tree.active || tree.cleared) continue;
      tree.regrowRemaining = Math.max(0, tree.regrowRemaining - elapsed);

      const ready = tree.regrowRemaining <= 0;
      const canComplete = !ready || this.#canRegrow(tree, playerPosition);
      const visualAge = ready && !canComplete
        ? Math.max(0, this.definition.regrowSeconds - BLOCKED_COMPLETION_EPSILON_SECONDS)
        : this.#regrowthAge(tree);
      this.regrowthPresentation.update(tree, visualAge);

      if (!ready || !canComplete) continue;
      this.#regrowTree(tree);
    }
  }

  #regrowthAge(tree) {
    return THREE.MathUtils.clamp(
      this.definition.regrowSeconds - tree.regrowRemaining,
      0,
      this.definition.regrowSeconds
    );
  }

  #canRegrow(tree, playerPosition) {
    const template = tree.collisionTemplate;
    if (playerPosition) {
      const dx = template.x - playerPosition.x;
      const dz = template.z - playerPosition.z;
      const clearance = Math.max(PLAYER_REGROW_CLEARANCE, template.radius + 0.45);
      if (dx * dx + dz * dz < clearance * clearance) return false;
    }

    return this.collision.isCircleClear(template.x, template.z, template.radius, {
      ignore: obstacle => !BUILT_REGROW_BLOCKERS.has(obstacle.type)
    });
  }

  #regrowTree(tree) {
    this.#removeStump(tree);
    this.#restoreTreeInstance(tree);
    this.regrowthPresentation.removeSprout(tree);
    tree.obstacle = this.collision.addObstacle({ ...tree.collisionTemplate });
    tree.hits = 0;
    tree.active = true;
    tree.regrowRemaining = 0;
    tree.stumpRemoved = false;
    tree.cleared = false;
  }

  #nearestStump(playerPosition) {
    if (!playerPosition) return null;
    let nearest = null;
    let nearestDistanceSq = this.definition.interactionRadius ** 2;
    for (const tree of this.trees) {
      if (tree.active || tree.cleared || tree.stumpRemoved || !tree.stump) continue;
      const dx = tree.collisionTemplate.x - playerPosition.x;
      const dz = tree.collisionTemplate.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = tree;
      nearestDistanceSq = distanceSq;
    }
    return nearest;
  }

  #syncRegrowthGrounding(tree) {
    const root = tree.regrowthVisual?.root;
    if (!root) return;
    const x = tree.collisionTemplate.x;
    const z = tree.collisionTemplate.z;
    root.position.y = this.terrain.heightAt(x, z) + 0.34;
  }

  #collectTreeBatches() {
    const batches = new Map();
    this.group.traverse(object => {
      if (!object.isInstancedMesh) return;
      const match = /^forest-tree-batch-(\d+)-\d+$/.exec(object.name);
      if (!match) return;
      const variantIndex = Number(match[1]);
      const list = batches.get(variantIndex) ?? [];
      list.push(object);
      batches.set(variantIndex, list);
    });
    return batches;
  }

  #collectTrees() {
    return this.collision.getObstaclesByType('tree')
      .map(obstacle => {
        const match = TREE_LABEL_PATTERN.exec(obstacle.label ?? '');
        if (!match) return null;
        const treeId = Number(match[1]);
        const tree = {
          treeId,
          variantIndex: treeId % this.treeVariantCount,
          instanceIndex: Math.floor(treeId / this.treeVariantCount),
          obstacle,
          collisionTemplate: {
            x: obstacle.x,
            z: obstacle.z,
            radius: obstacle.radius,
            type: obstacle.type,
            label: obstacle.label,
            bottomY: obstacle.bottomY,
            topY: obstacle.topY,
            standable: obstacle.standable,
            supportRadius: obstacle.supportRadius,
            supportY: obstacle.supportY,
            supportOverridesBase: obstacle.supportOverridesBase,
            supportOverrideTolerance: obstacle.supportOverrideTolerance,
            stepHeight: obstacle.stepHeight
          },
          renderState: [],
          hits: 0,
          active: true,
          regrowRemaining: 0,
          stump: null,
          stumpRemoved: false,
          cleared: false,
          regrowthVisual: null
        };
        tree.renderState = this.#captureTreeRenderState(tree);
        return tree;
      })
      .filter(Boolean)
      .sort((left, right) => left.treeId - right.treeId);
  }

  #captureTreeRenderState(tree) {
    const entries = [];
    if (this.treeRenderRegistry?.getTreeRenderHandles) {
      for (const handle of this.treeRenderRegistry.getTreeRenderHandles(tree.treeId)) {
        const matrix = new THREE.Matrix4();
        handle.mesh.getMatrixAt(handle.index, matrix);
        entries.push({ mesh: handle.mesh, index: handle.index, matrix });
      }
      return entries;
    }

    const batches = this.treeBatches.get(tree.variantIndex) ?? [];
    for (const batch of batches) {
      if (tree.instanceIndex < 0 || tree.instanceIndex >= batch.count) continue;
      const matrix = new THREE.Matrix4();
      batch.getMatrixAt(tree.instanceIndex, matrix);
      entries.push({ mesh: batch, index: tree.instanceIndex, matrix });
    }
    return entries;
  }

  #hideTreeInstance(tree) {
    this.treeShake.clear(tree.treeId);
    this.regrowthPresentation.hideTree(tree);
  }

  #restoreTreeInstance(tree) {
    this.regrowthPresentation.restoreFullTree(tree);
  }

  #createStump(tree) {
    const radius = Math.max(0.22, tree.obstacle.radius);
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.34, 7),
      new THREE.MeshStandardMaterial({ color: 0x6f472a, roughness: 1, flatShading: true })
    );
    stump.name = `chopped-tree-stump-${tree.treeId}`;
    stump.position.set(
      tree.obstacle.x,
      this.terrain.heightAt(tree.obstacle.x, tree.obstacle.z) + 0.17,
      tree.obstacle.z
    );
    stump.castShadow = true;
    stump.receiveShadow = true;
    if (this.treeRenderRegistry?.addObjectAt) {
      this.treeRenderRegistry.addObjectAt(stump, tree.obstacle.x, tree.obstacle.z);
    } else {
      this.group.add(stump);
    }
    return stump;
  }

  #removeStump(tree) {
    if (!tree.stump) return;
    tree.stump.parent?.remove(tree.stump);
    tree.stump.geometry?.dispose?.();
    tree.stump.material?.dispose?.();
    tree.stump = null;
  }

  #spawnDrops(tree) {
    const count = this.definition.dropCount;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + 0.35;
      const distance = 0.68 + (index % 2) * 0.16;
      this.gatherables.spawn(this.definition.dropResourceId, {
        x: tree.obstacle.x + Math.cos(angle) * distance,
        z: tree.obstacle.z + Math.sin(angle) * distance,
        quantity: 1,
        yaw: angle + Math.PI / 2
      });
    }
  }

  #createIndicator() {
    this.indicator = new THREE.Mesh(
      new THREE.RingGeometry(0.66, 0.82, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0b05a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.indicator.name = 'tree-chop-target-indicator';
    this.indicator.rotation.x = -Math.PI / 2;
    this.indicator.visible = false;
    this.group.add(this.indicator);
  }
}
