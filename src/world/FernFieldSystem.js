import * as THREE from 'three';
import { ReactiveVegetationFieldSystem } from './GrassFieldSystem.js';

export class FernFieldSystem extends ReactiveVegetationFieldSystem {
  constructor({ group, terrain, scatter, chunks = null, maxInstances = 3000 }) {
    super({
      group,
      terrain,
      scatter,
      chunks,
      geometry: buildFernGeometry(),
      material: new THREE.MeshStandardMaterial({
        color: 0x3f7d47,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        flatShading: true
      }),
      densityAt: (x, z) => terrain.fernDensityAt(x, z),
      scaleAt: random => {
        const footprint = 0.72 + random() * 0.62;
        return {
          x: footprint,
          y: 0.68 + random() * 0.72,
          z: footprint * (0.9 + random() * 0.2)
        };
      },
      maxInstances,
      seed: 0x73ae1,
      meshName: 'interactive-fern-understory',
      clearancePadding: 0.16,
      cellSize: 3.4,
      interactionRadius: 2.9,
      innerRadius: 0.55,
      maxBend: 0.5,
      maxCompression: 0.1,
      followSpeed: 13,
      recoverySpeed: 6.5,
      minimumMoveSpeed: 0.12,
      baseLean: 0.08,
      heightOffset: 0.018
    });
  }
}

function buildFernGeometry() {
  const positions = [];
  const indices = [];
  const frondCount = 8;
  const segments = 4;

  for (let frond = 0; frond < frondCount; frond += 1) {
    const angle = frond * (Math.PI * 2 / frondCount) + (frond % 2 ? 0.13 : -0.08);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const acrossX = -dirZ;
    const acrossZ = dirX;
    const length = 0.72 + (frond % 3) * 0.08;
    const lift = 0.42 + (frond % 2) * 0.08;
    const base = positions.length / 3;

    for (let level = 0; level <= segments; level += 1) {
      const t = level / segments;
      const radial = length * (0.08 + t * 0.92);
      const arch = Math.sin(t * Math.PI * 0.88);
      const centerX = dirX * radial;
      const centerZ = dirZ * radial;
      const centerY = 0.06 + lift * arch + t * 0.08;
      const widthProfile = Math.sin(Math.min(1, t * 1.12) * Math.PI) * 0.18 + 0.025;
      const half = widthProfile * (1 - t * 0.6);
      positions.push(
        centerX - acrossX * half, centerY, centerZ - acrossZ * half,
        centerX + acrossX * half, centerY, centerZ + acrossZ * half
      );
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const a = base + segment * 2;
      const b = a + 1;
      const c = a + 3;
      const d = a + 2;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
