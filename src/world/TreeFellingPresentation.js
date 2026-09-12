import * as THREE from 'three';

export const TREE_FELLING_PRESENTATION = Object.freeze({
  fallSeconds: 1.08,
  settleSeconds: 0.24,
  impactAngle: Math.PI * 0.475
});

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const gravityEase = value => {
  const t = clamp01(value);
  return t * t * t;
};

export class TreeFellingPresentation {
  constructor({ group, terrain, treeRenderRegistry = null, now = null } = {}) {
    if (!group || !terrain) throw new Error('TreeFellingPresentation requires group and terrain');
    this.group = group;
    this.terrain = terrain;
    this.treeRenderRegistry = treeRenderRegistry;
    this.now = typeof now === 'function'
      ? now
      : () => globalThis.performance?.now?.() ?? Date.now();
    this.states = new Map();
    this.identityQuaternion = new THREE.Quaternion();
    this.tempMatrix = new THREE.Matrix4();
    this.inversePivotMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
  }

  begin(tree, rangerPosition = null) {
    if (!tree || !Number.isInteger(tree.treeId)) return null;
    this.cancel(tree.treeId);

    const x = tree.collisionTemplate?.x ?? tree.obstacle?.x ?? 0;
    const z = tree.collisionTemplate?.z ?? tree.obstacle?.z ?? 0;
    const y = this.terrain.heightAt(x, z);
    const pivot = new THREE.Group();
    pivot.name = `falling-tree-${tree.treeId}`;
    pivot.position.set(x, y, z);

    this.inversePivotMatrix.makeTranslation(-x, -y, -z);
    for (const entry of tree.renderState ?? []) {
      if (!entry?.mesh?.geometry || !entry?.matrix) continue;
      const mesh = new THREE.Mesh(entry.mesh.geometry, entry.mesh.material);
      mesh.name = `falling-tree-${tree.treeId}-part`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(this.inversePivotMatrix).multiply(entry.matrix);
      mesh.matrixWorldNeedsUpdate = true;
      pivot.add(mesh);
    }

    if (pivot.children.length === 0) this.#addFallbackTree(pivot, tree);

    const direction = this.#fallDirection(tree, rangerPosition);
    const targetDirection = new THREE.Vector3(direction.x, 0.035, direction.z).normalize();
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(UP, targetDirection);
    const impactQuaternion = new THREE.Quaternion().slerpQuaternions(
      this.identityQuaternion,
      targetQuaternion,
      TREE_FELLING_PRESENTATION.impactAngle / (Math.PI / 2)
    );

    if (this.treeRenderRegistry?.addObjectAt) {
      this.treeRenderRegistry.addObjectAt(pivot, x, z);
    } else {
      this.group.add(pivot);
    }

    const state = {
      treeId: tree.treeId,
      pivot,
      impactQuaternion,
      startedAt: this.now(),
      settled: false
    };
    this.states.set(tree.treeId, state);
    return state;
  }

  update() {
    if (this.states.size === 0) return [];
    const now = this.now();
    const completed = [];
    const fallMs = TREE_FELLING_PRESENTATION.fallSeconds * 1000;
    const settleMs = TREE_FELLING_PRESENTATION.settleSeconds * 1000;

    for (const state of this.states.values()) {
      const elapsed = Math.max(0, now - state.startedAt);
      const fallProgress = clamp01(elapsed / fallMs);
      const eased = gravityEase(fallProgress);
      state.pivot.quaternion.slerpQuaternions(
        this.identityQuaternion,
        state.impactQuaternion,
        eased
      );

      if (fallProgress < 1) continue;
      if (!state.settled) {
        state.settled = true;
        state.pivot.position.y -= 0.025;
      }
      if (elapsed < fallMs + settleMs) continue;

      completed.push(state.treeId);
    }

    for (const treeId of completed) this.cancel(treeId);
    return completed;
  }

  cancel(treeId) {
    const state = this.states.get(treeId);
    if (!state) return false;
    state.pivot?.parent?.remove(state.pivot);
    this.states.delete(treeId);
    return true;
  }

  has(treeId) {
    return this.states.has(treeId);
  }

  #fallDirection(tree, rangerPosition) {
    const x = tree.collisionTemplate?.x ?? tree.obstacle?.x ?? 0;
    const z = tree.collisionTemplate?.z ?? tree.obstacle?.z ?? 0;
    let dx = Number.isFinite(rangerPosition?.x) ? x - rangerPosition.x : 0;
    let dz = Number.isFinite(rangerPosition?.z) ? z - rangerPosition.z : 0;
    if (dx * dx + dz * dz < 0.01) {
      const angle = (tree.treeId * 2.399963229728653 + 0.73) % (Math.PI * 2);
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    }
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length };
  }

  #addFallbackTree(pivot, tree) {
    const radius = Math.max(0.24, tree.collisionTemplate?.radius ?? tree.obstacle?.radius ?? 0.4);
    const height = 4.6 + (tree.treeId % 3) * 0.65;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.62, radius, height, 7),
      new THREE.MeshStandardMaterial({ color: 0x6f472a, roughness: 1, flatShading: true })
    );
    trunk.position.y = height * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    pivot.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(height * 0.28, 1),
      new THREE.MeshStandardMaterial({ color: 0x5f8c46, roughness: 1, flatShading: true })
    );
    leaves.position.y = height * 0.82;
    leaves.scale.set(1.05, 1.25, 1.05);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    pivot.add(leaves);
  }
}
