import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const HEIGHT_EPSILON = 0.002;
const TERRAIN_CHUNK_PREFIX = 'terrain-chunk-';
const RENDER_CELL_PADDING_FACTOR = 0.6;

export class ConstructionTerrainAdaptationSystem {
  constructor({ group, terrain, chunks = null }) {
    if (!group || !terrain?.heightAt) {
      throw new Error('ConstructionTerrainAdaptationSystem requires a world group and immutable terrain height source');
    }
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.floors = new Map();
    this.floorSignature = '';
    this.meshRecords = [];
    this.renderSamplingPadding = 0;
    this.revision = 0;
    this.soilColor = new THREE.Color(0x72593d);
    this.tempWorldPosition = new THREE.Vector3();
  }

  captureTerrainMeshes() {
    this.meshRecords.length = 0;
    this.renderSamplingPadding = 0;
    this.group.updateWorldMatrix(true, true);

    this.group.traverse(object => {
      if (!object.isMesh || !object.name.startsWith(TERRAIN_CHUNK_PREFIX)) return;
      const position = object.geometry?.getAttribute?.('position');
      if (!position) return;
      const color = object.geometry?.getAttribute?.('color') ?? null;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      object.getWorldPosition(this.tempWorldPosition);
      const renderSamplingPadding = this.#renderSamplingPadding(bounds, position);
      this.renderSamplingPadding = Math.max(this.renderSamplingPadding, renderSamplingPadding);

      this.meshRecords.push({
        mesh: object,
        position,
        color,
        naturalY: Float32Array.from({ length: position.count }, (_, index) => position.getY(index)),
        naturalColors: color ? new Float32Array(color.array) : null,
        originX: this.tempWorldPosition.x,
        originZ: this.tempWorldPosition.z,
        renderSamplingPadding,
        horizontalRadius: bounds
          ? Math.hypot((bounds.max.x - bounds.min.x) * 0.5, (bounds.max.z - bounds.min.z) * 0.5)
          : (this.chunks?.chunkSize ?? 72) * Math.SQRT1_2
      });
      object.userData.constructionTerrainTracked = true;
    });

    return this.meshRecords.length;
  }

  getRevision() {
    return this.revision;
  }

  getFloorCount() {
    return this.floors.size;
  }

  heightAt(x, z) {
    const naturalY = this.terrain.heightAt(x, z);
    return this.#adaptedHeightFrom(naturalY, x, z, this.floors.values());
  }

  setFloors(floors = []) {
    const normalized = floors
      .filter(floor => floor?.active !== false && floor?.mode === 'floor')
      .map(floor => this.#normalizeFloor(floor))
      .filter(Boolean)
      .sort((left, right) => left.id - right.id);
    const signature = normalized
      .map(floor => `${floor.id}:${floor.x.toFixed(3)}:${floor.z.toFixed(3)}:${floor.yaw.toFixed(3)}:${floor.topY.toFixed(3)}`)
      .join('|');
    if (signature === this.floorSignature) return false;

    const previous = [...this.floors.values()];
    this.floors = new Map(normalized.map(floor => [floor.id, floor]));
    this.floorSignature = signature;
    this.revision += 1;
    this.#refreshAffectedMeshes(previous, normalized);
    return true;
  }

  clear() {
    return this.setFloors([]);
  }

  #normalizeFloor(floor) {
    if (
      !Number.isFinite(floor.id) ||
      !Number.isFinite(floor.x) ||
      !Number.isFinite(floor.z) ||
      !Number.isFinite(floor.yaw) ||
      !Number.isFinite(floor.baseY)
    ) return null;

    const topY = Number.isFinite(floor.topY) ? floor.topY : floor.baseY + 0.028;
    const halfX = PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorTerrainCorePadding;
    const halfZ = PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorTerrainCorePadding;
    const blendDistance = PHYSICAL_LOG.floorTerrainBlendDistance;
    const renderPadding = this.renderSamplingPadding;
    return {
      id: floor.id,
      x: floor.x,
      z: floor.z,
      yaw: floor.yaw,
      baseY: floor.baseY,
      topY,
      cutY: topY - PHYSICAL_LOG.floorTerrainSurfaceClearance,
      halfX,
      halfZ,
      blendDistance,
      renderPadding,
      influenceRadius: Math.hypot(
        halfX + blendDistance + renderPadding,
        halfZ + blendDistance + renderPadding
      )
    };
  }

  #refreshAffectedMeshes(previousFloors, nextFloors) {
    if (!this.meshRecords.length) return;
    for (const record of this.meshRecords) {
      const affectedBefore = previousFloors.some(floor => this.#floorCouldAffectRecord(floor, record));
      const affectedAfter = nextFloors.some(floor => this.#floorCouldAffectRecord(floor, record));
      if (affectedBefore || affectedAfter) this.#rebuildMesh(record);
    }
  }

  #floorCouldAffectRecord(floor, record) {
    return Math.hypot(floor.x - record.originX, floor.z - record.originZ) <=
      floor.influenceRadius + record.horizontalRadius;
  }

  #rebuildMesh(record) {
    const candidates = [...this.floors.values()].filter(floor => this.#floorCouldAffectRecord(floor, record));
    const positions = record.position.array;
    const colors = record.color?.array ?? null;
    let changed = false;

    for (let index = 0; index < record.position.count; index += 1) {
      const offset = index * record.position.itemSize;
      const worldX = record.originX + positions[offset];
      const worldZ = record.originZ + positions[offset + 2];
      const naturalY = record.naturalY[index];
      const nextY = this.#adaptedHeightFrom(naturalY, worldX, worldZ, candidates);

      if (Math.abs(positions[offset + 1] - nextY) > HEIGHT_EPSILON) {
        positions[offset + 1] = nextY;
        changed = true;
      }

      if (colors && record.naturalColors) {
        const colorOffset = index * record.color.itemSize;
        const lowered = Math.max(0, naturalY - nextY);
        const strength = THREE.MathUtils.clamp(lowered / 1.15, 0, 0.72);
        for (let channel = 0; channel < 3; channel += 1) {
          const natural = record.naturalColors[colorOffset + channel];
          const soil = channel === 0 ? this.soilColor.r : channel === 1 ? this.soilColor.g : this.soilColor.b;
          const next = THREE.MathUtils.lerp(natural, soil, strength);
          if (Math.abs(colors[colorOffset + channel] - next) > 0.0005) {
            colors[colorOffset + channel] = next;
            changed = true;
          }
        }
      }
    }

    if (!changed) return;
    record.position.needsUpdate = true;
    if (record.color) record.color.needsUpdate = true;
    record.mesh.geometry.computeVertexNormals();
    record.mesh.geometry.computeBoundingSphere();
  }

  #adaptedHeightFrom(naturalY, x, z, floors) {
    let result = naturalY;
    for (const floor of floors) {
      if (naturalY <= floor.cutY + HEIGHT_EPSILON) continue;
      // The world terrain is deliberately low-poly on mobile. If the logical cut is
      // narrower than one render cell, an untouched triangle can bridge across the
      // whole split-log floor even though heightAt() says the terrain was lowered.
      // Expanding only the cut footprint by the captured render-cell radius keeps the
      // rendered mesh, collision ground and vegetation projection on one shared surface.
      const distance = Math.max(
        0,
        this.#outsideDistance(floor, x, z) - (floor.renderPadding ?? 0)
      );
      if (distance > floor.blendDistance) continue;
      const t = this.#smoothstep01(distance / floor.blendDistance);
      const candidate = THREE.MathUtils.lerp(floor.cutY, naturalY, t);
      result = Math.min(result, candidate);
    }
    return result;
  }

  #outsideDistance(floor, x, z) {
    const dx = x - floor.x;
    const dz = z - floor.z;
    const c = Math.cos(floor.yaw);
    const s = Math.sin(floor.yaw);
    const u = dx * c - dz * s;
    const v = dx * s + dz * c;
    const outsideX = Math.max(Math.abs(u) - floor.halfX, 0);
    const outsideZ = Math.max(Math.abs(v) - floor.halfZ, 0);
    return Math.hypot(outsideX, outsideZ);
  }

  #renderSamplingPadding(bounds, position) {
    if (!bounds || !position?.count) return 0;
    const side = Math.round(Math.sqrt(position.count));
    if (side <= 1 || side * side !== position.count) return 0;

    const spanX = Math.max(0, bounds.max.x - bounds.min.x);
    const spanZ = Math.max(0, bounds.max.z - bounds.min.z);
    const stepX = spanX / (side - 1);
    const stepZ = spanZ / (side - 1);
    if (!Number.isFinite(stepX) || !Number.isFinite(stepZ)) return 0;

    return Math.hypot(stepX, stepZ) * RENDER_CELL_PADDING_FACTOR;
  }

  #smoothstep01(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }
}
