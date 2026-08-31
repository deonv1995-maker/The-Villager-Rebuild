import * as THREE from 'three';
import { HARVESTABLE_DEFINITIONS } from '../data/HarvestDefinitions.js';
import { HarvestHitFeedback } from './HarvestHitFeedback.js';
import { TreeHitShakeSystem } from './TreeHitShakeSystem.js';

const TREE_LABEL_PATTERN = /^forest-tree-(\d+)$/;

export class TreeHarvestSystem {
  constructor({ group, terrain, collision, gatherables, treeRenderRegistry = null }) {
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.gatherables = gatherables;
    this.treeRenderRegistry = treeRenderRegistry ?? terrain?.chunks ?? null;
    this.definition = HARVESTABLE_DEFINITIONS.forestTree;
    this.target = null;
    this.choppedCount = 0;
    this.treeBatches = this.treeRenderRegistry ? new Map() : this.#collectTreeBatches();
    this.treeVariantCount = Math.max(1, this.treeBatches.size);
    this.trees = this.#collectTrees();
    this.hitFeedback = new HarvestHitFeedback({ group });
    this.treeShake = new TreeHitShakeSystem({ treeRenderRegistry: this.treeRenderRegistry });
    this.#createIndicator();
  }

  hasChoppedTree() {
    return this.choppedCount > 0;
  }

  update(playerPosition, enabled = true) {
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
    this.#hideTreeInstance(tree);
    this.collision.removeObstacle(tree.obstacle);
    this.#createStump(tree);
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
        return {
          treeId,
          variantIndex: treeId % this.treeVariantCount,
          instanceIndex: Math.floor(treeId / this.treeVariantCount),
          obstacle,
          hits: 0,
          active: true
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.treeId - right.treeId);
  }

  #hideTreeInstance(tree) {
    this.treeShake.clear(tree.treeId);
    const hiddenMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(tree.obstacle.x, -1000, tree.obstacle.z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.0001, 0.0001, 0.0001)
    );

    if (this.treeRenderRegistry) {
      for (const handle of this.treeRenderRegistry.getTreeRenderHandles(tree.treeId)) {
        handle.mesh.setMatrixAt(handle.index, hiddenMatrix);
        handle.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    const batches = this.treeBatches.get(tree.variantIndex) ?? [];
    for (const batch of batches) {
      if (tree.instanceIndex < 0 || tree.instanceIndex >= batch.count) continue;
      batch.setMatrixAt(tree.instanceIndex, hiddenMatrix);
      batch.instanceMatrix.needsUpdate = true;
    }
  }

  #createStump(tree) {
    const radius = Math.max(0.22, tree.obstacle.radius * 0.7);
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius, 0.34, 7),
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
