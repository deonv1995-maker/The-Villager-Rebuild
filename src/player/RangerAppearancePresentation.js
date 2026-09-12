import * as THREE from 'three';

const QUIVER_NODE_NAME = 'Ranger_Quiver';
const CAPE_NODE_NAME = 'Ranger_Cape';
const MAX_EXPECTED_SPEED = 8;
const MAX_VERTICAL_SPEED = 8;
const MAX_TURN_RATE = 6;
const CAPE_BOUNDS_MARGIN = 0.22;

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

function shortestAngleDelta(from, to) {
  return THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

export class RangerAppearancePresentation {
  constructor({ player }) {
    this.player = player;
    this.model = player?.model ?? null;
    this.cape = null;
    this.capeGeometry = null;
    this.capePositions = null;
    this.baseCapePositions = null;
    this.capeTopY = 0;
    this.capeHeight = 1;
    this.capeHalfWidth = 1;
    this.elapsed = 0;
    this.trail = 0;
    this.verticalLag = 0;
    this.sideLag = 0;
    this.lastPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.lastYaw = this.player?.root?.rotation?.y ?? 0;

    this.player?.getPosition?.(this.lastPosition);
    this.#removeUnusedQuiver();
    this.#prepareCape();
  }

  update(dt) {
    if (!this.capePositions || !this.baseCapePositions || !Number.isFinite(dt) || dt <= 0) return;

    const safeDt = THREE.MathUtils.clamp(dt, 1 / 240, 1 / 20);
    this.player?.getPosition?.(this.currentPosition);

    const dx = this.currentPosition.x - this.lastPosition.x;
    const dz = this.currentPosition.z - this.lastPosition.z;
    const dy = this.currentPosition.y - this.lastPosition.y;
    const horizontalSpeed = THREE.MathUtils.clamp(Math.hypot(dx, dz) / safeDt, 0, MAX_EXPECTED_SPEED);
    const verticalSpeed = THREE.MathUtils.clamp(dy / safeDt, -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED);
    const speedRatio = clamp01(horizontalSpeed / 6);

    const yaw = this.player?.root?.rotation?.y ?? this.lastYaw;
    const turnRate = THREE.MathUtils.clamp(
      shortestAngleDelta(this.lastYaw, yaw) / safeDt,
      -MAX_TURN_RATE,
      MAX_TURN_RATE
    );

    const trailTarget = speedRatio * 0.145;
    const verticalTarget = THREE.MathUtils.clamp(-verticalSpeed * 0.018, -0.075, 0.075)
      + speedRatio * 0.022;
    const sideTarget = THREE.MathUtils.clamp(-turnRate * 0.014, -0.07, 0.07);

    this.trail = THREE.MathUtils.damp(this.trail, trailTarget, 7.5, safeDt);
    this.verticalLag = THREE.MathUtils.damp(this.verticalLag, verticalTarget, 8.5, safeDt);
    this.sideLag = THREE.MathUtils.damp(this.sideLag, sideTarget, 8, safeDt);
    this.elapsed += safeDt;

    const flutterStrength = 0.0025 + speedRatio * 0.018;
    const position = this.capePositions;
    const base = this.baseCapePositions;

    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const baseX = base[offset];
      const baseY = base[offset + 1];
      const baseZ = base[offset + 2];
      const verticalDrop = clamp01((this.capeTopY - baseY) / this.capeHeight);
      const loose = Math.pow(clamp01((verticalDrop - 0.08) / 0.92), 1.45);
      const width = THREE.MathUtils.clamp(baseX / this.capeHalfWidth, -1, 1);
      const flutter = Math.sin(
        this.elapsed * (4.2 + speedRatio * 5.2)
        + width * 1.8
        + verticalDrop * 2.6
      );
      const crossRipple = Math.sin(
        this.elapsed * (5.7 + speedRatio * 3.6)
        - width * 2.5
        + verticalDrop * 1.4
      );

      position.setXYZ(
        index,
        baseX + this.sideLag * loose + crossRipple * flutterStrength * loose * 0.18,
        baseY + this.verticalLag * loose + crossRipple * flutterStrength * loose * 0.3,
        baseZ - this.trail * loose + flutter * flutterStrength * loose
      );
    }

    position.needsUpdate = true;
    this.capeGeometry.computeVertexNormals();
    this.lastPosition.copy(this.currentPosition);
    this.lastYaw = yaw;
  }

  #removeUnusedQuiver() {
    const quiver = this.model?.getObjectByName?.(QUIVER_NODE_NAME);
    quiver?.removeFromParent();
  }

  #prepareCape() {
    const cape = this.model?.getObjectByName?.(CAPE_NODE_NAME);
    const sourcePositions = cape?.geometry?.getAttribute?.('position');
    if (!cape?.isMesh || !sourcePositions || sourcePositions.itemSize < 3) return;

    cape.geometry = cape.geometry.clone();
    this.cape = cape;
    this.capeGeometry = cape.geometry;
    this.capePositions = this.capeGeometry.getAttribute('position');
    this.capePositions.setUsage(THREE.DynamicDrawUsage);
    this.baseCapePositions = Float32Array.from(this.capePositions.array);

    let minY = Infinity;
    let maxY = -Infinity;
    let maxAbsX = 0;
    for (let index = 0; index < this.capePositions.count; index += 1) {
      const offset = index * 3;
      const x = this.baseCapePositions[offset];
      const y = this.baseCapePositions[offset + 1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      maxAbsX = Math.max(maxAbsX, Math.abs(x));
    }

    this.capeTopY = Number.isFinite(maxY) ? maxY : 0;
    this.capeHeight = Math.max(0.001, this.capeTopY - (Number.isFinite(minY) ? minY : 0));
    this.capeHalfWidth = Math.max(0.001, maxAbsX);

    this.capeGeometry.computeBoundingBox();
    this.capeGeometry.boundingBox?.expandByScalar(CAPE_BOUNDS_MARGIN);
    this.capeGeometry.computeBoundingSphere();
    if (this.capeGeometry.boundingSphere) this.capeGeometry.boundingSphere.radius += CAPE_BOUNDS_MARGIN;
  }
}
