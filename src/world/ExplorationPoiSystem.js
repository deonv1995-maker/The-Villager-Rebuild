import * as THREE from 'three';
import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { caveTerrainOffsetAt } from './CaveTerrainProfile.js';
import { terrainSurfaceColorAt } from './TerrainSurfacePresentation.js';

const ROCK_COLOR = 0x746f65;
const ROCK_DARK = 0x393834;
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
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const sideX = definition.mouthWidth * 0.5 + 0.28;

    // The heightfield owns the carved walkable floor. This lightweight surface
    // restores only the original hillside skin over the rear half of that cut so
    // the tunnel actually disappears beneath ground instead of needing a mound of
    // decorative boulders to fake mountain volume.
    this.#createTerrainOverburden({ definition, baseY, root });

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
            radius: 1.35,
            type: 'cave-rock',
            label: `${definition.id}-${side < 0 ? 'left' : 'right'}-${localZ}`,
            bottomY: baseY - 0.2,
            topY: baseY + definition.mouthHeight + 1.25
          });
        }
      }
    }
  }

  #createTerrainOverburden({ definition, baseY, root }) {
    const profile = definition.terrainCut ?? {};
    const startZ = Math.min(definition.depth * 0.56, 4.8);
    const endZ = definition.depth + (profile.backFadeLength ?? 2.5) * 0.88;
    const length = Math.max(1, endZ - startZ);
    const width = definition.mouthWidth * 2.05;
    const geometry = new THREE.PlaneGeometry(width, length, 8, 8);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, startZ + length * 0.5);

    const positions = geometry.getAttribute('position');
    const colors = [];
    const color = new THREE.Color();

    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localZ = positions.getZ(index);
      const world = this.#localToWorld(definition, localX, localZ);
      const uncutRelativeY = this.#uncutTerrainRelativeY(definition, baseY, localX, localZ);
      const worldY = baseY + uncutRelativeY;
      const slope = this.#uncutTerrainSlopeAt(definition, baseY, localX, localZ);
      const sand = this.terrain.isSandAt?.(world.x, world.z) ?? false;
      const region = sand ? null : this.terrain.regionAt?.(world.x, world.z);
      const jungleSoilStrength = region?.biome === 'jungle'
        ? (region.strength ?? 0) * (region.ground?.soilStrength ?? 0)
        : 0;

      positions.setY(index, uncutRelativeY + 0.035);
      terrainSurfaceColorAt({
        x: world.x,
        z: world.z,
        y: worldY,
        slope,
        sand,
        forestCover: sand ? 0 : (this.terrain.forestCoverAt?.(world.x, world.z) ?? 0),
        grassPatchStrength: sand ? 0 : (this.terrain.grassPatchStrengthAt?.(world.x, world.z) ?? 0),
        jungleSoilStrength
      }, color);
      colors.push(color.r, color.g, color.b);
    }

    positions.needsUpdate = true;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const overburden = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.97,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    overburden.name = `${definition.id}-terrain-overburden`;
    overburden.receiveShadow = true;
    overburden.userData.presentationOnly = true;
    overburden.userData.bridgesTerrainCut = true;
    overburden.userData.startLocalZ = startZ;
    overburden.userData.endLocalZ = endZ;
    overburden.userData.surfaceSource = 'pre-cave-authoritative-terrain';
    root.add(overburden);
  }

  #createEntranceShell({ definition, root, geometry, rockMaterial, darkRockMaterial }) {
    const entrance = new THREE.Group();
    entrance.name = `${definition.id}-entrance-shell`;

    const face = new THREE.Shape();
    // The mouth is deliberately smaller than the former boulder arch. Its brow
    // rises only slightly above the untouched threshold shoulders, then the shell
    // runs beneath the restored terrain overburden so it visibly enters the hill.
    const halfWidth = definition.mouthWidth * 0.66;
    const height = definition.mouthHeight * 1.08;
    face.moveTo(-halfWidth * 0.96, -0.5);
    face.lineTo(-halfWidth, height * 0.34);
    face.lineTo(-halfWidth * 0.76, height * 0.74);
    face.lineTo(-halfWidth * 0.4, height * 0.97);
    face.lineTo(-halfWidth * 0.02, height);
    face.lineTo(halfWidth * 0.36, height * 0.93);
    face.lineTo(halfWidth * 0.74, height * 0.73);
    face.lineTo(halfWidth, height * 0.38);
    face.lineTo(halfWidth * 0.94, -0.5);
    face.closePath();

    const mouth = this.#createMouthPath(definition, 1);
    face.holes.push(mouth);

    const tunnelDepth = Math.min(definition.depth * 0.72, 6.2);
    const shellGeometry = new THREE.ExtrudeGeometry(face, {
      depth: tunnelDepth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.1,
      bevelThickness: 0.08
    });
    shellGeometry.computeVertexNormals();

    const shell = new THREE.Mesh(shellGeometry, [rockMaterial, darkRockMaterial]);
    shell.name = `${definition.id}-mouth-shell`;
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.userData.clearOpeningWidth = definition.mouthWidth * 0.84;
    shell.userData.clearOpeningHeight = definition.mouthHeight * 0.98;
    shell.userData.tunnelDepth = tunnelDepth;
    shell.userData.outerFaceHalfWidth = halfWidth;
    shell.userData.outerFaceHeight = height;
    shell.userData.hillsideIntegrated = true;
    shell.userData.entersOverburden = true;
    entrance.add(shell);

    // Keep only two small lateral breakup rocks. The hillside silhouette now comes
    // from terrain/overburden, never from a freestanding stack of boulders.
    const dressing = new THREE.Group();
    dressing.name = `${definition.id}-entrance-dressing`;
    const sideRocks = [
      {
        x: -definition.mouthWidth * 0.62,
        y: definition.mouthHeight * 0.26,
        z: -0.2,
        scale: [0.78, 0.9, 0.72],
        rotation: [0.08, -0.18, -0.08]
      },
      {
        x: definition.mouthWidth * 0.62,
        y: definition.mouthHeight * 0.28,
        z: -0.16,
        scale: [0.76, 0.92, 0.74],
        rotation: [-0.05, 0.2, 0.07]
      }
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
    const depths = [6.45, 7.35, 8.05].filter(localZ => localZ < definition.depth);

    depths.forEach((localZ, index) => {
      const narrowing = 1 - index * 0.07;
      const sideX = definition.mouthWidth * 0.36 * narrowing;
      const sideScaleY = definition.mouthHeight * 0.22;
      for (const side of [-1, 1]) {
        const terrainY = this.#terrainRelativeY(definition, baseY, side * sideX, localZ);
        this.#addRock({
          parent: tunnel,
          geometry,
          material: darkRockMaterial,
          name: `${definition.id}-tunnel-rib-${index}-${side < 0 ? 'left' : 'right'}`,
          position: [side * sideX, terrainY + definition.mouthHeight * 0.3, localZ],
          scale: [0.44, sideScaleY, 0.58],
          rotation: [0.06 * (index % 2), side * 0.08, side * 0.07]
        });
      }

      const crownTerrainY = this.#terrainRelativeY(definition, baseY, 0, localZ + 0.06);
      this.#addRock({
        parent: tunnel,
        geometry,
        material: darkRockMaterial,
        name: `${definition.id}-tunnel-rib-${index}-crown`,
        position: [0, crownTerrainY + definition.mouthHeight * 0.78, localZ + 0.06],
        scale: [definition.mouthWidth * 0.2 * narrowing, 0.4, 0.58],
        rotation: [0.03, index % 2 === 0 ? 0.05 : -0.04, 0.02]
      });
    });

    tunnel.userData.terrainConforming = true;
    tunnel.userData.recessedBehindContinuousShell = true;
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
    const profile = definition.terrainCut ?? {};
    const approachLength = profile.approachLength ?? 4.8;
    const width = definition.mouthWidth * 0.72;
    const length = approachLength + 0.8;
    const centerZ = -approachLength * 0.5 + 0.15;
    const geometry = new THREE.PlaneGeometry(width, length, 4, 8);
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

  #localToWorld(definition, localX, localZ) {
    const c = Math.cos(definition.yaw);
    const s = Math.sin(definition.yaw);
    return {
      x: definition.x + localX * c + localZ * s,
      z: definition.z - localX * s + localZ * c
    };
  }

  #terrainRelativeY(definition, baseY, localX, localZ) {
    const world = this.#localToWorld(definition, localX, localZ);
    return this.terrain.heightAt(world.x, world.z) - baseY;
  }

  #uncutTerrainRelativeY(definition, baseY, localX, localZ) {
    const world = this.#localToWorld(definition, localX, localZ);
    const carvedHeight = this.terrain.heightAt(world.x, world.z);
    return carvedHeight - caveTerrainOffsetAt(definition, world.x, world.z) - baseY;
  }

  #uncutTerrainSlopeAt(definition, baseY, localX, localZ, distance = 0.75) {
    const center = this.#uncutTerrainRelativeY(definition, baseY, localX, localZ);
    return Math.max(
      Math.abs(this.#uncutTerrainRelativeY(definition, baseY, localX + distance, localZ) - center),
      Math.abs(this.#uncutTerrainRelativeY(definition, baseY, localX - distance, localZ) - center),
      Math.abs(this.#uncutTerrainRelativeY(definition, baseY, localX, localZ + distance) - center),
      Math.abs(this.#uncutTerrainRelativeY(definition, baseY, localX, localZ - distance) - center)
    ) / distance;
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
