import * as THREE from 'three';

export class DistantMountainSystem {
  constructor({ group, centerZ = -4, radiusScale = 1 }) {
    this.group = group;
    this.centerZ = centerZ;
    this.radiusScale = Math.max(1, radiusScale);
    this.state = 0x41c7d;
    this.mountainCount = 0;
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  create() {
    const geometry = buildLandmassGeometry();
    const farMaterial = new THREE.MeshStandardMaterial({
      color: 0x71837d,
      roughness: 1,
      metalness: 0,
      flatShading: false,
      fog: true
    });
    const hazeMaterial = new THREE.MeshStandardMaterial({
      color: 0x61776f,
      roughness: 1,
      metalness: 0,
      flatShading: false,
      fog: true
    });

    const haze = this.#createRing({
      geometry,
      material: hazeMaterial,
      count: 11,
      radiusMin: 325 * this.radiusScale,
      radiusMax: 370 * this.radiusScale,
      heightMin: 7,
      heightMax: 14,
      widthMin: 38,
      widthMax: 72,
      depthMin: 22,
      depthMax: 44,
      y: -3.5,
      angleOffset: 0.17,
      name: 'distant-haze-landmass'
    });

    const far = this.#createRing({
      geometry,
      material: farMaterial,
      count: 14,
      radiusMin: 385 * this.radiusScale,
      radiusMax: 455 * this.radiusScale,
      heightMin: 10,
      heightMax: 20,
      widthMin: 52,
      widthMax: 92,
      depthMin: 28,
      depthMax: 56,
      y: -4.2,
      angleOffset: 0.04,
      name: 'distant-landmass-silhouette'
    });

    this.group.add(haze, far);
    this.mountainCount = haze.count + far.count;
    return this.mountainCount;
  }

  #createRing({
    geometry,
    material,
    count,
    radiusMin,
    radiusMax,
    heightMin,
    heightMax,
    widthMin,
    widthMax,
    depthMin,
    depthMax,
    y,
    angleOffset,
    name
  }) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    for (let index = 0; index < count; index += 1) {
      const step = (index / count) * Math.PI * 2;
      const jitter = (this.random() - 0.5) * (Math.PI * 2 / count) * 0.7;
      const angle = step + jitter + angleOffset;
      const radius = radiusMin + this.random() * (radiusMax - radiusMin);
      const width = widthMin + this.random() * (widthMax - widthMin);
      const height = heightMin + this.random() * (heightMax - heightMin);
      const depth = depthMin + this.random() * (depthMax - depthMin);

      dummy.position.set(
        Math.cos(angle) * radius,
        y,
        this.centerZ + Math.sin(angle) * radius
      );
      dummy.rotation.set(0, -angle + Math.PI / 2 + (this.random() - 0.5) * 0.46, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function buildLandmassGeometry() {
  const ridge = [
    [-0.94, 0.22, -0.08],
    [-0.68, 0.44, 0.03],
    [-0.38, 0.34, -0.04],
    [-0.08, 0.58, 0.05],
    [0.22, 0.46, -0.03],
    [0.5, 0.64, 0.04],
    [0.76, 0.4, -0.02],
    [0.96, 0.2, 0.02]
  ];
  const vertices = [];

  for (const [x] of ridge) vertices.push(x, 0, -0.58);
  for (const [x, y, z] of ridge) vertices.push(x, y, z);
  for (const [x] of ridge) vertices.push(x, 0, 0.58);

  const indices = [];
  const row = ridge.length;
  for (let i = 0; i < row - 1; i += 1) {
    const frontA = i;
    const frontB = i + 1;
    const ridgeA = row + i;
    const ridgeB = row + i + 1;
    const backA = row * 2 + i;
    const backB = row * 2 + i + 1;

    indices.push(frontA, frontB, ridgeB, frontA, ridgeB, ridgeA);
    indices.push(ridgeA, ridgeB, backB, ridgeA, backB, backA);
    indices.push(frontA, backB, frontB, frontA, backA, backB);
  }

  indices.push(0, row, row * 2);
  indices.push(row - 1, row * 3 - 1, row * 2 - 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
