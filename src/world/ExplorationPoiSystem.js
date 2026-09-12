import * as THREE from 'three';
import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';

const ROCK_COLOR = 0x5f5b52;
const ROCK_DARK = 0x48453f;

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
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

    const sideX = definition.mouthWidth * 0.5 + 0.72;
    const sideRows = [0.35, 2.65, 5.15];
    for (const side of [-1, 1]) {
      sideRows.forEach((localZ, index) => {
        const rock = new THREE.Mesh(rockGeometry, index === 2 ? darkRockMaterial : rockMaterial);
        rock.name = `${definition.id}-side-${side < 0 ? 'left' : 'right'}-${index}`;
        rock.position.set(side * (sideX + index * 0.18), 1.25 + index * 0.28, localZ);
        rock.scale.set(1.7 + index * 0.18, 1.9 + index * 0.28, 1.65 + index * 0.22);
        rock.rotation.set((index - 1) * 0.08, side * (0.18 + index * 0.11), side * 0.08);
        rock.castShadow = false;
        rock.receiveShadow = true;
        root.add(rock);
      });
    }

    const crownCount = 5;
    for (let index = 0; index < crownCount; index += 1) {
      const t = crownCount === 1 ? 0.5 : index / (crownCount - 1);
      const localX = THREE.MathUtils.lerp(-definition.mouthWidth * 0.42, definition.mouthWidth * 0.42, t);
      const arch = 1 - Math.abs(t - 0.5) * 2;
      const rock = new THREE.Mesh(rockGeometry, index === 0 || index === crownCount - 1 ? rockMaterial : darkRockMaterial);
      rock.name = `${definition.id}-crown-${index}`;
      rock.position.set(localX, definition.mouthHeight - 0.3 + arch * 0.75, 0.6 + Math.abs(t - 0.5) * 0.35);
      rock.scale.set(1.55, 1.4 + arch * 0.34, 1.75);
      rock.rotation.set(0.08 * (index - 2), 0.16 * (index - 2), 0.12 * (t - 0.5));
      rock.castShadow = false;
      rock.receiveShadow = true;
      root.add(rock);
    }

    const darkness = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({ color: 0x080a09, side: THREE.DoubleSide, depthWrite: true })
    );
    darkness.name = `${definition.id}-dark-interior`;
    darkness.position.set(0, definition.mouthHeight * 0.49, definition.depth);
    darkness.scale.set(definition.mouthWidth * 0.43, definition.mouthHeight * 0.48, 1);
    root.add(darkness);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(definition.mouthWidth * 0.82, definition.depth * 0.94),
      new THREE.MeshStandardMaterial({ color: 0x34302a, roughness: 1, side: THREE.DoubleSide })
    );
    floor.name = `${definition.id}-floor`;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.055, definition.depth * 0.47);
    floor.receiveShadow = true;
    root.add(floor);

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
}
