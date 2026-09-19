import * as THREE from 'three';
import { caveMineableSurfaceOwnedAt } from './CaveTerrainProfile.js';
import { terrainSurfaceColorAt } from './TerrainSurfacePresentation.js';

const ISO_LEVEL = 0;
const STATE_SCHEMA_VERSION = 1;
const TERRAIN_COLOR_DEPTH = 0.42;
const SUPPORT_SCAN_FRACTION = 0.25;

const CUBE_CORNERS = Object.freeze([
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
]);

const CUBE_TETRAHEDRA = Object.freeze([
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6]
]);

const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;
const averagePoint = points => {
  const result = new THREE.Vector3();
  for (const point of points) result.add(point);
  return result.multiplyScalar(1 / Math.max(1, points.length));
};

class MineableCaveVolume {
  constructor({ definition, terrain }) {
    this.definition = definition;
    this.terrain = terrain;
    this.config = definition.mineableVolume;
    this.excavations = [];
    this.raycaster = new THREE.Raycaster();
    this.tempColor = new THREE.Color();
    this.tempSurfaceColor = new THREE.Color();
    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempC = new THREE.Vector3();
    this.tempNormal = new THREE.Vector3();

    this.root = new THREE.Group();
    this.root.name = `mineable-cave-${definition.id}`;
    this.root.position.set(definition.x, 0, definition.z);
    this.root.rotation.y = definition.yaw;
    this.root.userData.explorationPoi = definition.id;
    this.root.userData.poiType = definition.type;
    this.root.userData.mineableVolume = true;

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
      side: THREE.DoubleSide,
      // The cave volume intentionally overlaps untouched island terrain outside
      // the natural mouth. Bias it behind the island surface so that overlap
      // seals the seam without z-fighting or visible ground cracks.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = `${definition.id}-mineable-ground`;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData.mineableCave = true;
    this.mesh.userData.caveId = definition.id;
    this.root.add(this.mesh);

    this.#configureGrid();
    this.#resetField();
    this.#rebuildGeometry();
  }

  containsHorizontal(worldX, worldZ) {
    const local = this.#worldToLocalXZ(worldX, worldZ);
    return (
      local.x >= this.xMin &&
      local.x <= this.xMax &&
      local.z >= this.zMin &&
      local.z <= this.zMax
    );
  }

  isSolidAt(worldX, worldY, worldZ) {
    const local = this.#worldToLocalXZ(worldX, worldZ);
    if (
      local.x < this.xMin ||
      local.x > this.xMax ||
      local.z < this.zMin ||
      local.z > this.zMax ||
      worldY < this.yMin ||
      worldY > this.yMax
    ) return false;
    return this.#sampleField(local.x, worldY, local.z) >= ISO_LEVEL;
  }

  supportHeightAt(worldX, worldZ, {
    referenceY = null,
    maxStepUp = 0.58,
    airborne = false
  } = {}) {
    const local = this.#worldToLocalXZ(worldX, worldZ);
    if (
      local.x < this.xMin ||
      local.x > this.xMax ||
      local.z < this.zMin ||
      local.z > this.zMax
    ) return null;

    const surfaceY = this.#surfaceYAtLocal(local.x, local.z);
    const reference = Number.isFinite(referenceY) ? referenceY : surfaceY;
    const allowance = airborne ? 0.18 : Math.max(0, Number(maxStepUp) || 0);
    let previousY = Math.min(this.yMax, reference + allowance + this.stepY * 0.5);
    let previousDensity = this.#sampleField(local.x, previousY, local.z);
    const scanStep = Math.max(0.08, this.config.cellSize * SUPPORT_SCAN_FRACTION);

    // The sample immediately above the Ranger's feet should normally be empty.
    // If a restore or a coarse mesh leaves it marginally inside solid material,
    // search upward a short distance before beginning the downward support scan.
    if (previousDensity >= ISO_LEVEL) {
      for (let lift = scanStep; lift <= this.config.cellSize * 1.5; lift += scanStep) {
        const testY = Math.min(this.yMax, previousY + lift);
        const testDensity = this.#sampleField(local.x, testY, local.z);
        if (testDensity < ISO_LEVEL) {
          previousY = testY;
          previousDensity = testDensity;
          break;
        }
      }
    }

    for (let y = previousY - scanStep; y >= this.yMin; y -= scanStep) {
      const density = this.#sampleField(local.x, y, local.z);
      if (previousDensity < ISO_LEVEL && density >= ISO_LEVEL) {
        const span = previousDensity - density;
        const t = Math.abs(span) > 0.000001
          ? THREE.MathUtils.clamp(previousDensity / span, 0, 1)
          : 0;
        return lerp(previousY, y, t);
      }
      previousY = y;
      previousDensity = density;
    }
    return null;
  }

  getMineTarget({ aim, playerPosition = null }) {
    if (!aim?.origin || !aim?.direction) return null;
    const direction = this.tempA.copy(aim.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    this.root.updateMatrixWorld(true);
    this.raycaster.set(aim.origin, direction);
    this.raycaster.near = 0;
    this.raycaster.far = this.config.mineReach;
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit) return null;
    if (
      playerPosition &&
      hit.point.distanceTo(playerPosition) > this.config.mineReach + 1.2
    ) return null;

    const local = this.#worldPointToLocal(hit.point);
    if (!this.#canExcavateAtLocal(local)) return null;

    // Outside the authored mouth, the normal hill surface still visually owns
    // the top of this finite underground volume. Do not let the Pickaxe target
    // that hidden duplicate surface through the heightfield.
    const depthBelowSurface = this.#surfaceYAtLocal(local.x, local.z) - local.y;
    if (
      depthBelowSurface < this.config.cellSize * 0.55 &&
      !caveMineableSurfaceOwnedAt(this.definition, hit.point.x, hit.point.z)
    ) return null;

    return {
      type: 'mineable-cave',
      caveId: this.definition.id,
      label: 'Cave ground',
      icon: 'pickaxe',
      actionLabel: 'Mine ground',
      position: hit.point.clone(),
      point: hit.point.clone(),
      direction: direction.clone()
    };
  }

  mine(target) {
    if (target?.caveId !== this.definition.id || !target.point || !target.direction) return null;
    const direction = this.tempA.copy(target.direction);
    if (direction.lengthSq() < 0.000001) return null;
    direction.normalize();

    const centerWorld = this.tempB.copy(target.point).addScaledVector(direction, this.config.mineInset);
    const centerLocal = this.#worldPointToLocal(centerWorld);
    if (!this.#canExcavateAtLocal(centerLocal)) return null;

    const changed = this.#applyExcavationLocal(centerLocal, this.config.mineRadius, true);
    if (!changed) return null;
    this.#rebuildGeometry();

    return {
      mined: true,
      caveId: this.definition.id,
      position: target.point.clone(),
      radius: this.config.mineRadius,
      excavationCount: this.excavations.length
    };
  }

  captureState() {
    return {
      id: this.definition.id,
      excavations: this.excavations.map(excavation => ({
        x: Number(excavation.x.toFixed(4)),
        y: Number(excavation.y.toFixed(4)),
        z: Number(excavation.z.toFixed(4)),
        radius: Number(excavation.radius.toFixed(4))
      }))
    };
  }

  restoreState(state) {
    this.excavations.length = 0;
    this.#resetField();
    for (const excavation of Array.isArray(state?.excavations) ? state.excavations : []) {
      const local = new THREE.Vector3(
        Number(excavation.x),
        Number(excavation.y),
        Number(excavation.z)
      );
      const radius = Number(excavation.radius);
      if (
        ![local.x, local.y, local.z, radius].every(Number.isFinite) ||
        radius <= 0 ||
        !this.#canExcavateAtLocal(local)
      ) continue;
      this.#applyExcavationLocal(local, radius, true);
    }
    this.#rebuildGeometry();
    return true;
  }

  getDebugState() {
    return {
      id: this.definition.id,
      bounds: {
        xMin: this.xMin,
        xMax: this.xMax,
        yMin: this.yMin,
        yMax: this.yMax,
        zMin: this.zMin,
        zMax: this.zMax
      },
      entryFloorY: this.entryFloorY,
      rearFloorY: this.rearFloorY,
      excavationCount: this.excavations.length,
      vertexCount: this.mesh.geometry.getAttribute('position')?.count ?? 0
    };
  }

  #configureGrid() {
    const config = this.config;
    this.xMin = -config.halfWidth;
    this.xMax = config.halfWidth;
    this.zMin = -config.frontDepth;
    this.zMax = config.backDepth;

    let maxSurfaceY = -Infinity;
    for (let xi = 0; xi <= 6; xi += 1) {
      const x = lerp(this.xMin, this.xMax, xi / 6);
      for (let zi = 0; zi <= 8; zi += 1) {
        const z = lerp(this.zMin, this.zMax, zi / 8);
        maxSurfaceY = Math.max(maxSurfaceY, this.#surfaceYAtLocal(x, z));
      }
    }

    this.entryFloorY = this.#surfaceYAtLocal(0, config.tunnelStartZ) - config.entranceFloorOffset;
    this.rearFloorY = this.entryFloorY - config.tunnelDrop;
    this.yMin = Math.min(this.entryFloorY, this.rearFloorY) - config.floorDepth;
    this.yMax = maxSurfaceY + config.surfaceHeadroom;

    this.countX = Math.max(3, Math.ceil((this.xMax - this.xMin) / config.cellSize) + 1);
    this.countY = Math.max(3, Math.ceil((this.yMax - this.yMin) / config.cellSize) + 1);
    this.countZ = Math.max(3, Math.ceil((this.zMax - this.zMin) / config.cellSize) + 1);
    this.stepX = (this.xMax - this.xMin) / (this.countX - 1);
    this.stepY = (this.yMax - this.yMin) / (this.countY - 1);
    this.stepZ = (this.zMax - this.zMin) / (this.countZ - 1);
    this.field = new Float32Array(this.countX * this.countY * this.countZ);
  }

  #resetField() {
    for (let iz = 0; iz < this.countZ; iz += 1) {
      const z = this.zMin + iz * this.stepZ;
      for (let iy = 0; iy < this.countY; iy += 1) {
        const y = this.yMin + iy * this.stepY;
        for (let ix = 0; ix < this.countX; ix += 1) {
          const x = this.xMin + ix * this.stepX;
          this.field[this.#index(ix, iy, iz)] = this.#initialDensityAtLocal(x, y, z);
        }
      }
    }
  }

  #initialDensityAtLocal(x, y, z) {
    const terrainDensity = this.#surfaceYAtLocal(x, z) - y;
    const config = this.config;
    const clampedZ = THREE.MathUtils.clamp(z, config.tunnelStartZ, config.tunnelEndZ);
    const progress = clamp01(
      (clampedZ - config.tunnelStartZ) /
      Math.max(0.001, config.tunnelEndZ - config.tunnelStartZ)
    );
    const floorY = lerp(this.entryFloorY, this.rearFloorY, progress);
    const centerY = floorY + config.tunnelHalfHeight * 0.96;
    const outsideZ = z < config.tunnelStartZ
      ? config.tunnelStartZ - z
      : z > config.tunnelEndZ
        ? z - config.tunnelEndZ
        : 0;
    const tunnelDistance = Math.sqrt(
      (x / config.tunnelHalfWidth) ** 2 +
      ((y - centerY) / config.tunnelHalfHeight) ** 2 +
      (outsideZ / config.tunnelEndCapDepth) ** 2
    ) - 1;
    const tunnelDensity = tunnelDistance * Math.min(
      config.tunnelHalfWidth,
      config.tunnelHalfHeight,
      config.tunnelEndCapDepth
    );
    return Math.min(terrainDensity, tunnelDensity);
  }

  #applyExcavationLocal(center, radius, record) {
    const minX = Math.max(0, Math.floor((center.x - radius - this.xMin) / this.stepX) - 1);
    const maxX = Math.min(this.countX - 1, Math.ceil((center.x + radius - this.xMin) / this.stepX) + 1);
    const minY = Math.max(0, Math.floor((center.y - radius - this.yMin) / this.stepY) - 1);
    const maxY = Math.min(this.countY - 1, Math.ceil((center.y + radius - this.yMin) / this.stepY) + 1);
    const minZ = Math.max(0, Math.floor((center.z - radius - this.zMin) / this.stepZ) - 1);
    const maxZ = Math.min(this.countZ - 1, Math.ceil((center.z + radius - this.zMin) / this.stepZ) + 1);
    let changed = false;

    for (let iz = minZ; iz <= maxZ; iz += 1) {
      const z = this.zMin + iz * this.stepZ;
      for (let iy = minY; iy <= maxY; iy += 1) {
        const y = this.yMin + iy * this.stepY;
        for (let ix = minX; ix <= maxX; ix += 1) {
          const x = this.xMin + ix * this.stepX;
          const sphereDensity = Math.hypot(x - center.x, y - center.y, z - center.z) - radius;
          const index = this.#index(ix, iy, iz);
          if (sphereDensity < this.field[index] - 0.00001) {
            this.field[index] = sphereDensity;
            changed = true;
          }
        }
      }
    }

    if (changed && record) {
      this.excavations.push({
        x: center.x,
        y: center.y,
        z: center.z,
        radius
      });
    }
    return changed;
  }

  #canExcavateAtLocal(local) {
    const padding = this.config.boundaryPadding;
    return (
      Math.abs(local.x) <= this.config.halfWidth - padding &&
      local.z >= this.zMin + padding * 0.35 &&
      local.z <= this.zMax - padding &&
      local.y >= this.yMin + padding
    );
  }

  #rebuildGeometry() {
    const positions = [];
    const colors = [];
    const cubePoints = Array.from({ length: 8 }, () => new THREE.Vector3());
    const cubeValues = new Array(8);

    for (let iz = 0; iz < this.countZ - 1; iz += 1) {
      for (let iy = 0; iy < this.countY - 1; iy += 1) {
        for (let ix = 0; ix < this.countX - 1; ix += 1) {
          for (let corner = 0; corner < 8; corner += 1) {
            const [ox, oy, oz] = CUBE_CORNERS[corner];
            const sx = ix + ox;
            const sy = iy + oy;
            const sz = iz + oz;
            cubePoints[corner].set(
              this.xMin + sx * this.stepX,
              this.yMin + sy * this.stepY,
              this.zMin + sz * this.stepZ
            );
            cubeValues[corner] = this.field[this.#index(sx, sy, sz)];
          }

          for (const tetra of CUBE_TETRAHEDRA) {
            this.#polygonizeTetrahedron(tetra, cubePoints, cubeValues, positions, colors);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const previous = this.mesh.geometry;
    this.mesh.geometry = geometry;
    previous?.dispose?.();
    this.mesh.userData.excavationCount = this.excavations.length;
    this.mesh.userData.volumeSchema = STATE_SCHEMA_VERSION;
    this.root.updateMatrixWorld(true);
  }

  #polygonizeTetrahedron(tetra, cubePoints, cubeValues, positions, colors) {
    const inside = [];
    const outside = [];
    for (const corner of tetra) {
      if (cubeValues[corner] >= ISO_LEVEL) inside.push(corner);
      else outside.push(corner);
    }
    if (inside.length === 0 || inside.length === 4) return;

    if (inside.length === 1 || inside.length === 3) {
      const solid = inside.length === 1 ? inside : outside;
      const empty = inside.length === 1 ? outside : inside;
      const pivot = solid[0];
      const points = empty.map(corner => this.#interpolateIso(
        cubePoints[pivot],
        cubePoints[corner],
        cubeValues[pivot],
        cubeValues[corner]
      ));
      const outward = inside.length === 1
        ? averagePoint(outside.map(corner => cubePoints[corner])).sub(cubePoints[pivot])
        : cubePoints[outside[0]].clone().sub(averagePoint(inside.map(corner => cubePoints[corner])));
      this.#pushTriangle(points[0], points[1], points[2], outward, positions, colors);
      return;
    }

    const [insideA, insideB] = inside;
    const [outsideA, outsideB] = outside;
    const q0 = this.#interpolateIso(cubePoints[insideA], cubePoints[outsideA], cubeValues[insideA], cubeValues[outsideA]);
    const q1 = this.#interpolateIso(cubePoints[insideB], cubePoints[outsideA], cubeValues[insideB], cubeValues[outsideA]);
    const q2 = this.#interpolateIso(cubePoints[insideB], cubePoints[outsideB], cubeValues[insideB], cubeValues[outsideB]);
    const q3 = this.#interpolateIso(cubePoints[insideA], cubePoints[outsideB], cubeValues[insideA], cubeValues[outsideB]);
    const outward = averagePoint(outside.map(corner => cubePoints[corner]))
      .sub(averagePoint(inside.map(corner => cubePoints[corner])));
    this.#pushTriangle(q0, q1, q2, outward, positions, colors);
    this.#pushTriangle(q0, q2, q3, outward, positions, colors);
  }

  #interpolateIso(pointA, pointB, densityA, densityB) {
    const denominator = densityA - densityB;
    const t = Math.abs(denominator) > 0.000001
      ? THREE.MathUtils.clamp((densityA - ISO_LEVEL) / denominator, 0, 1)
      : 0.5;
    return new THREE.Vector3().lerpVectors(pointA, pointB, t);
  }

  #pushTriangle(a, b, c, outward, positions, colors) {
    this.tempNormal
      .copy(this.tempB.subVectors(b, a))
      .cross(this.tempC.subVectors(c, a));
    let p1 = b;
    let p2 = c;
    if (this.tempNormal.dot(outward) < 0) {
      p1 = c;
      p2 = b;
    }

    for (const point of [a, p1, p2]) {
      positions.push(point.x, point.y, point.z);
      const color = this.#colorAtLocal(point);
      colors.push(color.r, color.g, color.b);
    }
  }

  #colorAtLocal(point) {
    const world = this.#localPointToWorld(point);
    const surfaceY = this.#surfaceYAtLocal(point.x, point.z);
    const depth = Math.max(0, surfaceY - point.y);
    if (depth <= TERRAIN_COLOR_DEPTH) {
      const sand = this.terrain.isSandAt?.(world.x, world.z) ?? false;
      const region = sand ? null : this.terrain.regionAt?.(world.x, world.z);
      const jungleSoilStrength = region?.biome === 'jungle'
        ? (region.strength ?? 0) * (region.ground?.soilStrength ?? 0)
        : 0;
      terrainSurfaceColorAt({
        x: world.x,
        z: world.z,
        y: surfaceY,
        slope: this.terrain.slopeAt?.(world.x, world.z) ?? 0,
        sand,
        forestCover: sand ? 0 : (this.terrain.forestCoverAt?.(world.x, world.z) ?? 0),
        grassPatchStrength: sand ? 0 : (this.terrain.grassPatchStrengthAt?.(world.x, world.z) ?? 0),
        jungleSoilStrength
      }, this.tempSurfaceColor);
      return this.tempColor.copy(this.tempSurfaceColor);
    }

    const stoneBlend = THREE.MathUtils.clamp((depth - 0.65) / 3.2, 0, 0.88);
    const variation = Math.sin(world.x * 0.71 + point.y * 1.13 + world.z * 0.47) * 0.045;
    this.tempColor.setHex(0x6b533d).lerp(new THREE.Color(0x625f57), stoneBlend);
    this.tempColor.offsetHSL(0, 0, variation);
    return this.tempColor;
  }

  #sampleField(x, y, z) {
    const fx = THREE.MathUtils.clamp((x - this.xMin) / this.stepX, 0, this.countX - 1);
    const fy = THREE.MathUtils.clamp((y - this.yMin) / this.stepY, 0, this.countY - 1);
    const fz = THREE.MathUtils.clamp((z - this.zMin) / this.stepZ, 0, this.countZ - 1);
    const x0 = Math.min(this.countX - 2, Math.floor(fx));
    const y0 = Math.min(this.countY - 2, Math.floor(fy));
    const z0 = Math.min(this.countZ - 2, Math.floor(fz));
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;

    const v000 = this.field[this.#index(x0, y0, z0)];
    const v100 = this.field[this.#index(x0 + 1, y0, z0)];
    const v010 = this.field[this.#index(x0, y0 + 1, z0)];
    const v110 = this.field[this.#index(x0 + 1, y0 + 1, z0)];
    const v001 = this.field[this.#index(x0, y0, z0 + 1)];
    const v101 = this.field[this.#index(x0 + 1, y0, z0 + 1)];
    const v011 = this.field[this.#index(x0, y0 + 1, z0 + 1)];
    const v111 = this.field[this.#index(x0 + 1, y0 + 1, z0 + 1)];

    const x00 = lerp(v000, v100, tx);
    const x10 = lerp(v010, v110, tx);
    const x01 = lerp(v001, v101, tx);
    const x11 = lerp(v011, v111, tx);
    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
  }

  #surfaceYAtLocal(localX, localZ) {
    const world = this.#localToWorldXZ(localX, localZ);
    return this.terrain.heightAt(world.x, world.z);
  }

  #localToWorldXZ(localX, localZ) {
    const c = Math.cos(this.definition.yaw);
    const s = Math.sin(this.definition.yaw);
    return {
      x: this.definition.x + localX * c + localZ * s,
      z: this.definition.z - localX * s + localZ * c
    };
  }

  #worldToLocalXZ(worldX, worldZ) {
    const dx = worldX - this.definition.x;
    const dz = worldZ - this.definition.z;
    const c = Math.cos(this.definition.yaw);
    const s = Math.sin(this.definition.yaw);
    return {
      x: dx * c - dz * s,
      z: dx * s + dz * c
    };
  }

  #localPointToWorld(point) {
    const xz = this.#localToWorldXZ(point.x, point.z);
    return { x: xz.x, y: point.y, z: xz.z };
  }

  #worldPointToLocal(point) {
    const xz = this.#worldToLocalXZ(point.x, point.z);
    return new THREE.Vector3(xz.x, point.y, xz.z);
  }

  #index(ix, iy, iz) {
    return ix + this.countX * (iy + this.countY * iz);
  }
}

export class MineableCaveSystem {
  constructor({ group, terrain, chunks = null }) {
    if (!group || !terrain) throw new Error('MineableCaveSystem requires group and terrain');
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.instances = new Map();
  }

  create(definitions) {
    let created = 0;
    for (const definition of definitions) {
      if (definition.type !== 'cave' || !definition.mineableVolume) continue;
      const volume = new MineableCaveVolume({ definition, terrain: this.terrain });
      if (this.chunks) this.chunks.addObjectAt(volume.root, definition.x, definition.z);
      else this.group.add(volume.root);
      this.instances.set(definition.id, volume);
      created += 1;
    }
    return created;
  }

  getPresentationExclusions() {
    const exclusions = [];
    for (const volume of this.instances.values()) {
      const definition = volume.definition;
      const config = definition.mineableVolume;
      const radius = Number(config?.vegetationExclusionRadius);
      if (!Number.isFinite(radius) || radius <= 0) continue;
      const localZ = Number(config.vegetationExclusionCenterZ ?? config.tunnelStartZ ?? 0);
      const c = Math.cos(definition.yaw);
      const s = Math.sin(definition.yaw);
      exclusions.push({
        id: `mineable-cave-mouth:${definition.id}`,
        x: definition.x + localZ * s,
        z: definition.z + localZ * c,
        radius
      });
    }
    return exclusions;
  }

  getMineTarget({ aim, playerPosition = null } = {}) {
    let nearest = null;
    for (const volume of this.instances.values()) {
      const target = volume.getMineTarget({ aim, playerPosition });
      if (!target) continue;
      const distance = aim?.origin ? target.point.distanceTo(aim.origin) : 0;
      if (!nearest || distance < nearest.distance) nearest = { target, distance };
    }
    return nearest?.target ?? null;
  }

  mine(target) {
    return this.instances.get(target?.caveId)?.mine(target) ?? null;
  }

  supportHeightAt(x, z, options = {}) {
    let support = null;
    for (const volume of this.instances.values()) {
      if (!volume.containsHorizontal(x, z)) continue;
      const candidate = volume.supportHeightAt(x, z, options);
      if (!Number.isFinite(candidate)) continue;
      if (!Number.isFinite(support) || candidate > support) support = candidate;
    }
    return support;
  }

  isSolidAt(x, y, z) {
    for (const volume of this.instances.values()) {
      if (!volume.containsHorizontal(x, z)) continue;
      if (volume.isSolidAt(x, y, z)) return true;
    }
    return false;
  }

  captureState() {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      caves: [...this.instances.values()].map(volume => volume.captureState())
    };
  }

  restoreState(state) {
    if (!state || state.schemaVersion !== STATE_SCHEMA_VERSION) return false;
    const caves = Array.isArray(state.caves) ? state.caves : [];
    for (const volume of this.instances.values()) {
      const saved = caves.find(entry => entry?.id === volume.definition.id);
      volume.restoreState(saved ?? { excavations: [] });
    }
    return true;
  }

  getDebugState(caveId) {
    return this.instances.get(caveId)?.getDebugState() ?? null;
  }
}
