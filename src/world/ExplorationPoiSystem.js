import * as THREE from 'three';
import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';

const ROCK_COLOR = 0x5f5b52;
const ROCK_DARK = 0x48453f;
const ROCK_EARTH = 0x666252;
const CAVE_FLOOR = 0x34302a;
const CAVE_APPROACH = 0x625746;

export class ExplorationPoiSystem {
  constructor({ group, terrain, chunks = null, collision = null }) {
    this.group = group;
    this.terrain = terrain;
    this.chunks = chunks;
    this.collision = collision;
    this.instances = new Map();
  }

  create() {
    let created = 0;
    for (const definition of EXPLORATION_POIS) {
      if (definition.type !== 'cave') continue;
      this.#createCaveEntrance(definition);
      created += 1;
    }
    return created;
  }

  getDefinitions() {
    return EXPLORATION_POIS.map(definition => ({ ...definition }));
  }

  #createCaveEntrance(definition) {
    const baseY = this.terrain.heightAt(definition.x, definition.z) + 0.04;
    const root = new THREE.Group();
    root.name = `exploration-poi-${definition.id}`;
    root.userData.explorationPoi = definition.id;
    root.userData.poiType = definition.type;
    root.position.set(definition.x, baseY, definition.z);
    root.rotation.y = definition.yaw;

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: ROCK_COLOR,
      roughness: 1,
      flatShading: true
    });
    const darkRockMaterial = new THREE.MeshStandardMaterial({
      color: ROCK_DARK,
      roughness: 1,
      flatShading: true
    });
    const earthRockMaterial = new THREE.MeshStandardMaterial({
      color: ROCK_EARTH,
      roughness: 1,
      flatShading: true
    });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const sideX = definition.mouthWidth * 0.5 + 0.28;

    this.#createCaveLandform({
      definition,
      baseY,
      root,
      geometry: rockGeometry,
      rockMaterial,
      earthRockMaterial
    });

    this.#createEntranceArch({
      definition,
      root,
      geometry: rockGeometry,
      rockMaterial,
      darkRockMaterial,
      sideX
    });

    this.#createTunnelRibs({
      definition,
      root,
      geometry: rockGeometry,
      darkRockMaterial
    });

    const darkness = this.#createDarkInterior(definition);
    root.add(darkness);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(definition.mouthWidth * 0.76, definition.depth * 0.96),
      new THREE.MeshStandardMaterial({ color: CAVE_FLOOR, roughness: 1, side: THREE.DoubleSide })
    );
    floor.name = `${definition.id}-floor`;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.055, definition.depth * 0.48);
    floor.receiveShadow = true;
    root.add(floor);

    const approach = this.#createTerrainConformingApproach(definition, baseY);
    root.add(approach);

    if (this.chunks) this.chunks.addObjectAt(root, definition.x, definition.z);
    else this.group.add(root);
    this.instances.set(definition.id, root);

    if (this.collision) {
      const c = Math.cos(definition.yaw);
      const s = Math.sin(definition.yaw);
      for (const side of [-1, 1]) {
        for (const localZ of [1.2, 4.4]) {
          const localX = side * sideX;
          const x = definition.x + localX * c + localZ * s;
          const z = definition.z - localX * s + localZ * c;
          this.collision.addObstacle({
            x,
            z,
            radius: 1.55,
            type: 'cave-rock',
            label: `${definition.id}-${side < 0 ? 'left' : 'right'}-${localZ}`,
            bottomY: baseY - 0.2,
            topY: baseY + definition.mouthHeight + 1.5
          });
        }
      }
    }
  }

  #createCaveLandform({ definition, baseY, root, geometry, rockMaterial, earthRockMaterial }) {
    const landform = new THREE.Group();
    landform.name = `${definition.id}-landform`;

    const masses = [
      { x: -5.15, z: 3.6, scale: [3.25, 2.35, 3.9], rotation: [0.02, -0.2, -0.08] },
      { x: 5.05, z: 3.85, scale: [3.2, 2.45, 4.05], rotation: [-0.04, 0.24, 0.08] },
      { x: -3.35, z: 6.0, scale: [3.45, 2.5, 3.6], rotation: [0.08, 0.18, -0.04] },
      { x: 3.2, z: 6.15, scale: [3.4, 2.55, 3.7], rotation: [-0.05, -0.16, 0.06] },
      { x: 0, z: 6.7, scale: [4.65, 2.65, 4.1], rotation: [0.04, 0.1, -0.02] },
      { x: 0.2, z: 9.1, scale: [5.0, 2.15, 3.15], rotation: [-0.03, -0.08, 0.03] }
    ];

    masses.forEach((mass, index) => {
      const terrainY = this.#terrainRelativeY(definition, baseY, mass.x, mass.z);
      this.#addRock({
        parent: landform,
        geometry,
        material: index < 2 ? rockMaterial : earthRockMaterial,
        name: `${definition.id}-landform-rock-${index}`,
        position: [mass.x, terrainY + mass.scale[1] * 0.58, mass.z],
        scale: mass.scale,
        rotation: mass.rotation
      });
    });

    root.add(landform);
  }

  #createEntranceArch({ definition, root, geometry, rockMaterial, darkRockMaterial, sideX }) {
    const archGroup = new THREE.Group();
    archGroup.name = `${definition.id}-entrance-arch`;

    const sideRows = [
      { z: 0.25, offset: 0, y: 1.35, scale: [1.72, 1.95, 1.7] },
      { z: 1.95, offset: 0.14, y: 1.52, scale: [1.82, 2.1, 1.82] },
      { z: 3.85, offset: 0.28, y: 1.7, scale: [1.95, 2.25, 1.95] }
    ];

    for (const side of [-1, 1]) {
      sideRows.forEach((row, index) => {
        this.#addRock({
          parent: archGroup,
          geometry,
          material: index === sideRows.length - 1 ? darkRockMaterial : rockMaterial,
          name: `${definition.id}-side-${side < 0 ? 'left' : 'right'}-${index}`,
          position: [side * (sideX + row.offset), row.y, row.z],
          scale: row.scale,
          rotation: [(index - 1) * 0.07, side * (0.15 + index * 0.09), side * 0.07]
        });
      });
    }

    const crownCount = 7;
    for (let index = 0; index < crownCount; index += 1) {
      const t = index / (crownCount - 1);
      const localX = THREE.MathUtils.lerp(-definition.mouthWidth * 0.45, definition.mouthWidth * 0.45, t);
      const arch = 1 - Math.abs(t - 0.5) * 2;
      this.#addRock({
        parent: archGroup,
        geometry,
        material: index === 0 || index === crownCount - 1 ? rockMaterial : darkRockMaterial,
        name: `${definition.id}-crown-${index}`,
        position: [localX, definition.mouthHeight - 0.38 + arch * 0.68, 0.5 + Math.abs(t - 0.5) * 0.34],
        scale: [1.28 + arch * 0.16, 1.28 + arch * 0.24, 1.55],
        rotation: [0.06 * (index - 3), 0.11 * (index - 3), 0.08 * (t - 0.5)]
      });
    }

    root.add(archGroup);
  }

  #createTunnelRibs({ definition, root, geometry, darkRockMaterial }) {
    const tunnel = new THREE.Group();
    tunnel.name = `${definition.id}-tunnel-ribs`;
    const depths = [1.9, 3.45, 5.1, 6.65];

    depths.forEach((localZ, index) => {
      const narrowing = 1 - index * 0.055;
      const sideX = definition.mouthWidth * 0.41 * narrowing;
      const sideScaleY = definition.mouthHeight * 0.3;
      for (const side of [-1, 1]) {
        this.#addRock({
          parent: tunnel,
          geometry,
          material: darkRockMaterial,
          name: `${definition.id}-tunnel-rib-${index}-${side < 0 ? 'left' : 'right'}`,
          position: [side * sideX, definition.mouthHeight * 0.35, localZ],
          scale: [0.86, sideScaleY, 1.05],
          rotation: [0.08 * (index % 2), side * 0.08, side * 0.08]
        });
      }

      this.#addRock({
        parent: tunnel,
        geometry,
        material: darkRockMaterial,
        name: `${definition.id}-tunnel-rib-${index}-crown`,
        position: [0, definition.mouthHeight * 0.82, localZ + 0.08],
        scale: [definition.mouthWidth * 0.28 * narrowing, 0.72, 1.02],
        rotation: [0.04, index % 2 === 0 ? 0.06 : -0.05, 0.02]
      });
    });

    root.add(tunnel);
  }

  #createDarkInterior(definition) {
    const width = definition.mouthWidth;
    const height = definition.mouthHeight;
    const shape = new THREE.Shape();
    shape.moveTo(-width * 0.4, height * 0.03);
    shape.lineTo(-width * 0.46, height * 0.34);
    shape.lineTo(-width * 0.34, height * 0.72);
    shape.lineTo(-width * 0.14, height * 0.94);
    shape.lineTo(width * 0.12, height * 0.97);
    shape.lineTo(width * 0.35, height * 0.76);
    shape.lineTo(width * 0.45, height * 0.38);
    shape.lineTo(width * 0.39, height * 0.03);
    shape.closePath();

    const darkness = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x080a09, side: THREE.DoubleSide, depthWrite: true })
    );
    darkness.name = `${definition.id}-dark-interior`;
    darkness.position.set(0, 0.02, definition.depth);
    return darkness;
  }

  #createTerrainConformingApproach(definition, baseY) {
    const width = definition.mouthWidth * 0.68;
    const length = 5.4;
    const centerZ = -2.15;
    const geometry = new THREE.PlaneGeometry(width, length, 4, 6);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, centerZ);

    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localZ = positions.getZ(index);
      positions.setY(index, this.#terrainRelativeY(definition, baseY, localX, localZ) + 0.028);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const approach = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: CAVE_APPROACH, roughness: 1, side: THREE.DoubleSide })
    );
    approach.name = `${definition.id}-approach`;
    approach.receiveShadow = true;
    return approach;
  }

  #terrainRelativeY(definition, baseY, localX, localZ) {
    const c = Math.cos(definition.yaw);
    const s = Math.sin(definition.yaw);
    const worldX = definition.x + localX * c + localZ * s;
    const worldZ = definition.z - localX * s + localZ * c;
    return this.terrain.heightAt(worldX, worldZ) - baseY;
  }

  #addRock({ parent, geometry, material, name, position, scale, rotation }) {
    const rock = new THREE.Mesh(geometry, material);
    rock.name = name;
    rock.position.set(...position);
    rock.scale.set(...scale);
    rock.rotation.set(...rotation);
    rock.castShadow = false;
    rock.receiveShadow = true;
    parent.add(rock);
    return rock;
  }
}
