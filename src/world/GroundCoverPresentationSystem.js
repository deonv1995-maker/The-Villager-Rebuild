import * as THREE from 'three';
import { constructionFloorCoversVegetation } from './GrassFieldSystem.js';

const COVER_SPACING = 1.7;
const COVER_HEIGHT_OFFSET = 0.012;
const COVER_COLORS = Object.freeze([
  0x4d9144,
  0x61a64b,
  0x73b957,
  0x86c965,
  0x579b46,
  0x98cf6d
]);

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const smoothstep01 = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ (salt * 374761393), 668265263);
  value = Math.imul(value ^ ((z | 0) * 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

/**
 * Static meadow micro-cover for the stylized village presentation.
 *
 * This system is deliberately separate from reactive grass behaviour. It consumes the same
 * authoritative terrain suitability/grass fields, but its only job is to make the near-ground
 * surface read as a dense lawn instead of exposed vertex-coloured terrain. The cheaper static
 * clumps remain chunk-cullable and construction-aware, while GrassFieldSystem keeps ownership
 * of Ranger-reactive bending/compression.
 */
export class GroundCoverPresentationSystem {
  constructor({
    group,
    terrain,
    scatter,
    chunks = null,
    collision = null,
    constructionTerrain = null,
    spacing = COVER_SPACING
  }) {
    this.group = group;
    this.terrain = terrain;
    this.scatter = scatter;
    this.chunks = chunks;
    this.collision = collision;
    this.constructionTerrain = constructionTerrain;
    this.spacing = spacing;
    this.geometry = buildGroundCoverGeometry();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true
    });
    this.entries = [];
    this.meshes = [];
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;
    this.dummy = new THREE.Object3D();
  }

  populate() {
    this.entries.length = 0;
    this.meshes.length = 0;
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;

    const bounds = this.terrain.getScatterBounds?.(18) ?? {
      halfX: 134,
      halfZ: 111,
      centerZ: -4
    };
    const columns = Math.ceil((bounds.halfX * 2) / this.spacing);
    const rows = Math.ceil((bounds.halfZ * 2) / this.spacing);

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const jitterX = (hash01(column, row, 3) - 0.5) * this.spacing * 0.72;
        const jitterZ = (hash01(column, row, 7) - 0.5) * this.spacing * 0.72;
        const x = -bounds.halfX + column * this.spacing + jitterX;
        const z = bounds.centerZ - bounds.halfZ + row * this.spacing + jitterZ;
        const density = this.#coverDensityAt(x, z);
        if (density <= 0) continue;
        if (hash01(column, row, 11) > density) continue;
        if (!this.scatter?.isGrassClear?.(x, z, 0.025)) continue;

        const naturalY = this.terrain.heightAt(x, z) + COVER_HEIGHT_OFFSET;
        const scaleVariation = hash01(column, row, 17);
        const heightVariation = hash01(column, row, 19);
        this.entries.push({
          x,
          y: naturalY,
          naturalY,
          z,
          yaw: hash01(column, row, 13) * Math.PI * 2,
          scaleX: 0.98 + scaleVariation * 0.5,
          scaleY: 0.66 + heightVariation * 0.42,
          scaleZ: 0.98 + (1 - scaleVariation) * 0.46,
          chunkKey: this.chunks?.keyForPosition(x, z) ?? null,
          mesh: null,
          index: -1,
          constructionHidden: false
        });
      }
    }

    this.#buildMeshes();
    return this.entries.length;
  }

  update() {
    this.#syncConstructionOcclusion();
  }

  #coverDensityAt(x, z) {
    const suitability = this.terrain.vegetationSuitabilityAt?.(x, z) ?? 0;
    if (suitability <= 0) return 0;

    const reactive = this.terrain.grassDensityAt?.(x, z) ?? 0;
    const patch = this.terrain.grassPatchStrengthAt?.(x, z) ?? reactive;
    let density = Math.max(
      reactive * 0.86,
      suitability * (0.38 + patch * 0.58)
    );

    const trailWear = this.terrain.trailWearAt?.(z) ?? 0;
    if (trailWear > 0 && this.terrain.pathCenterX) {
      const distance = Math.abs(x - this.terrain.pathCenterX(z));
      const clear = smoothstep01((distance - 0.58) / 1.62);
      const pathFade = THREE.MathUtils.lerp(1, Math.max(0.08, clear), trailWear * 0.92);
      density *= pathFade;
    }

    return THREE.MathUtils.clamp(density * 0.95 + suitability * 0.05, 0, 0.94);
  }

  #buildMeshes() {
    const entriesByChunk = new Map();
    for (const entry of this.entries) {
      const key = entry.chunkKey ?? 'global';
      const list = entriesByChunk.get(key) ?? [];
      list.push(entry);
      entriesByChunk.set(key, list);
    }

    for (const [key, entries] of entriesByChunk) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, entries.length);
      mesh.name = key === 'global'
        ? 'stylized-ground-cover'
        : `stylized-ground-cover-chunk-${key.replace(':', '-')}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      entries.forEach((entry, index) => {
        entry.mesh = mesh;
        entry.index = index;
        this.#writeMatrix(entry, false);
      });
      mesh.count = entries.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

      if (this.chunks && key !== 'global') this.chunks.addObjectToKey(mesh, key);
      else this.group.add(mesh);
      this.meshes.push(mesh);
    }
  }

  #syncConstructionOcclusion() {
    if (!this.meshes.length || !this.collision?.getRevision || !this.collision?.getObstaclesByType) return;
    const collisionRevision = this.collision.getRevision();
    const constructionRevision = this.constructionTerrain?.getRevision?.() ?? 0;
    if (
      collisionRevision === this.lastCollisionRevision &&
      constructionRevision === this.lastConstructionRevision
    ) return;

    this.lastCollisionRevision = collisionRevision;
    this.lastConstructionRevision = constructionRevision;
    const floors = [
      ...this.collision.getObstaclesByType('placed-log'),
      ...this.collision.getObstaclesByType('panel-floor')
    ].filter(obstacle => obstacle.shape === 'box');
    const changedMeshes = new Set();

    for (const entry of this.entries) {
      const hidden = floors.some(floor => constructionFloorCoversVegetation(entry, floor, 0.08));
      const adaptedY = hidden
        ? entry.y
        : (this.constructionTerrain?.heightAt?.(entry.x, entry.z) ?? this.terrain.heightAt(entry.x, entry.z)) + COVER_HEIGHT_OFFSET;
      if (hidden === entry.constructionHidden && Math.abs(adaptedY - entry.y) <= 0.002) continue;
      entry.constructionHidden = hidden;
      entry.y = adaptedY;
      this.#writeMatrix(entry, false);
      changedMeshes.add(entry.mesh);
    }

    for (const mesh of changedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  #writeMatrix(entry, markDirty = true) {
    if (!entry.mesh || entry.index < 0) return;
    this.dummy.position.set(entry.x, entry.y, entry.z);
    this.dummy.rotation.set(0, entry.yaw, 0);
    if (entry.constructionHidden) this.dummy.scale.set(0, 0, 0);
    else this.dummy.scale.set(entry.scaleX, entry.scaleY, entry.scaleZ);
    this.dummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, this.dummy.matrix);
    if (markDirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }
}

function buildGroundCoverGeometry() {
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  const bladeCount = 12;

  const pushVertex = (x, y, z, hex) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    color.setHex(hex);
    colors.push(color.r, color.g, color.b);
    return index;
  };

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = blade * 2.399963229728653 + (blade % 4) * 0.09;
    const ring = blade % 6;
    const radius = blade === 0 ? 0 : 0.14 + ring * 0.086;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const facing = angle + Math.PI * 0.37 + (blade % 2) * 0.48;
    const acrossX = Math.cos(facing);
    const acrossZ = Math.sin(facing);
    const height = 0.2 + (blade % 5) * 0.042;
    const width = 0.068 + (blade % 4) * 0.012;
    const lean = 0.04 + (blade % 4) * 0.014;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const baseHex = COVER_COLORS[blade % COVER_COLORS.length];
    const tipHex = COVER_COLORS[(blade + 1 + (blade % 2)) % COVER_COLORS.length];

    const left = pushVertex(cx - acrossX * width, 0, cz - acrossZ * width, baseHex);
    const right = pushVertex(cx + acrossX * width, 0, cz + acrossZ * width, baseHex);
    const shoulderLeft = pushVertex(
      cx - acrossX * width * 0.5 + dirX * lean * 0.55,
      height * 0.64,
      cz - acrossZ * width * 0.5 + dirZ * lean * 0.55,
      baseHex
    );
    const shoulderRight = pushVertex(
      cx + acrossX * width * 0.5 + dirX * lean * 0.55,
      height * 0.64,
      cz + acrossZ * width * 0.5 + dirZ * lean * 0.55,
      baseHex
    );
    const tip = pushVertex(
      cx + dirX * lean,
      height,
      cz + dirZ * lean,
      tipHex
    );

    indices.push(
      left, right, shoulderRight,
      left, shoulderRight, shoulderLeft,
      shoulderLeft, shoulderRight, tip
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
