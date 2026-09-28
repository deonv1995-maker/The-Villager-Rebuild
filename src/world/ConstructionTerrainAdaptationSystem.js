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
    this.meshRecordByChunkKey = new Map();
    this.renderSamplingPadding = 0;
    this.revision = 0;
    this.soilColor = new THREE.Color(0x72593d);
    this.tempWorldPosition = new THREE.Vector3();
    this.terrainGeometryUnsubscribe = this.terrain.onTerrainChunkGeometryChanged?.(
      mesh => this.refreshTerrainMesh(mesh)
    ) ?? null;
  }

  captureTerrainMeshes() {
    this.meshRecords.length = 0;
    this.meshRecordByChunkKey.clear();
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

      const record = {
        mesh: object,
        position,
        color,
        naturalY: Float32Array.from({ length: position.count }, (_, index) => position.getY(index)),
        naturalColors: color ? new Float32Array(color.array) : null,
        originX: this.tempWorldPosition.x,
        originZ: this.tempWorldPosition.z,
        renderSamplingPadding,
        renderGrid: this.#createRenderGrid(bounds, position),
        horizontalRadius: bounds
          ? Math.hypot((bounds.max.x - bounds.min.x) * 0.5, (bounds.max.z - bounds.min.z) * 0.5)
          : (this.chunks?.chunkSize ?? 72) * Math.SQRT1_2
      };
      this.meshRecords.push(record);
      this.#indexRenderRecord(record);
      object.userData.constructionTerrainTracked = true;
    });

    return this.meshRecords.length;
  }

  refreshTerrainMesh(mesh) {
    const recordIndex = this.meshRecords.findIndex(record => record.mesh === mesh);
    if (recordIndex < 0) return false;

    const position = mesh.geometry?.getAttribute?.('position');
    if (!position) return false;
    const color = mesh.geometry?.getAttribute?.('color') ?? null;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    mesh.getWorldPosition(this.tempWorldPosition);
    const renderSamplingPadding = this.#renderSamplingPadding(bounds, position);
    this.renderSamplingPadding = Math.max(this.renderSamplingPadding, renderSamplingPadding);

    const previousRecord = this.meshRecords[recordIndex];
    const record = {
      mesh,
      position,
      color,
      naturalY: Float32Array.from(
        { length: position.count },
        (_, index) => position.getY(index)
      ),
      naturalColors: color ? new Float32Array(color.array) : null,
      originX: this.tempWorldPosition.x,
      originZ: this.tempWorldPosition.z,
      renderSamplingPadding,
      renderGrid: this.#createRenderGrid(bounds, position),
      horizontalRadius: bounds
        ? Math.hypot(
            (bounds.max.x - bounds.min.x) * 0.5,
            (bounds.max.z - bounds.min.z) * 0.5
          )
        : (this.chunks?.chunkSize ?? 72) * Math.SQRT1_2
    };
    this.meshRecords[recordIndex] = record;
    this.#unindexRenderRecord(previousRecord);
    this.#indexRenderRecord(record);
    mesh.userData.constructionTerrainTracked = true;

    // Dynamic terrain geometry may be replaced by tunneling or Pickaxe surface
    // sculpting. Reapply construction floor cuts immediately and advance the
    // shared terrain revision so vegetation consumers reproject to the new Y.
    this.#rebuildMesh(record);
    this.revision += 1;
    return true;
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

  renderedHeightAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

    const key = this.chunks?.keyForPosition?.(x, z) ?? null;
    let record = key ? this.meshRecordByChunkKey.get(key) ?? null : null;
    if (!record) {
      record = this.meshRecords.find(candidate => this.#recordContains(candidate, x, z)) ?? null;
    }
    if (!record?.renderGrid) return this.heightAt(x, z);

    const localX = x - record.originX;
    const localZ = z - record.originZ;
    const grid = record.renderGrid;
    const column = THREE.MathUtils.clamp(
      Math.floor((localX - grid.minX) / grid.stepX),
      0,
      grid.size - 2
    );
    const row = THREE.MathUtils.clamp(
      Math.floor((grid.maxZ - localZ) / grid.stepZ),
      0,
      grid.size - 2
    );

    const a = row * grid.size + column;
    const b = (row + 1) * grid.size + column;
    const c = (row + 1) * grid.size + column + 1;
    const d = row * grid.size + column + 1;
    const first = this.#triangleHeightAt(record.position, a, b, d, localX, localZ);
    if (Number.isFinite(first)) return first;

    const second = this.#triangleHeightAt(record.position, b, c, d, localX, localZ);
    return Number.isFinite(second) ? second : this.heightAt(x, z);
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

  #indexRenderRecord(record) {
    if (!record || !this.chunks?.keyForPosition) return;
    this.meshRecordByChunkKey.set(
      this.chunks.keyForPosition(record.originX, record.originZ),
      record
    );
  }

  #unindexRenderRecord(record) {
    if (!record || !this.chunks?.keyForPosition) return;
    const key = this.chunks.keyForPosition(record.originX, record.originZ);
    if (this.meshRecordByChunkKey.get(key) === record) {
      this.meshRecordByChunkKey.delete(key);
    }
  }

  #createRenderGrid(bounds, position) {
    if (!bounds || !position?.count || position.itemSize < 3) return null;
    const size = Math.round(Math.sqrt(position.count));
    if (size <= 1 || size * size !== position.count) return null;

    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const stepX = spanX / (size - 1);
    const stepZ = spanZ / (size - 1);
    if (!(stepX > 0) || !(stepZ > 0)) return null;

    return {
      size,
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
      stepX,
      stepZ
    };
  }

  #recordContains(record, x, z) {
    const grid = record?.renderGrid;
    if (!grid) return false;
    const localX = x - record.originX;
    const localZ = z - record.originZ;
    const epsilon = 0.0001;
    return (
      localX >= grid.minX - epsilon &&
      localX <= grid.maxX + epsilon &&
      localZ >= grid.minZ - epsilon &&
      localZ <= grid.maxZ + epsilon
    );
  }

  #triangleHeightAt(position, ia, ib, ic, x, z) {
    const ax = position.getX(ia);
    const ay = position.getY(ia);
    const az = position.getZ(ia);
    const bx = position.getX(ib);
    const by = position.getY(ib);
    const bz = position.getZ(ib);
    const cx = position.getX(ic);
    const cy = position.getY(ic);
    const cz = position.getZ(ic);
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) <= 0.0000001) return null;

    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    const wc = 1 - wa - wb;
    const epsilon = -0.00001;
    if (wa < epsilon || wb < epsilon || wc < epsilon) return null;
    return wa * ay + wb * by + wc * cy;
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
