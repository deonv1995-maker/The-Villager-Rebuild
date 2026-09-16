const TERRAIN_CHUNK_PREFIX = 'terrain-chunk-';
const TRIANGLE_EPSILON = 1e-6;
const CONTAINMENT_EPSILON = 1e-5;

function triangleHeightAtXZ(position, a, b, c, x, z) {
  const ax = position.getX(a);
  const az = position.getZ(a);
  const bx = position.getX(b);
  const bz = position.getZ(b);
  const cx = position.getX(c);
  const cz = position.getZ(c);

  const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(denominator) <= TRIANGLE_EPSILON) return null;

  const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
  const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
  const wc = 1 - wa - wb;
  if (
    wa < -CONTAINMENT_EPSILON ||
    wb < -CONTAINMENT_EPSILON ||
    wc < -CONTAINMENT_EPSILON ||
    wa > 1 + CONTAINMENT_EPSILON ||
    wb > 1 + CONTAINMENT_EPSILON ||
    wc > 1 + CONTAINMENT_EPSILON
  ) return null;

  return (
    wa * position.getY(a) +
    wb * position.getY(b) +
    wc * position.getY(c)
  );
}

/**
 * Samples the exact triangle surface currently rendered by the low-poly terrain.
 *
 * Gameplay keeps using the analytical/collision height functions. Presentation code
 * may use this sampler when it needs to meet the surface the player can actually see.
 * Records retain references to the terrain position buffers, so construction terrain
 * edits are reflected immediately without rebuilding a second height model.
 */
export class RenderedTerrainSurfaceSampler {
  constructor({ group, fallbackHeightAt }) {
    if (!group || typeof fallbackHeightAt !== 'function') {
      throw new Error('RenderedTerrainSurfaceSampler requires a terrain group and fallback height source');
    }
    this.group = group;
    this.fallbackHeightAt = fallbackHeightAt;
    this.records = [];
  }

  captureTerrainMeshes() {
    this.records.length = 0;
    this.group.updateWorldMatrix(true, true);

    this.group.traverse(object => {
      if (!object.isMesh || !object.name.startsWith(TERRAIN_CHUNK_PREFIX)) return;
      const position = object.geometry?.getAttribute?.('position');
      const index = object.geometry?.getIndex?.();
      if (!position || !index) return;

      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      if (!bounds) return;

      const gridSide = Math.round(Math.sqrt(position.count));
      const segments = gridSide - 1;
      if (
        gridSide <= 1 ||
        gridSide * gridSide !== position.count ||
        index.count !== segments * segments * 6
      ) return;

      const world = object.getWorldPosition({
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
        setFromMatrixPosition(matrix) {
          const elements = matrix.elements;
          this.x = elements[12];
          this.y = elements[13];
          this.z = elements[14];
          return this;
        }
      });

      this.records.push({
        mesh: object,
        position,
        index,
        gridSide,
        segments,
        originX: world.x,
        originY: world.y,
        originZ: world.z,
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
        stepX: (bounds.max.x - bounds.min.x) / segments,
        stepZ: (bounds.max.z - bounds.min.z) / segments
      });
    });

    return this.records.length;
  }

  heightAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

    for (const record of this.records) {
      const localX = x - record.originX;
      const localZ = z - record.originZ;
      if (
        localX < record.minX - CONTAINMENT_EPSILON ||
        localX > record.maxX + CONTAINMENT_EPSILON ||
        localZ < record.minZ - CONTAINMENT_EPSILON ||
        localZ > record.maxZ + CONTAINMENT_EPSILON
      ) continue;

      const sampled = this.#sampleRecord(record, localX, localZ);
      if (Number.isFinite(sampled)) return sampled + record.originY;
    }

    const fallback = this.fallbackHeightAt(x, z);
    return Number.isFinite(fallback) ? fallback : null;
  }

  #sampleRecord(record, x, z) {
    if (record.stepX <= 0 || record.stepZ <= 0) return null;

    const gridX = Math.min(
      record.segments - 1,
      Math.max(0, Math.floor((x - record.minX) / record.stepX))
    );
    const gridZ = Math.min(
      record.segments - 1,
      Math.max(0, Math.floor((z - record.minZ) / record.stepZ))
    );
    const cell = gridZ * record.segments + gridX;
    const indexOffset = cell * 6;

    for (let triangle = 0; triangle < 2; triangle += 1) {
      const offset = indexOffset + triangle * 3;
      const a = record.index.getX(offset);
      const b = record.index.getX(offset + 1);
      const c = record.index.getX(offset + 2);
      const height = triangleHeightAtXZ(record.position, a, b, c, x, z);
      if (Number.isFinite(height)) return height;
    }

    return null;
  }
}
