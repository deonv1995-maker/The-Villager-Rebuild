import * as THREE from 'three';

const TREE_LABEL_PATTERN = /^forest-tree-(\d+)$/;
const TREE_BATCH_PATTERN = /^forest-tree-batch-(\d+)-(\d+)$/;

const distanceToSegment2D = (x, z, x1, z1, x2, z2) => {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq <= 0.0001) return { distance: Math.hypot(x - x1, z - z1), t: 0 };
  const t = THREE.MathUtils.clamp(((x - x1) * vx + (z - z1) * vz) / lengthSq, 0, 1);
  const px = x1 + vx * t;
  const pz = z1 + vz * t;
  return { distance: Math.hypot(x - px, z - pz), t };
};

export class TreeOcclusionSystem {
  constructor({ group, collision, maxFadedTrees = 8 }) {
    this.group = group;
    this.collision = collision;
    this.maxFadedTrees = maxFadedTrees;
    this.treeBatches = this.#collectTreeBatches();
    this.treeVariantCount = Math.max(1, this.treeBatches.size);
    this.fadeBatches = this.#createFadeBatches();
    this.previousHidden = [];
    this.cameraPosition = new THREE.Vector3();
    this.hiddenMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -1000, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.0001, 0.0001, 0.0001)
    );
  }

  update(playerPosition, camera) {
    if (!playerPosition || !camera || this.treeBatches.size === 0) return;

    const activeTrees = this.#collectActiveTrees();
    const activeIds = new Set(activeTrees.map(tree => tree.treeId));
    this.#restorePreviousOpaqueTrees(activeIds);
    this.#clearFadeBatches();

    camera.getWorldPosition(this.cameraPosition);
    const cameraDistance = Math.hypot(
      playerPosition.x - this.cameraPosition.x,
      playerPosition.z - this.cameraPosition.z
    );
    if (cameraDistance < 1.5) return;

    const candidates = [];
    for (const tree of activeTrees) {
      const line = distanceToSegment2D(
        tree.obstacle.x,
        tree.obstacle.z,
        this.cameraPosition.x,
        this.cameraPosition.z,
        playerPosition.x,
        playerPosition.z
      );
      if (line.t <= 0.035 || line.t >= 0.985) continue;

      const inferredScale = Math.max(0.9, (tree.obstacle.radius - 0.34) / 0.15);
      const canopyRadius = Math.max(2.35, inferredScale * 1.85);
      if (line.distance > canopyRadius) continue;

      candidates.push({
        ...tree,
        score: line.distance / canopyRadius + Math.abs(line.t - 0.52) * 0.06
      });
    }

    candidates.sort((left, right) => left.score - right.score);
    const selected = candidates.slice(0, this.maxFadedTrees);
    const slotsByVariant = new Map();

    for (const tree of selected) {
      const opaqueBatches = this.treeBatches.get(tree.variantIndex) ?? [];
      const fadeBatches = this.fadeBatches.get(tree.variantIndex) ?? [];
      const slot = slotsByVariant.get(tree.variantIndex) ?? 0;
      const originals = [];

      for (let meshIndex = 0; meshIndex < opaqueBatches.length; meshIndex += 1) {
        const opaque = opaqueBatches[meshIndex];
        const fade = fadeBatches[meshIndex];
        if (!fade || tree.instanceIndex < 0 || tree.instanceIndex >= opaque.count) continue;

        const original = new THREE.Matrix4();
        opaque.getMatrixAt(tree.instanceIndex, original);
        originals.push({ opaque, matrix: original });
        opaque.setMatrixAt(tree.instanceIndex, this.hiddenMatrix);
        opaque.instanceMatrix.needsUpdate = true;

        fade.setMatrixAt(slot, original);
        fade.count = Math.max(fade.count, slot + 1);
        fade.instanceMatrix.needsUpdate = true;
      }

      if (originals.length > 0) {
        this.previousHidden.push({ treeId: tree.treeId, originals });
        slotsByVariant.set(tree.variantIndex, slot + 1);
      }
    }

    this.#refreshFadeBounds();
  }

  #collectActiveTrees() {
    return this.collision.getObstaclesByType('tree')
      .map(obstacle => {
        const match = TREE_LABEL_PATTERN.exec(obstacle.label ?? '');
        if (!match) return null;
        const treeId = Number(match[1]);
        return {
          treeId,
          variantIndex: treeId % this.treeVariantCount,
          instanceIndex: Math.floor(treeId / this.treeVariantCount),
          obstacle
        };
      })
      .filter(Boolean);
  }

  #collectTreeBatches() {
    const batches = new Map();
    this.group.traverse(object => {
      if (!object.isInstancedMesh) return;
      const match = TREE_BATCH_PATTERN.exec(object.name);
      if (!match) return;
      const variantIndex = Number(match[1]);
      const meshIndex = Number(match[2]);
      const list = batches.get(variantIndex) ?? [];
      list[meshIndex] = object;
      batches.set(variantIndex, list);
    });
    return batches;
  }

  #createFadeBatches() {
    const result = new Map();
    for (const [variantIndex, opaqueBatches] of this.treeBatches) {
      const fadeBatches = [];
      opaqueBatches.forEach((opaque, meshIndex) => {
        if (!opaque) return;
        const material = Array.isArray(opaque.material)
          ? opaque.material.map(item => this.#createFadeMaterial(item))
          : this.#createFadeMaterial(opaque.material);
        const fade = new THREE.InstancedMesh(opaque.geometry, material, this.maxFadedTrees);
        fade.name = `forest-tree-occlusion-fade-${variantIndex}-${meshIndex}`;
        fade.count = 0;
        fade.castShadow = false;
        fade.receiveShadow = false;
        fade.renderOrder = 3;
        fade.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(fade);
        fadeBatches[meshIndex] = fade;
      });
      result.set(variantIndex, fadeBatches);
    }
    return result;
  }

  #createFadeMaterial(source) {
    const material = source.clone();
    material.transparent = true;
    material.opacity = 0.2;
    material.depthWrite = false;
    material.premultipliedAlpha = false;
    return material;
  }

  #restorePreviousOpaqueTrees(activeIds) {
    for (const entry of this.previousHidden) {
      if (!activeIds.has(entry.treeId)) continue;
      for (const original of entry.originals) {
        original.opaque.setMatrixAt(
          Math.floor(entry.treeId / this.treeVariantCount),
          original.matrix
        );
        original.opaque.instanceMatrix.needsUpdate = true;
      }
    }
    this.previousHidden.length = 0;
  }

  #clearFadeBatches() {
    for (const fadeBatches of this.fadeBatches.values()) {
      for (const fade of fadeBatches) {
        if (!fade) continue;
        fade.count = 0;
        fade.instanceMatrix.needsUpdate = true;
      }
    }
  }

  #refreshFadeBounds() {
    for (const fadeBatches of this.fadeBatches.values()) {
      for (const fade of fadeBatches) {
        if (!fade || fade.count === 0) continue;
        fade.boundingBox = null;
        fade.boundingSphere = null;
        fade.computeBoundingSphere();
      }
    }
  }
}
