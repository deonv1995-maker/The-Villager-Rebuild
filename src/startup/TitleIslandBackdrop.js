import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { addCoastalRockFormations } from '../world/CoastalRockSystem.js';
import { ExpandedIslandTerrainSystem } from '../world/ExpandedIslandTerrainSystem.js';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

export function createTitleIslandBackdrop() {
  const samplerGroup = new THREE.Group();
  const terrain = new ExpandedIslandTerrainSystem(samplerGroup);
  const island = new THREE.Group();
  island.name = 'title-island-backdrop';
  island.position.set(
    3.5,
    TITLE_SCENE.oceanY - terrain.waterLevel * TITLE_SCENE.islandVerticalScale,
    TITLE_SCENE.islandZ
  );

  const xSegments = 36;
  const zSegments = 28;
  const width = terrain.extentX * 2 * TITLE_SCENE.islandHorizontalScale;
  const depth = terrain.extentZ * 2 * TITLE_SCENE.islandHorizontalScale;
  const geometry = new THREE.PlaneGeometry(width, depth, xSegments, zSegments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index);
    const localZ = positions.getZ(index);
    const worldX = localX / TITLE_SCENE.islandHorizontalScale;
    const worldZ = terrain.centerZ + localZ / TITLE_SCENE.islandHorizontalScale;
    const playable = terrain.isPlayable(worldX, worldZ, 0);
    const height = playable ? terrain.heightAt(worldX, worldZ) : terrain.seabedLevel - 0.55;
    positions.setY(index, height * TITLE_SCENE.islandVerticalScale);

    if (!playable) color.set(0x466b69);
    else if (terrain.isSandAt(worldX, worldZ)) color.set(0xdac895);
    else {
      const slope = terrain.slopeAt(worldX, worldZ);
      if (slope > 0.78) color.set(0x736f62);
      else if (height < 0.9) color.set(0x78a85c);
      else if (height < 3.4) color.set(0x558148);
      else color.set(0x496f43);
    }
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const islandMesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, flatShading: true })
  );
  islandMesh.name = 'title-island-playable-profile';
  island.add(islandMesh);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x51402f, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x315b3f, roughness: 1, flatShading: true });
  const random = createRandom(0x1a51a7);
  let treeCount = 0;
  let attempts = 0;

  while (treeCount < 34 && attempts < 260) {
    attempts += 1;
    const worldX = (random() * 2 - 1) * terrain.extentX * 0.78;
    const worldZ = terrain.centerZ + (random() * 2 - 1) * terrain.extentZ * 0.72;
    if (!terrain.isPlayable(worldX, worldZ, 4) || terrain.isSandAt(worldX, worldZ)) continue;

    const height = terrain.heightAt(worldX, worldZ);
    const slope = terrain.slopeAt(worldX, worldZ);
    if (height < 0.3 || slope > 0.58) continue;

    const cover = typeof terrain.forestCoverAt === 'function' ? terrain.forestCoverAt(worldX, worldZ) : 0.55;
    if (random() > Math.max(0.24, cover)) continue;

    const tree = new THREE.Group();
    const size = 0.72 + random() * 0.55;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.85, 5), trunkMaterial);
    stem.position.y = 0.42;
    const crownA = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.7, 6), crownMaterial);
    crownA.position.y = 1.35;
    const crownB = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.35, 6), crownMaterial);
    crownB.position.y = 2.15;
    tree.add(stem, crownA, crownB);
    tree.scale.setScalar(size);
    tree.position.set(
      worldX * TITLE_SCENE.islandHorizontalScale,
      height * TITLE_SCENE.islandVerticalScale,
      (worldZ - terrain.centerZ) * TITLE_SCENE.islandHorizontalScale
    );
    island.add(tree);
    treeCount += 1;
  }

  const loader = new GLTFLoader();
  void loader.loadAsync(ASSET_PATHS.forest.rock)
    .then(coastalRock => {
      addCoastalRockFormations({
        group: island,
        terrain,
        template: coastalRock.scene,
        horizontalScale: TITLE_SCENE.islandHorizontalScale,
        verticalScale: TITLE_SCENE.islandVerticalScale,
        localizeTerrainCenterZ: true,
        namePrefix: 'title-coastal-rock'
      });
    })
    .catch(error => console.error('[TITLE COASTAL ROCK FALLBACK]', error));

  terrain.terrainMaterial?.dispose?.();
  return island;
}
