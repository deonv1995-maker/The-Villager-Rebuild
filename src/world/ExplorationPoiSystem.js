import * as THREE from 'three';
import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';

const ROCK_COLOR = 0x746f65;
const ROCK_DARK = 0x393834;
const ROCK_EARTH = 0x666052;
const CAVE_FLOOR = 0x34302a;
const CAVE_APPROACH = 0x756650;

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
    root.userData.approachLocalZ = -1;
    root.userData.tunnelLocalZ = 1;
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

    this.#createEntranceShell({
      definition,
      root,
      geometry: rockGeometry,
      rockMaterial,
      darkRockMaterial
    });

    this.#createTunnelRibs({
      definition,
      baseY,
      root,
      geometry: rockGeometry,
      darkRockMaterial
    });

    const darkness = this.#createDarkInterior(definition, baseY);
    root.add(darkness);

    const floor = this.#createTerrainConformingFloor(definition, baseY);
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

    // Keep the front-centre aperture empty. The broad masses live beside and behind
    // the entrance so the cave reads as negative space cut into a hillside, not a
    // pile of boulders stacked across the player's view.
    const masses = [
      { x: -5.35, z: 3.25, scale: [3.45, 2.55, 4.15], rotation: [0.02, -0.2, -0.08] },
      { x: 5.25, z: 3.4, scale: [3.4, 2.6, 4.2], rotation: [-0.04, 0.24, 0.08] },
      { x: -4.05, z: 6.65, scale: [3.6, 2.65, 3.65], rotation: [0.08, 0.18, -0.04] },
      { x: 3.95, z: 6.8, scale: [3.55, 2.7, 3.75], rotation: [-0.05, -0.16, 0.06] },
      { x: -2.35, z: 9.0, scale: [3.85, 2.55, 3.45], rotation: [0.03, 0.12, -0.04] },
      { x: 2.25, z: 9.15, scale: [3.8, 2.5, 3.5], rotation: [-0.04, -0.11, 0.05] },
      { x: 0.1, z: 10.7, scale: [5.25, 2.7, 3.35], rotation: [-0.03, -0.08, 0.03] }
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

  #createEntranceShell({ definition, root, geometry, rockMaterial, darkRockMaterial }) {
    const entrance = new THREE.Group();
    entrance.name = `${definition.id}-entrance-shell`;

    const face = new THREE.Shape();
    const halfWidth = definition.mouthWidth * 0.82;
    const height = definition.mouthHeight * 1.38;
    face.moveTo(-halfWidth * 0.96, -0.48);
    face.lineTo(-halfWidth, height * 0.34);
    face.lineTo(-halfWidth * 0.76, height * 0.74);
    face.lineTo(-halfWidth * 0.4, height * 0.97);
    face.lineTo(-halfWidth * 0.02, height);
    face.lineTo(halfWidth * 0.36, height * 0.93);
    face.lineTo(halfWidth * 0.74, height * 0.73);
    face.lineTo(halfWidth, height * 0.38);
    face.lineTo(halfWidth * 0.94, -0.48);
    face.closePath();

    const mouth = this.#createMouthPath(definition, 1);
    face.holes.push(mouth);

    const tunnelDepth = Math.min(definition.depth * 0.56, 4.7);
    const shellGeometry = new THREE.ExtrudeGeometry(face, {
      depth: tunnelDepth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.12,
      bevelThickness: 0.1
    });
    shellGeometry.computeVertexNormals();

    const shell = new THREE.Mesh(shellGeometry, [rockMaterial, darkRockMaterial]);
    shell.name = `${definition.id}-mouth-shell`;
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.userData.clearOpeningWidth = definition.mouthWidth * 0.84;
    shell.userData.clearOpeningHeight = definition.mouthHeight * 0.98;
    shell.userData.tunnelDepth = tunnelDepth;
    entrance.add(shell);

    // Small side dressing breaks up the planar cliff face without putting any
    // freestanding rocks back into the opening itself.
    const dressing = new THREE.Group();
    dressing.name = `${definition.id}-entrance-dressing`;
    const sideRocks = [
      { x: -4.65, y: 1.35, z: -0.28, scale: [1.35, 1.55, 1.0], rotation: [0.08, -0.18, -0.08] },
      { x: 4.62, y: 1.45, z: -0.24, scale: [1.3, 1.62, 1.02], rotation: [-0.05, 0.2, 0.07] },
      { x: -4.55, y: 4.45, z: -0.16, scale: [1.18, 1.25, 0.9], rotation: [0.12, -0.14, -0.04] },
      { x: 4.5, y: 4.55, z: -0.12, scale: [1.16, 1.2, 0.92], rotation: [-0.09, 0.16, 0.05] }
    ];
    sideRocks.forEach((rock, index) => {
      this.#addRock({
        parent: dressing,
        geometry,
        material: rockMaterial,
        name: `${definition.id}-entrance-side-dressing-${index}`,
        position: [rock.x, rock.y, rock.z],
        scale: rock.scale,
        rotation: rock.rotation
      });
    });
    entrance.add(dressing);

    root.add(entrance);
  }

  #createTunnelRibs({ definition, baseY, root, geometry, darkRockMaterial }) {
    const tunnel = new THREE.Group();
    tunnel.name = `${definition.id}-tunnel-ribs`;
    const depths = [4.95, 6.2, 7.35];

    depths.forEach((localZ, index) => {
      const narrowing = 1 - index * 0.07;
      const sideX = definition.mouthWidth * 0.36 * narrowing;
      const sideScaleY = definition.mouthHeight * 0.25;
      for (const side of [-1, 1]) {
        const terrainY = this.#terrainRelativeY(definition, baseY, side * sideX, localZ);
        this.#addRock({
          parent: tunnel,
          geometry,
          material: darkRockMaterial,
          name: `${definition.id}-tunnel-rib-${index}-${side < 0 ? 'left' : 'right'}`,
          position: [side * sideX, terrainY + definition.mouthHeight * 0.33, localZ],
          scale: [0.58, sideScaleY, 0.78],
          rotation: [0.06 * (index % 2), side * 0.08, side * 0.07]
        });
      }

      const crownTerrainY = this.#terrainRelativeY(definition, baseY, 0, localZ + 0.06);
      this.#addRock({
        parent: tunnel,
        geometry,
        material: darkRockMaterial,
        name: `${definition.id}-tunnel-rib-${index}-crown`,
        position: [0, crownTerrainY + definition.mouthHeight * 0.82, localZ + 0.06],
        scale: [definition.mouthWidth * 0.24 * narrowing, 0.54, 0.76],
        rotation: [0.03, index % 2 === 0 ? 0.05 : -0.04, 0.02]
      });
    });

    tunnel.userData.terrainConforming = true;
    root.add(tunnel);
  }

  #createMouthPath(definition, scale = 1) {
    const halfWidth = definition.mouthWidth * 0.42 * scale;
    const height = definition.mouthHeight * 0.98 * scale;
    const path = new THREE.Path();
    path.moveTo(-halfWidth * 0.96, -0.12);
    path.lineTo(-halfWidth, height * 0.28);
    path.lineTo(-halfWidth * 0.82, height * 0.66);
    path.lineTo(-halfWidth * 0.48, height * 0.91);
    path.lineTo(-halfWidth * 0.08, height);
    path.lineTo(halfWidth * 0.34, height * 0.94);
    path.lineTo(halfWidth * 0.74, height * 0.71);
    path.lineTo(halfWidth, height * 0.34);
    path.lineTo(halfWidth * 0.92, -0.12);
    path.closePath();
    return path;
  }

  #createDarkInterior(definition, baseY) {
    const shape = new THREE.Shape();
    const mouthPath = this.#createMouthPath(definition, 0.82);
    const points = mouthPath.getPoints();
    if (points.length > 0) {
      shape.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        shape.lineTo(points[index].x, points[index].y);
      }
      shape.closePath();
    }

    const darkness = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x050706, side: THREE.DoubleSide, depthWrite: true })
    );
    darkness.name = `${definition.id}-dark-interior`;
    darkness.position.set(
      0,
      this.#terrainRelativeY(definition, baseY, 0, definition.depth) + 0.04,
      definition.depth
    );
    darkness.userData.terrainConforming = true;
    return darkness;
  }

  #createTerrainConformingFloor(definition, baseY) {
    const width = definition.mouthWidth * 0.76;
    const length = definition.depth * 0.96;
    const geometry = new THREE.PlaneGeometry(width, length, 5, 10);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, length * 0.5);

    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localZ = positions.getZ(index);
      positions.setY(index, this.#terrainRelativeY(definition, baseY, localX, localZ) + 0.035);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const floor = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: CAVE_FLOOR, roughness: 1, side: THREE.DoubleSide })
    );
    floor.name = `${definition.id}-floor`;
    floor.receiveShadow = true;
    floor.userData.terrainConforming = true;
    return floor;
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
    approach.userData.terrainConforming = true;
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
