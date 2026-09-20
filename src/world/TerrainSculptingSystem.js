import * as THREE from 'three';
import {
  TERRAIN_SCULPT_DEFINITIONS,
  TERRAIN_SCULPT_MODES,
  TERRAIN_SCULPTING
} from '../data/TerrainSculptingDefinitions.js';

const MODE_SET = new Set(TERRAIN_SCULPT_MODES);
const SURFACE_EPSILON = 0.035;

const smoothstep01 = value => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export class TerrainSculptingSystem {
  constructor({ terrain, onChanged = null } = {}) {
    if (!terrain?.heightAt || !terrain?.naturalHeightAt || !terrain?.setHeightModifier) {
      throw new Error('TerrainSculptingSystem requires editable terrain height authority');
    }
    this.terrain = terrain;
    this.config = TERRAIN_SCULPTING;
    this.onChanged = typeof onChanged === 'function' ? onChanged : null;
    this.edits = [];
    this.editBuckets = new Map();
    this.nextEditId = 1;
    this.tempDirection = new THREE.Vector3();
    this.tempPoint = new THREE.Vector3();
    this.terrain.setHeightModifier((naturalY, x, z) =>
      this.heightAt(naturalY, x, z)
    );
  }

  heightAt(naturalY, x, z) {
    const candidates = this.editBuckets.get(this.#bucketKeyForPoint(x, z));
    if (!candidates?.length) return naturalY;

    let result = naturalY;
    for (const edit of candidates) {
      const dx = x - edit.x;
      const dz = z - edit.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= edit.radius) continue;
      const falloff = smoothstep01(1 - distance / edit.radius);

      if (edit.mode === 'raise') {
        result += edit.amount * falloff;
      } else if (edit.mode === 'lower') {
        result -= edit.amount * falloff;
      } else if (edit.mode === 'smooth' || edit.mode === 'level') {
        result = THREE.MathUtils.lerp(
          result,
          edit.targetY,
          THREE.MathUtils.clamp(edit.strength * falloff, 0, 1)
        );
      }
      result = THREE.MathUtils.clamp(
        result,
        naturalY - this.config.maxSurfaceOffset,
        naturalY + this.config.maxSurfaceOffset
      );
    }
    return result;
  }

  getSurfaceTarget({ aim, playerPosition = null } = {}) {
    if (!aim?.origin || !aim?.direction) return null;
    const direction = this.tempDirection.copy(aim.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const originSurfaceY = this.terrain.heightAt(aim.origin.x, aim.origin.z);
    if (aim.origin.y < originSurfaceY - 0.35) return null;

    const step = this.config.targetRayStep;
    let previousDistance = 0;
    let previousDelta = aim.origin.y - originSurfaceY;

    for (
      let distance = step;
      distance <= this.config.reach + 0.000001;
      distance = Math.min(this.config.reach, distance + step)
    ) {
      const point = this.tempPoint.copy(aim.origin).addScaledVector(direction, distance);
      const surfaceY = this.terrain.heightAt(point.x, point.z);
      const delta = point.y - surfaceY;
      if (previousDelta >= 0 && delta <= 0) {
        let low = previousDistance;
        let high = distance;
        for (let refine = 0; refine < this.config.targetRefineSteps; refine += 1) {
          const mid = (low + high) * 0.5;
          const midPoint = this.tempPoint.copy(aim.origin).addScaledVector(direction, mid);
          const midDelta = midPoint.y - this.terrain.heightAt(midPoint.x, midPoint.z);
          if (midDelta <= 0) high = mid;
          else low = mid;
        }

        const hit = new THREE.Vector3().copy(aim.origin).addScaledVector(direction, high);
        hit.y = this.terrain.heightAt(hit.x, hit.z);
        if (!this.terrain.isPlayable?.(hit.x, hit.z, this.config.brushRadius * 0.55)) return null;
        if (
          playerPosition &&
          hit.distanceTo(playerPosition) > this.config.reach + 1.2
        ) return null;

        return {
          type: 'terraform-ground',
          label: 'Ground',
          icon: 'pickaxe',
          point: hit,
          position: hit.clone(),
          radius: this.config.brushRadius
        };
      }

      previousDistance = distance;
      previousDelta = delta;
      if (distance >= this.config.reach) break;
    }
    return null;
  }

  apply(mode, target) {
    if (!MODE_SET.has(mode) || mode === 'dig') return null;
    const x = Number(target?.point?.x ?? target?.x);
    const z = Number(target?.point?.z ?? target?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (!this.terrain.isPlayable?.(x, z, this.config.brushRadius * 0.55)) return null;

    const radius = this.config.brushRadius;
    const currentY = this.terrain.heightAt(x, z);
    let edit = null;

    if (mode === 'raise' || mode === 'lower') {
      edit = {
        id: this.nextEditId++,
        mode,
        x,
        z,
        radius,
        amount: mode === 'raise' ? this.config.raiseAmount : this.config.lowerAmount
      };
    } else if (mode === 'level') {
      edit = {
        id: this.nextEditId++,
        mode,
        x,
        z,
        radius,
        targetY: currentY,
        strength: this.config.levelStrength
      };
    } else if (mode === 'smooth') {
      edit = {
        id: this.nextEditId++,
        mode,
        x,
        z,
        radius,
        targetY: this.#averageHeightAround(x, z, radius * 0.72),
        strength: this.config.smoothStrength
      };
    }

    if (!edit) return null;
    this.#registerEdit(edit);
    this.terrain.rebuildTerrainForCircles?.([edit]);
    this.onChanged?.({
      mode,
      x,
      z,
      radius,
      editCount: this.edits.length
    });

    return {
      changed: true,
      mode,
      x,
      y: this.terrain.heightAt(x, z),
      z,
      radius,
      editCount: this.edits.length,
      label: TERRAIN_SCULPT_DEFINITIONS[mode]?.label ?? mode
    };
  }

  captureState() {
    return {
      kind: this.config.stateKind,
      schemaVersion: this.config.schemaVersion,
      edits: this.edits.map(edit => ({
        id: edit.id,
        mode: edit.mode,
        x: Number(edit.x.toFixed(4)),
        z: Number(edit.z.toFixed(4)),
        radius: Number(edit.radius.toFixed(4)),
        ...(Number.isFinite(edit.amount)
          ? { amount: Number(edit.amount.toFixed(4)) }
          : {}),
        ...(Number.isFinite(edit.targetY)
          ? { targetY: Number(edit.targetY.toFixed(4)) }
          : {}),
        ...(Number.isFinite(edit.strength)
          ? { strength: Number(edit.strength.toFixed(4)) }
          : {})
      }))
    };
  }

  restoreState(state) {
    this.edits.length = 0;
    this.editBuckets.clear();
    this.nextEditId = 1;

    if (
      state?.kind !== this.config.stateKind ||
      state?.schemaVersion !== this.config.schemaVersion
    ) {
      this.terrain.rebuildAllTerrainChunks?.();
      this.onChanged?.({ restored: true, editCount: 0 });
      return false;
    }

    const restored = [];
    for (const saved of Array.isArray(state.edits) ? state.edits : []) {
      const edit = this.#normalizeSavedEdit(saved);
      if (!edit) continue;
      this.#registerEdit(edit);
      restored.push(edit);
      this.nextEditId = Math.max(this.nextEditId, edit.id + 1);
    }

    if (restored.length) this.terrain.rebuildTerrainForCircles?.(restored);
    this.onChanged?.({ restored: true, editCount: this.edits.length });
    return true;
  }

  getDebugState() {
    return {
      kind: this.config.stateKind,
      editCount: this.edits.length,
      bucketCount: this.editBuckets.size
    };
  }

  #normalizeSavedEdit(saved) {
    const mode = typeof saved?.mode === 'string' ? saved.mode : '';
    const id = Number(saved?.id);
    const x = Number(saved?.x);
    const z = Number(saved?.z);
    const radius = Number(saved?.radius);
    if (
      !MODE_SET.has(mode) ||
      mode === 'dig' ||
      !Number.isFinite(id) ||
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) return null;

    if (mode === 'raise' || mode === 'lower') {
      const amount = Number(saved?.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { id, mode, x, z, radius, amount };
    }

    const targetY = Number(saved?.targetY);
    const strength = Number(saved?.strength);
    if (!Number.isFinite(targetY) || !Number.isFinite(strength)) return null;
    return { id, mode, x, z, radius, targetY, strength };
  }

  #averageHeightAround(x, z, radius) {
    let total = this.terrain.heightAt(x, z);
    let count = 1;
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI * 0.25;
      total += this.terrain.heightAt(
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius
      );
      count += 1;
    }
    return total / count;
  }

  #registerEdit(edit) {
    this.edits.push(edit);
    const size = this.config.editBucketSize;
    const minX = Math.floor((edit.x - edit.radius) / size);
    const maxX = Math.floor((edit.x + edit.radius) / size);
    const minZ = Math.floor((edit.z - edit.radius) / size);
    const maxZ = Math.floor((edit.z + edit.radius) / size);
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const key = this.#bucketKey(ix, iz);
        const bucket = this.editBuckets.get(key) ?? [];
        bucket.push(edit);
        this.editBuckets.set(key, bucket);
      }
    }
  }

  #bucketKeyForPoint(x, z) {
    const size = this.config.editBucketSize;
    return this.#bucketKey(Math.floor(x / size), Math.floor(z / size));
  }

  #bucketKey(ix, iz) {
    return ix + ':' + iz;
  }
}
