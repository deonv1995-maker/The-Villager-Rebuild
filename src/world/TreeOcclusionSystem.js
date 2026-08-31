import * as THREE from 'three';

const TREE_LABEL_PATTERN = /^forest-tree-(\d+)$/;
const TREE_BATCH_PATTERN = /^forest-tree-batch-(\d+)-(\d+)$/;
const TREE_INTERACTION_OPAQUE_RADIUS = 3.1;

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
  constructor({ group, collision, treeRenderRegistry = null, maxFadedTrees = 8 }) {
    this.group = group;
    this.collision = collision;
    this.treeRenderRegistry = treeRenderRegistry;
    this.maxFadedTrees = maxFadedTrees;
    this.treeBatches = this.treeRenderRegistry ? new Map() : this.#collectTreeBatches();
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
    if (!playerPosition || !camera || this.fadeBatches.size === 0) return;

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
      const playerDistance = Math.hypot(
        tree.obstacle.x - playerPosition.x,
        tree.obstacle.z - playerPosition.z
      );
      if (playerDistance <= TREE_INTERACTION_OPAQUE_RADIUS) continue;

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
    const slotsByTemplate = new Map();

    for (const tree of selected) {
      const handles = this.#getRenderHandles(tree);
      const originals = [];
      for (const handle of handles) {
        const fade = this.fadeBatches.get(handle.templateKey);
        if (!fade || handle.index < 0 || handle.index >= handle.mesh.count) continue;
        const slot = slotsByTemplate.get(handle.templateKey) ?? 0;
        if (slot >= this.maxFadedTrees) continue;

        const original = new THREE.Matrix4();
        handle.mesh.getMatrixAt(handle.index, original);
        originals.push({ mesh: handle.mesh, index: handle.index, matrix: original });
        handle.mesh.setMatrixAt(handle.index, this.hiddenMatrix);
        handle.mesh.instanceMatrix.needsUpdate = true;

        fade.setMatrixAt(slot, original);
        fade.count = Math.max(fade.count, slot + 1);
        fade.instanceMatrix.needsUpdate = true;
        slotsByTemplate.set(handle.templateKey, slot + 1);
      }

      if (originals.length > 0) this.previousHidden.push({ treeId: tree.treeId, originals });
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

  #getRenderHandles(tree) {
    if (this.treeRenderRegistry) return this.treeRenderRegistry.getTreeRenderHandles(tree.treeId);
    return (this.treeBatches.get(tree.variantIndex) ?? [])
      .map((mesh, meshIndex) => ({
        mesh,
        index: tree.instanceIndex,
        templateKey: `${tree.variantIndex}:${meshIndex}`
      }))
      .filter(handle => handle.mesh);
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
    if (this.treeRenderRegistry) {
      for (const template of this.treeRenderRegistry.getTreeTemplates().values()) {
        result.set(template.key, this.#createFadeBatch(template.geometry, template.material, template.key));
      }
      return result;
    }

    for (const [variantIndex, opaqueBatches] of this.treeBatches) {
      opaqueBatches.forEach((opaque, meshIndex) => {
        if (!opaque) return;
        const key = `${variantIndex}:${meshIndex}`;
        result.set(key, this.#createFadeBatch(opaque.geometry, opaque.material, key));
      });
    }
    return result;
  }

  #createFadeBatch(geometry, sourceMaterial, key) {
    const material = Array.isArray(sourceMaterial)
      ? sourceMaterial.map(item => this.#createFadeMaterial(item))
      : this.#createFadeMaterial(sourceMaterial);
    const fade = new THREE.InstancedMesh(geometry, material, this.maxFadedTrees);
    fade.name = `forest-tree-occlusion-fade-${key.replace(':', '-')}`;
    fade.count = 0;
    fade.castShadow = false;
    fade.receiveShadow = false;
    fade.renderOrder = 3;
    fade.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(fade);
    return fade;
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
        original.mesh.setMatrixAt(original.index, original.matrix);
        original.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.previousHidden.length = 0;
  }

  #clearFadeBatches() {
    for (const fade of this.fadeBatches.values()) {
      fade.count = 0;
      fade.instanceMatrix.needsUpdate = true;
    }
  }

  #refreshFadeBounds() {
    for (const fade of this.fadeBatches.values()) {
      if (fade.count === 0) continue;
      fade.boundingBox = null;
      fade.boundingSphere = null;
      fade.computeBoundingSphere();
    }
  }
}
