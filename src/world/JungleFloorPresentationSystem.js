import * as THREE from 'three';
import {
  constructionFloorCoversVegetation,
  presentationExclusionCoversVegetation
} from './GrassFieldSystem.js';
import { terrainJungleSurfaceFieldsAt } from './TerrainSurfacePresentation.js';

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ (salt * 374761393), 668265263);
  value = Math.imul(value ^ ((z | 0) * 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

/**
 * Cheap static micro-layering for the western jungle floor.
 *
 * Terrain colour remains authoritative for the broad soil/humus/moss read. This system only
 * adds the missing near-ground depth cues that cannot be expressed by vertex colour alone:
 * leaf/twig litter and low exposed root fans. Ferns remain owned by FernFieldSystem and larger
 * vines, moss rocks and fallen logs remain owned by AmbientWorldDetailSystem.
 */
export class JungleFloorPresentationSystem {
  constructor({
    group,
    terrain,
    scatter,
    chunks = null,
    collision = null,
    constructionTerrain = null,
    maxLeafLitter = 900,
    maxRootFans = 120,
    leafSpacing = 2.55,
    rootSpacing = 6.15
  }) {
    this.group = group;
    this.terrain = terrain;
    this.scatter = scatter;
    this.chunks = chunks;
    this.collision = collision;
    this.constructionTerrain = constructionTerrain;
    this.maxLeafLitter = maxLeafLitter;
    this.maxRootFans = maxRootFans;
    this.leafSpacing = leafSpacing;
    this.rootSpacing = rootSpacing;
    this.entries = [];
    this.meshes = [];
    this.presentationExclusions = [];
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;
    this.dummy = new THREE.Object3D();

    this.geometries = Object.freeze({
      leafLitter: buildLeafLitterGeometry(),
      rootFan: buildRootFanGeometry()
    });
    this.materials = Object.freeze({
      leafLitter: createGroundDetailMaterial(),
      rootFan: createGroundDetailMaterial()
    });
    this.stats = Object.freeze({ leafLitter: 0, rootFans: 0, total: 0 });
  }

  setPresentationExclusions(exclusions = []) {
    this.presentationExclusions = exclusions
      .filter(exclusion => (
        Number.isFinite(exclusion?.x)
        && Number.isFinite(exclusion?.z)
        && Number.isFinite(exclusion?.radius)
        && exclusion.radius > 0
      ))
      .map(exclusion => ({ x: exclusion.x, z: exclusion.z, radius: exclusion.radius }));

    const changedMeshes = new Set();
    for (const entry of this.entries) {
      const hidden = this.#isPresentationExcluded(entry);
      if (hidden === entry.presentationHidden) continue;
      entry.presentationHidden = hidden;
      this.#writeMatrix(entry, false);
      if (entry.mesh) changedMeshes.add(entry.mesh);
    }
    for (const mesh of changedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  populate() {
    this.entries.length = 0;
    this.meshes.length = 0;
    this.lastCollisionRevision = -1;
    this.lastConstructionRevision = -1;

    const leafLitter = this.#populateGridKind({
      kind: 'leafLitter',
      spacing: this.leafSpacing,
      maxInstances: this.maxLeafLitter,
      margin: 18,
      maxSlope: 0.48,
      clearance: 0.04,
      heightOffset: 0.024,
      salt: 101,
      densityAt: (x, z, region) => {
        const fields = terrainJungleSurfaceFieldsAt(x, z);
        const base = region.ground?.leafLitterDensity ?? 0;
        return clamp01(
          region.strength
            * base
            * (0.38 + fields.litter * 0.62)
            * (0.86 + fields.damp * 0.14)
        );
      },
      scaleAt: (column, row) => {
        const scale = 0.72 + hash01(column, row, 109) * 0.78;
        return {
          x: scale * (0.9 + hash01(column, row, 113) * 0.24),
          y: 0.86 + hash01(column, row, 127) * 0.34,
          z: scale * (0.86 + hash01(column, row, 131) * 0.28)
        };
      }
    });

    const rootFans = this.#populateGridKind({
      kind: 'rootFan',
      spacing: this.rootSpacing,
      maxInstances: this.maxRootFans,
      margin: 20,
      maxSlope: 0.38,
      clearance: 0.12,
      heightOffset: 0.018,
      salt: 211,
      densityAt: (x, z, region) => {
        const fields = terrainJungleSurfaceFieldsAt(x, z);
        const base = region.ground?.surfaceRootDensity ?? 0;
        const forest = this.terrain.forestCoverAt?.(x, z) ?? 0.75;
        return clamp01(
          region.strength
            * base
            * (0.26 + fields.root * 0.74)
            * (0.56 + forest * 0.44)
        );
      },
      scaleAt: (column, row) => {
        const length = 1.05 + hash01(column, row, 223) * 1.15;
        return {
          x: length,
          y: 0.72 + hash01(column, row, 227) * 0.46,
          z: length * (0.84 + hash01(column, row, 229) * 0.34)
        };
      }
    });

    this.#buildMeshes();
    this.stats = Object.freeze({
      leafLitter,
      rootFans,
      total: leafLitter + rootFans
    });
    return { ...this.stats };
  }

  getStats() {
    return { ...this.stats };
  }

  update() {
    this.#syncConstructionOcclusion();
  }

  #placementBounds(margin) {
    const jungle = this.terrain.getExplorationRegions?.()
      .find(region => region.biome === 'jungle');
    if (
      Number.isFinite(jungle?.center?.x)
      && Number.isFinite(jungle?.center?.z)
      && Number.isFinite(jungle?.radii?.x)
      && Number.isFinite(jungle?.radii?.z)
    ) {
      return {
        centerX: jungle.center.x,
        centerZ: jungle.center.z,
        halfX: jungle.radii.x + margin,
        halfZ: jungle.radii.z + margin
      };
    }

    const bounds = this.terrain.getScatterBounds?.(margin) ?? {
      halfX: 132,
      halfZ: 109,
      centerZ: -4
    };
    return {
      centerX: bounds.centerX ?? 0,
      centerZ: bounds.centerZ ?? 0,
      halfX: bounds.halfX,
      halfZ: bounds.halfZ
    };
  }

  #populateGridKind({
    kind,
    spacing,
    maxInstances,
    margin,
    maxSlope,
    clearance,
    heightOffset,
    salt,
    densityAt,
    scaleAt
  }) {
    if (maxInstances <= 0) return 0;
    const bounds = this.#placementBounds(margin);
    const columns = Math.ceil((bounds.halfX * 2) / spacing);
    const rows = Math.ceil((bounds.halfZ * 2) / spacing);
    const candidates = [];

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const jitterX = (hash01(column, row, salt + 3) - 0.5) * spacing * 0.78;
        const jitterZ = (hash01(column, row, salt + 7) - 0.5) * spacing * 0.78;
        const x = bounds.centerX - bounds.halfX + column * spacing + jitterX;
        const z = bounds.centerZ - bounds.halfZ + row * spacing + jitterZ;

        if (!this.terrain.isPlayable?.(x, z, 3.2)) continue;
        if (this.terrain.isSandAt?.(x, z)) continue;
        if ((this.terrain.slopeAt?.(x, z) ?? 0) > maxSlope) continue;

        const region = this.terrain.regionAt?.(x, z);
        if (region?.biome !== 'jungle' || (region.strength ?? 0) <= 0 || !region.ground) continue;
        const density = densityAt(x, z, region);
        if (density <= 0 || hash01(column, row, salt + 11) > density) continue;
        if (!this.scatter?.isGrassClear?.(x, z, clearance)) continue;

        const scale = scaleAt(column, row);
        const naturalY = this.terrain.heightAt(x, z) + heightOffset;
        const entry = {
          kind,
          x,
          y: naturalY,
          naturalY,
          z,
          heightOffset,
          yaw: hash01(column, row, salt + 17) * Math.PI * 2,
          scaleX: scale.x,
          scaleY: scale.y,
          scaleZ: scale.z,
          chunkKey: this.chunks?.keyForPosition(x, z) ?? null,
          mesh: null,
          index: -1,
          constructionHidden: false,
          presentationHidden: false
        };
        entry.presentationHidden = this.#isPresentationExcluded(entry);
        candidates.push({
          entry,
          rank: hash01(column, row, salt + 29)
        });
      }
    }

    candidates.sort((left, right) => left.rank - right.rank);
    const selected = candidates.slice(0, maxInstances);
    for (const candidate of selected) this.entries.push(candidate.entry);
    return selected.length;
  }

  #buildMeshes() {
    const buckets = new Map();
    for (const entry of this.entries) {
      const key = `${entry.kind}|${entry.chunkKey ?? 'global'}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(entry);
      buckets.set(key, bucket);
    }

    let batchIndex = 0;
    for (const entries of buckets.values()) {
      const kind = entries[0].kind;
      const mesh = new THREE.InstancedMesh(
        this.geometries[kind],
        this.materials[kind],
        entries.length
      );
      mesh.name = `jungle-floor-${kind}-batch-${batchIndex}`;
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

      const chunkKey = entries[0].chunkKey;
      if (this.chunks && chunkKey) this.chunks.addObjectToKey(mesh, chunkKey);
      else this.group.add(mesh);
      this.meshes.push(mesh);
      batchIndex += 1;
    }
  }

  #syncConstructionOcclusion() {
    if (!this.meshes.length || !this.collision?.getRevision || !this.collision?.getObstaclesByType) return;
    const collisionRevision = this.collision.getRevision();
    const constructionRevision = this.constructionTerrain?.getRevision?.() ?? 0;
    if (
      collisionRevision === this.lastCollisionRevision
      && constructionRevision === this.lastConstructionRevision
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
        : (this.constructionTerrain?.heightAt?.(entry.x, entry.z)
          ?? this.terrain.heightAt(entry.x, entry.z)) + entry.heightOffset;
      if (hidden === entry.constructionHidden && Math.abs(adaptedY - entry.y) <= 0.002) continue;
      entry.constructionHidden = hidden;
      entry.y = adaptedY;
      this.#writeMatrix(entry, false);
      if (entry.mesh) changedMeshes.add(entry.mesh);
    }

    for (const mesh of changedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  #isPresentationExcluded(entry) {
    return this.presentationExclusions.some(exclusion => (
      presentationExclusionCoversVegetation(entry, exclusion)
    ));
  }

  #writeMatrix(entry, markDirty = true) {
    if (!entry.mesh || entry.index < 0) return;
    this.dummy.position.set(entry.x, entry.y, entry.z);
    this.dummy.rotation.set(0, entry.yaw, 0);
    if (entry.constructionHidden || entry.presentationHidden) this.dummy.scale.set(0, 0, 0);
    else this.dummy.scale.set(entry.scaleX, entry.scaleY, entry.scaleZ);
    this.dummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, this.dummy.matrix);
    if (markDirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }
}

function createGroundDetailMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true
  });
}

function createGeometryBuilder() {
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();

  const vertex = (x, y, z, hex) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    color.setHex(hex);
    colors.push(color.r, color.g, color.b);
    return index;
  };

  const quad = (a, b, c, d, hex) => {
    const ia = vertex(a[0], a[1], a[2], hex);
    const ib = vertex(b[0], b[1], b[2], hex);
    const ic = vertex(c[0], c[1], c[2], hex);
    const id = vertex(d[0], d[1], d[2], hex);
    indices.push(ia, ib, ic, ia, ic, id);
  };

  const build = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };

  return { quad, build };
}

function buildLeafLitterGeometry() {
  const builder = createGeometryBuilder();
  const leafColors = [
    0x765137,
    0x8a6442,
    0x65452f,
    0x9a7449,
    0x574333,
    0x80603f
  ];

  for (let leaf = 0; leaf < 12; leaf += 1) {
    const angle = leaf * 2.399963229728653 + (leaf % 3) * 0.19;
    const radius = 0.08 + (leaf % 5) * 0.11;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const yaw = angle * 0.73 + (leaf % 2) * 0.41;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const sideX = -dirZ;
    const sideZ = dirX;
    const length = 0.18 + (leaf % 4) * 0.038;
    const width = 0.065 + (leaf % 3) * 0.014;
    const y = 0.006 + (leaf % 4) * 0.0025;
    const tipX = cx + dirX * length;
    const tipZ = cz + dirZ * length;
    const tailX = cx - dirX * length * 0.56;
    const tailZ = cz - dirZ * length * 0.56;
    builder.quad(
      [tailX, y, tailZ],
      [cx + sideX * width, y + 0.002, cz + sideZ * width],
      [tipX, y + 0.004, tipZ],
      [cx - sideX * width, y + 0.001, cz - sideZ * width],
      leafColors[leaf % leafColors.length]
    );
  }

  const twigColors = [0x4b3528, 0x5c4030];
  for (let twig = 0; twig < 2; twig += 1) {
    const yaw = 0.65 + twig * 1.73;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const sideX = -dirZ * 0.018;
    const sideZ = dirX * 0.018;
    const half = 0.42 - twig * 0.08;
    const ox = twig === 0 ? -0.08 : 0.14;
    const oz = twig === 0 ? 0.09 : -0.12;
    builder.quad(
      [ox - dirX * half - sideX, 0.012, oz - dirZ * half - sideZ],
      [ox - dirX * half + sideX, 0.012, oz - dirZ * half + sideZ],
      [ox + dirX * half + sideX, 0.016, oz + dirZ * half + sideZ],
      [ox + dirX * half - sideX, 0.016, oz + dirZ * half - sideZ],
      twigColors[twig]
    );
  }

  return builder.build();
}

function buildRootFanGeometry() {
  const builder = createGeometryBuilder();
  const rootColors = [0x503827, 0x60432d, 0x6d4c32, 0x493427];
  const mossColors = [0x52673c, 0x607545];
  const rootCount = 5;

  for (let root = 0; root < rootCount; root += 1) {
    const angle = root * Math.PI * 2 / rootCount + (root % 2) * 0.22;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const sideX = -dirZ;
    const sideZ = dirX;
    const length = 0.72 + (root % 3) * 0.16;
    const bend = (root % 2 ? 1 : -1) * (0.08 + (root % 3) * 0.025);
    const segmentCount = 3;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const t0 = segment / segmentCount;
      const t1 = (segment + 1) / segmentCount;
      const width0 = 0.105 * (1 - t0 * 0.72);
      const width1 = 0.105 * (1 - t1 * 0.72);
      const center0X = dirX * length * t0 + sideX * bend * Math.sin(t0 * Math.PI);
      const center0Z = dirZ * length * t0 + sideZ * bend * Math.sin(t0 * Math.PI);
      const center1X = dirX * length * t1 + sideX * bend * Math.sin(t1 * Math.PI);
      const center1Z = dirZ * length * t1 + sideZ * bend * Math.sin(t1 * Math.PI);
      const y0 = 0.018 + Math.sin(t0 * Math.PI) * 0.075 * (1 - t0 * 0.35);
      const y1 = 0.018 + Math.sin(t1 * Math.PI) * 0.075 * (1 - t1 * 0.35);
      const color = rootColors[(root + segment) % rootColors.length];

      builder.quad(
        [center0X - sideX * width0, y0, center0Z - sideZ * width0],
        [center0X + sideX * width0, y0, center0Z + sideZ * width0],
        [center1X + sideX * width1, y1, center1Z + sideZ * width1],
        [center1X - sideX * width1, y1, center1Z - sideZ * width1],
        color
      );

      if (segment === 1 && root % 2 === 0) {
        const mossWidth = width0 * 0.64;
        builder.quad(
          [center0X - sideX * mossWidth, y0 + 0.006, center0Z - sideZ * mossWidth],
          [center0X + sideX * mossWidth, y0 + 0.006, center0Z + sideZ * mossWidth],
          [center1X + sideX * width1 * 0.52, y1 + 0.006, center1Z + sideZ * width1 * 0.52],
          [center1X - sideX * width1 * 0.52, y1 + 0.006, center1Z - sideZ * width1 * 0.52],
          mossColors[root % mossColors.length]
        );
      }
    }
  }

  return builder.build();
}
