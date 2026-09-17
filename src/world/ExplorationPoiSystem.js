import * as THREE from 'three';
import { EXPLORATION_POIS } from '../data/ExplorationPoiDefinitions.js';
import { caveTerrainOffsetAt } from './CaveTerrainProfile.js';
import { terrainSurfaceColorAt } from './TerrainSurfacePresentation.js';

const ROCK_COLOR = 0x746f65;
const ROCK_DARK = 0x393834;
const CAVE_FLOOR = 0x34302a;
const CAVE_APPROACH = 0x756650;
const IMPACT_SOIL = 0x6b533d;

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
      flatShading: true,
      side: THREE.DoubleSide
    });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

    // The impact scar is presentation only. The carved heightfield remains the
    // authoritative walkable surface beneath it.
    this.#createImpactScar({ definition, baseY, root });

    // Rebuild the uncut hillside skin over the buried section before adding the
    // rock lining beneath it. This closes the visible trench without introducing
    // another collision or grounding authority.
    this.#createTerrainOverburden({ definition, baseY, root });

    this.#createEntranceShell({
      definition,
      baseY,
      root,
      geometry: rockGeometry,
      rockMaterial
    });

    this.#createTunnelLiner({
      definition,
      baseY,
      root,
      darkRockMaterial
    });

    this.#createTunnelRibs({
      definition,
      baseY,
      root,
      geometry: rockGeometry,
      darkRockMaterial
    });

    this.#createImpactDebris({
      definition,
      baseY,
      root,
      geometry: rockGeometry,
      rockMaterial,
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
      const presentation = definition.presentation ?? {};
      const portalInset = presentation.portalInset ?? 0;
      const sideX = definition.mouthWidth * 0.5 + 0.22;
      const collisionDepths = [
        portalInset + 0.72,
        Math.min(definition.depth - 0.85, portalInset + 3.45)
      ];

      for (const side of [-1, 1]) {
        for (const localZ of collisionDepths) {
          const localX = side * sideX;
          const x = definition.x + localX * c + localZ * s;
          const z = definition.z - localX * s + localZ * c;
          const floorY = baseY + this.#terrainRelativeY(definition, baseY, localX, localZ);
          this.collision.addObstacle({
            x,
            z,
            radius: 1.25,
            type: 'cave-rock',
            label: `${definition.id}-${side < 0 ? 'left' : 'right'}-${localZ.toFixed(2)}`,
            bottomY: floorY - 0.2,
            topY: floorY + definition.mouthHeight + 0.9
          });
        }
      }
    }
  }

  #createImpactScar({ definition, baseY, root }) {
    if (!definition.presentation?.impactScar) return;

    const approachLength = definition.terrainCut?.approachLength ?? 4.8;
    const portalInset = definition.presentation?.portalInset ?? 0;
    const halfWidth = definition.mouthWidth * 0.78;
    const boundary = [
      [-halfWidth * 0.84, portalInset * 0.72],
      [-halfWidth, 0.35],
      [-halfWidth * 0.9, -approachLength * 0.38],
      [-halfWidth * 0.58, -approachLength * 0.78],
      [0, -approachLength * 0.97],
      [halfWidth * 0.6, -approachLength * 0.8],
      [halfWidth * 0.9, -approachLength * 0.42],
      [halfWidth, 0.28],
      [halfWidth * 0.82, portalInset * 0.72],
      [halfWidth * 0.48, portalInset * 0.92],
      [0, portalInset * 1.02],
      [-halfWidth * 0.5, portalInset * 0.9]
    ];
    const center = [0, -approachLength * 0.24];
    const vertices = [];
    const indices = [];

    const pushVertex = ([localX, localZ]) => {
      vertices.push(
        localX,
        this.#terrainRelativeY(definition, baseY, localX, localZ) + 0.018,
        localZ
      );
    };

    pushVertex(center);
    boundary.forEach(pushVertex);
    for (let index = 0; index < boundary.length; index += 1) {
      const current = index + 1;
      const next = ((index + 1) % boundary.length) + 1;
      indices.push(0, current, next);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const scar = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: IMPACT_SOIL,
        roughness: 1,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    scar.name = `${definition.id}-impact-scar`;
    scar.receiveShadow = true;
    scar.userData.presentationOnly = true;
    scar.userData.terrainConforming = true;
    scar.userData.craterDressing = true;
    scar.userData.approachLength = approachLength;
    scar.userData.portalInset = portalInset;
    root.add(scar);
  }

  #createTerrainOverburden({ definition, baseY, root }) {
    const profile = definition.terrainCut ?? {};
    const presentation = definition.presentation ?? {};
    const portalInset = presentation.portalInset ?? 0;
    const shellDepth = presentation.shellDepth ?? Math.min(definition.depth * 0.72, 6.2);
    const overburdenLead = presentation.overburdenLead ?? Math.max(0.5, shellDepth * 0.45);
    const startZ = portalInset + overburdenLead;
    const endZ = definition.depth + (profile.backFadeLength ?? 2.5) * 0.88;
    const length = Math.max(1, endZ - startZ);
    const width = definition.mouthWidth * 1.92;
    const geometry = new THREE.PlaneGeometry(width, length, 8, 10);
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

  #createEntranceShell({ definition, baseY, root, geometry, rockMaterial }) {
    const entrance = new THREE.Group();
    entrance.name = `${definition.id}-entrance-shell`;

    const presentation = definition.presentation ?? {};
    const portalInset = presentation.portalInset ?? 0;
    const shellDepth = Math.min(
      presentation.shellDepth ?? 1.4,
      Math.max(0.8, definition.depth - portalInset - 0.5)
    );
    const portalFloorY = this.#terrainRelativeY(definition, baseY, 0, portalInset);

    const face = new THREE.Shape();
    // The portal is a shallow rock reveal, not a long extruded ring. Moving it
    // into the cut lets its brow sit beneath the real hillside while the separate
    // liner carries the tunnel farther underground.
    const halfWidth = definition.mouthWidth * 0.6;
    const height = definition.mouthHeight * 1.08;
    face.moveTo(-halfWidth * 0.96, -0.28);
    face.lineTo(-halfWidth, height * 0.32);
    face.lineTo(-halfWidth * 0.76, height * 0.74);
    face.lineTo(-halfWidth * 0.4, height * 0.97);
    face.lineTo(-halfWidth * 0.02, height);
    face.lineTo(halfWidth * 0.36, height * 0.93);
    face.lineTo(halfWidth * 0.74, height * 0.73);
    face.lineTo(halfWidth, height * 0.36);
    face.lineTo(halfWidth * 0.94, -0.28);
    face.closePath();

    const mouthScale = 0.96;
    const mouth = this.#createMouthPath(definition, mouthScale);
    face.holes.push(mouth);

    const shellGeometry = new THREE.ExtrudeGeometry(face, {
      depth: shellDepth,
      steps: 1,
      curveSegments: 1,
      bevelEnabled: false
    });
    shellGeometry.computeVertexNormals();

    const shell = new THREE.Mesh(shellGeometry, rockMaterial);
    shell.name = `${definition.id}-mouth-shell`;
    shell.position.set(0, portalFloorY, portalInset);
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.userData.clearOpeningWidth = definition.mouthWidth * 0.84 * mouthScale;
    shell.userData.clearOpeningHeight = definition.mouthHeight * 0.98 * mouthScale;
    shell.userData.tunnelDepth = shellDepth;
    shell.userData.portalInset = portalInset;
    shell.userData.portalFloorY = portalFloorY;
    shell.userData.tunnelEndLocalZ = portalInset + shellDepth;
    shell.userData.outerFaceHalfWidth = halfWidth;
    shell.userData.outerFaceHeight = height;
    shell.userData.hillsideIntegrated = true;
    shell.userData.entersOverburden = true;
    shell.userData.shallowPortalReveal = true;
    entrance.add(shell);

    // Keep only two restrained lateral rocks at the reveal. They break the edge
    // without rebuilding a boulder mound or blocking the central approach.
    const dressing = new THREE.Group();
    dressing.name = `${definition.id}-entrance-dressing`;
    const sideRocks = [
      {
        x: -definition.mouthWidth * 0.64,
        z: portalInset - 0.06,
        scale: [0.62, 0.72, 0.58],
        rotation: [0.08, -0.18, -0.08]
      },
      {
        x: definition.mouthWidth * 0.64,
        z: portalInset - 0.02,
        scale: [0.6, 0.74, 0.6],
        rotation: [-0.05, 0.2, 0.07]
      }
    ];
    sideRocks.forEach((rock, index) => {
      const terrainY = this.#terrainRelativeY(definition, baseY, rock.x, rock.z);
      this.#addRock({
        parent: dressing,
        geometry,
        material: rockMaterial,
        name: `${definition.id}-entrance-side-dressing-${index}`,
        position: [rock.x, terrainY + rock.scale[1] * 0.54, rock.z],
        scale: rock.scale,
        rotation: rock.rotation
      });
    });
    entrance.add(dressing);

    entrance.userData.portalInset = portalInset;
    entrance.userData.portalFloorY = portalFloorY;
    root.add(entrance);
  }

  #createTunnelLiner({ definition, baseY, root, darkRockMaterial }) {
    const presentation = definition.presentation ?? {};
    const portalInset = presentation.portalInset ?? 0;
    const shellDepth = presentation.shellDepth ?? 1.4;
    const startZ = portalInset + Math.max(0.58, shellDepth * 0.48);
    const endZ = definition.depth * 0.97;
    const halfWidth = definition.mouthWidth * 0.43;
    const stationCount = 7;
    const leftVertices = [];
    const rightVertices = [];
    const roofVertices = [];

    for (let index = 0; index < stationCount; index += 1) {
      const t = index / (stationCount - 1);
      const localZ = THREE.MathUtils.lerp(startZ, endZ, t);
      const centerFloorY = this.#terrainRelativeY(definition, baseY, 0, localZ);
      const leftFloorY = this.#terrainRelativeY(definition, baseY, -halfWidth, localZ);
      const rightFloorY = this.#terrainRelativeY(definition, baseY, halfWidth, localZ);
      const hillsideRoofY = this.#uncutTerrainRelativeY(definition, baseY, 0, localZ) - 0.18;
      const roofY = Math.min(
        hillsideRoofY,
        centerFloorY + definition.mouthHeight * 0.92
      );

      leftVertices.push(-halfWidth, leftFloorY - 0.04, localZ);
      leftVertices.push(-halfWidth, roofY, localZ);
      rightVertices.push(halfWidth, rightFloorY - 0.04, localZ);
      rightVertices.push(halfWidth, roofY, localZ);
      roofVertices.push(-halfWidth, roofY - 0.08, localZ);
      roofVertices.push(0, roofY + 0.1, localZ);
      roofVertices.push(halfWidth, roofY - 0.08, localZ);
    }

    const wallIndices = [];
    const roofIndices = [];
    for (let index = 0; index < stationCount - 1; index += 1) {
      const current = index * 2;
      const next = (index + 1) * 2;
      wallIndices.push(current, next, current + 1, current + 1, next, next + 1);

      const row = index * 3;
      const nextRow = (index + 1) * 3;
      roofIndices.push(
        row, nextRow, row + 1,
        row + 1, nextRow, nextRow + 1,
        row + 1, nextRow + 1, row + 2,
        row + 2, nextRow + 1, nextRow + 2
      );
    }

    const liner = new THREE.Group();
    liner.name = `${definition.id}-tunnel-liner`;
    const leftWall = this.#createIndexedMesh({
      vertices: leftVertices,
      indices: wallIndices,
      material: darkRockMaterial,
      name: `${definition.id}-tunnel-liner-left`
    });
    const rightWall = this.#createIndexedMesh({
      vertices: rightVertices,
      indices: wallIndices,
      material: darkRockMaterial,
      name: `${definition.id}-tunnel-liner-right`
    });
    const roof = this.#createIndexedMesh({
      vertices: roofVertices,
      indices: roofIndices,
      material: darkRockMaterial,
      name: `${definition.id}-tunnel-liner-roof`
    });
    liner.add(leftWall, rightWall, roof);
    liner.userData.presentationOnly = true;
    liner.userData.terrainConforming = true;
    liner.userData.sealedInterior = true;
    liner.userData.startLocalZ = startZ;
    liner.userData.endLocalZ = endZ;
    liner.userData.halfWidth = halfWidth;
    root.add(liner);
  }

  #createTunnelRibs({ definition, baseY, root, geometry, darkRockMaterial }) {
    const tunnel = new THREE.Group();
    tunnel.name = `${definition.id}-tunnel-ribs`;
    const presentation = definition.presentation ?? {};
    const portalInset = presentation.portalInset ?? 0;
    const shellDepth = presentation.shellDepth ?? 1.4;
    const shellEnd = portalInset + shellDepth;
    const depths = [shellEnd + 0.82, shellEnd + 2.28, shellEnd + 3.72]
      .filter(localZ => localZ < definition.depth - 0.35);

    depths.forEach((localZ, index) => {
      const narrowing = 1 - index * 0.06;
      const sideX = definition.mouthWidth * 0.44 * narrowing;
      const sideScaleY = definition.mouthHeight * 0.18;
      for (const side of [-1, 1]) {
        const terrainY = this.#terrainRelativeY(definition, baseY, side * sideX, localZ);
        this.#addRock({
          parent: tunnel,
          geometry,
          material: darkRockMaterial,
          name: `${definition.id}-tunnel-rib-${index}-${side < 0 ? 'left' : 'right'}`,
          position: [side * sideX, terrainY + definition.mouthHeight * 0.28, localZ],
          scale: [0.34, sideScaleY, 0.42],
          rotation: [0.04 * (index % 2), side * 0.08, side * 0.06]
        });
      }

      const crownTerrainY = this.#terrainRelativeY(definition, baseY, 0, localZ + 0.04);
      this.#addRock({
        parent: tunnel,
        geometry,
        material: darkRockMaterial,
        name: `${definition.id}-tunnel-rib-${index}-crown`,
        position: [0, crownTerrainY + definition.mouthHeight * 0.84, localZ + 0.04],
        scale: [definition.mouthWidth * 0.18 * narrowing, 0.28, 0.42],
        rotation: [0.02, index % 2 === 0 ? 0.05 : -0.04, 0.02]
      });
    });

    tunnel.userData.terrainConforming = true;
    tunnel.userData.recessedBehindContinuousShell = true;
    tunnel.userData.startsAfterShell = true;
    root.add(tunnel);
  }

  #createImpactDebris({ definition, baseY, root, geometry, rockMaterial, darkRockMaterial }) {
    if (!definition.presentation?.impactDebris) return;

    const fragments = [
      [-4.15, -0.9, [0.46, 0.34, 0.38], [0.1, -0.22, 0.08]],
      [-3.35, -3.35, [0.34, 0.28, 0.42], [-0.08, 0.34, -0.12]],
      [-2.72, -5.0, [0.28, 0.22, 0.34], [0.15, -0.3, 0.18]],
      [4.22, -1.4, [0.42, 0.32, 0.36], [-0.12, 0.18, -0.08]],
      [3.42, -3.85, [0.32, 0.24, 0.4], [0.06, -0.36, 0.16]],
      [2.76, -5.18, [0.24, 0.2, 0.3], [-0.12, 0.28, 0.04]],
      [-3.48, 1.08, [0.36, 0.28, 0.34], [0.08, 0.24, -0.14]],
      [3.58, 1.2, [0.38, 0.3, 0.36], [-0.06, -0.2, 0.1]]
    ];
    const debris = new THREE.Group();
    debris.name = `${definition.id}-impact-debris`;

    fragments.forEach(([localX, localZ, scale, rotation], index) => {
      const terrainY = this.#terrainRelativeY(definition, baseY, localX, localZ);
      this.#addRock({
        parent: debris,
        geometry,
        material: index % 3 === 0 ? darkRockMaterial : rockMaterial,
        name: `${definition.id}-impact-fragment-${index}`,
        position: [localX, terrainY + scale[1] * 0.55, localZ],
        scale,
        rotation
      });
    });

    debris.userData.presentationOnly = true;
    debris.userData.smallFragmentsOnly = true;
    debris.userData.clearCentralApproach = true;
    root.add(debris);
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
    const mouthPath = this.#createMouthPath(definition, 0.78);
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
      definition.depth - 0.08
    );
    darkness.userData.terrainConforming = true;
    return darkness;
  }

  #createTerrainConformingFloor(definition, baseY) {
    const portalInset = definition.presentation?.portalInset ?? 0;
    const startZ = Math.max(0, portalInset - 0.08);
    const endZ = definition.depth * 0.98;
    const width = definition.mouthWidth * 0.76;
    const length = Math.max(0.8, endZ - startZ);
    const geometry = new THREE.PlaneGeometry(width, length, 5, 9);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, startZ + length * 0.5);

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
    floor.userData.startsAtPortal = true;
    floor.userData.startLocalZ = startZ;
    return floor;
  }

  #createTerrainConformingApproach(definition, baseY) {
    const profile = definition.terrainCut ?? {};
    const approachLength = profile.approachLength ?? 4.8;
    const portalInset = definition.presentation?.portalInset ?? 0;
    const width = definition.mouthWidth * 0.72;
    const minZ = -approachLength - 0.4;
    const maxZ = portalInset + 0.45;
    const length = maxZ - minZ;
    const centerZ = (minZ + maxZ) * 0.5;
    const geometry = new THREE.PlaneGeometry(width, length, 4, 10);
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
    approach.userData.reachesPortal = true;
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

  #createIndexedMesh({ vertices, indices, material, name }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
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
