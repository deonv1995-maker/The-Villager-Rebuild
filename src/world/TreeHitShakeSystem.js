import * as THREE from 'three';

const SHAKE_DURATION = 0.34;
const SHAKE_AMPLITUDE = 0.095;

export class TreeHitShakeSystem {
  constructor({ treeRenderRegistry = null }) {
    this.treeRenderRegistry = treeRenderRegistry;
    this.active = new Map();
    this.tempPosition = new THREE.Vector3();
    this.tempScale = new THREE.Vector3();
    this.tempBaseQuaternion = new THREE.Quaternion();
    this.tempShakeQuaternion = new THREE.Quaternion();
    this.tempResultQuaternion = new THREE.Quaternion();
    this.tempMatrix = new THREE.Matrix4();
  }

  hit(treeId, playerPosition, obstacle) {
    if (!this.treeRenderRegistry?.getTreeRenderHandles || !obstacle) return false;
    const handles = this.treeRenderRegistry.getTreeRenderHandles(treeId);
    if (!handles.length) return false;

    let state = this.active.get(treeId);
    if (!state) {
      state = {
        treeId,
        handles: handles.map(handle => {
          const baseMatrix = new THREE.Matrix4();
          handle.mesh.getMatrixAt(handle.index, baseMatrix);
          return { handle, baseMatrix };
        }),
        axis: new THREE.Vector3(1, 0, 0),
        startedAt: 0
      };
      this.active.set(treeId, state);
    }

    const dx = obstacle.x - (playerPosition?.x ?? obstacle.x);
    const dz = obstacle.z - (playerPosition?.z ?? obstacle.z - 1);
    const length = Math.max(0.001, Math.hypot(dx, dz));
    state.axis.set(dz / length, 0, -dx / length).normalize();
    state.startedAt = performance.now() * 0.001;
    return true;
  }

  update() {
    if (!this.active.size) return;
    const now = performance.now() * 0.001;

    for (const [treeId, state] of this.active) {
      const progress = (now - state.startedAt) / SHAKE_DURATION;
      if (progress >= 1) {
        this.#restore(state);
        this.active.delete(treeId);
        continue;
      }

      const decay = (1 - progress) ** 2;
      const angle = Math.sin(progress * Math.PI * 5) * decay * SHAKE_AMPLITUDE;
      this.tempShakeQuaternion.setFromAxisAngle(state.axis, angle);

      for (const entry of state.handles) {
        entry.baseMatrix.decompose(this.tempPosition, this.tempBaseQuaternion, this.tempScale);
        this.tempResultQuaternion.copy(this.tempShakeQuaternion).multiply(this.tempBaseQuaternion);
        this.tempMatrix.compose(this.tempPosition, this.tempResultQuaternion, this.tempScale);
        entry.handle.mesh.setMatrixAt(entry.handle.index, this.tempMatrix);
        entry.handle.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  clear(treeId, restore = false) {
    const state = this.active.get(treeId);
    if (!state) return false;
    if (restore) this.#restore(state);
    this.active.delete(treeId);
    return true;
  }

  #restore(state) {
    for (const entry of state.handles) {
      entry.handle.mesh.setMatrixAt(entry.handle.index, entry.baseMatrix);
      entry.handle.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
