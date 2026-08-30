import * as THREE from 'three';

export class DistantMountainSystem {
  constructor({ group, centerZ = -4 }) {
    this.group = group;
    this.centerZ = centerZ;
    this.state = 0x41c7d;
    this.mountainCount = 0;
  }

  random() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  create() {
    const geometry = buildMountainGeometry();
    const farMaterial = new THREE.MeshStandardMaterial({
      color: 0x526966,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      fog: true
    });
    const hazeMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f827c,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      fog: true
    });

    const far = this.#createRing({
      geometry,
      material: farMaterial,
      count: 22,
      radiusMin: 282,
      radiusMax: 320,
      heightMin: 22,
      heightMax: 46,
      widthMin: 14,
      widthMax: 31,
      depthMin: 10,
      depthMax: 23,
      y: -1.35,
      angleOffset: 0.08,
      name: 'distant-mountain-silhouette'
    });

    const haze = this.#createRing({
      geometry,
      material: hazeMaterial,
      count: 15,
      radiusMin: 245,
      radiusMax: 278,
      heightMin: 10,
      heightMax: 24,
      widthMin: 12,
      widthMax: 25,
      depthMin: 8,
      depthMax: 18,
      y: -1.5,
      angleOffset: 0.19,
      name: 'distant-haze-ridge'
    });

    this.group.add(haze, far);
    this.mountainCount = far.count + haze.count;
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
      const jitter = (this.random() - 0.5) * (Math.PI * 2 / count) * 0.58;
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
      dummy.rotation.set(0, -angle + Math.PI / 2 + (this.random() - 0.5) * 0.5, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function buildMountainGeometry() {
  const vertices = [
    -1.0, 0, -0.72,
    -0.2, 0, -1.0,
    0.82, 0, -0.66,
    1.0, 0, 0.36,
    0.24, 0, 0.94,
    -0.86, 0, 0.7,

    -0.52, 0.42, -0.38,
    0.0, 0.48, -0.55,
    0.48, 0.4, -0.22,
    0.42, 0.43, 0.4,
    -0.08, 0.5, 0.5,
    -0.48, 0.4, 0.25,

    0.08, 1, -0.06
  ];
  const indices = [];

  for (let i = 0; i < 6; i += 1) {
    const next = (i + 1) % 6;
    indices.push(i, next, 6 + next, i, 6 + next, 6 + i);
    indices.push(6 + i, 6 + next, 12);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
