import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { WorldChunkSystem } from '../src/world/WorldChunkSystem.js';
import { WaterVisualSystem } from '../src/world/WaterVisualSystem.js';

const terrain = new ExpandedIslandTerrainSystem(new THREE.Group());
assert.equal(terrain.mainlandScale, 2, 'expanded mainland must retain the agreed 2x linear scale');
assert.equal(terrain.coastRadiusAt(0) > 300, true, 'expanded east/west mainland radius must materially exceed the old island');
assert.equal(terrain.coastRadiusAt(Math.PI) > 300, true, 'expanded west mainland radius must materially exceed the old island');
assert.equal(terrain.coastRadiusAt(Math.PI / 2) < 160, true, 'Day-1 southern coast must remain a deep inlet rather than moving the tutorial inland');
const spawn = terrain.getSpawnPoint();
assert.equal(terrain.isPlayable(spawn.x, spawn.z), true, 'existing Day-1 spawn must stay playable after mainland expansion');

const satellites = terrain.getSatelliteIslands();
assert.equal(satellites.length, 9, 'expanded archipelago must keep a deterministic set of nine satellite islands');
const areas = satellites.map(island => island.halfX * island.halfZ);
const aspectRatios = satellites.map(island => Math.max(island.halfX, island.halfZ) / Math.min(island.halfX, island.halfZ));
assert.equal(Math.max(...areas) / Math.min(...areas) > 1.7, true, 'satellite islands must vary materially in size');
assert.equal(Math.max(...aspectRatios) - Math.min(...aspectRatios) > 0.28, true, 'satellite islands must vary materially in shape');
assert.equal(new Set(satellites.map(island => `${Math.round(island.x)}:${Math.round(island.z)}`)).size, satellites.length, 'satellite placement must remain unique');
for (const island of satellites) {
  assert.equal(terrain.isPlayable(island.x, island.z), true, `${island.id} centre must remain traversable`);
  assert.equal(island.bar.width >= 9.5, true, `${island.id} sandbar must retain a broad shallow-water approach`);
}

const eastCoast = terrain.coastRadiusAt(0);
let shallowSamples = 0;
let deepestInlandNormalized = 1;
for (let radius = eastCoast * 0.84; radius <= eastCoast; radius += 2) {
  const x = radius;
  const z = terrain.centerZ;
  if (!terrain.isShallowWaterAt(x, z)) continue;
  shallowSamples += 1;
  deepestInlandNormalized = Math.min(deepestInlandNormalized, radius / eastCoast);
}
assert.equal(shallowSamples >= 4, true, 'mainland coast must expose a broad traversable shallow-water band');
assert.equal(deepestInlandNormalized < 0.96, true, 'shallow water must visibly reach inland instead of hugging only the outer shoreline');

const chunkGroup = new THREE.Group();
const chunks = new WorldChunkSystem({ group: chunkGroup, chunkSize: 72, renderDistance: 190, frustumPadding: 20 });
const near = new THREE.Object3D();
near.name = 'near-chunk-object';
chunks.addObjectAt(near, 0, -30);
const far = new THREE.Object3D();
far.name = 'far-chunk-object';
chunks.addObjectAt(far, 430, 0);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 600);
camera.position.set(0, 12, 14);
camera.lookAt(0, 0, -80);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
chunks.update(camera, new THREE.Vector3(0, 0, 0));
assert.equal(near.parent.visible, true, 'player/camera neighborhood chunk must remain visible');
assert.equal(far.parent.visible, false, 'distant off-screen chunk must not render');
assert.equal(chunks.getStats().visible < chunks.getStats().total, true, 'chunk system must cull at least one registered off-screen chunk');

const treeGeometry = new THREE.BoxGeometry(1, 4, 1);
const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x3b733c });
const treeBatch = new THREE.InstancedMesh(treeGeometry, treeMaterial, 4);
treeBatch.name = 'forest-tree-batch-0-0';
for (let index = 0; index < 4; index += 1) {
  treeBatch.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 80, 2, 0));
}
treeBatch.instanceMatrix.needsUpdate = true;
chunkGroup.add(treeBatch);
assert.equal(chunks.splitTreeBatches(chunkGroup), 4, 'tree splitter must preserve every source tree in chunk registry');
assert.equal(chunks.getTreeRenderHandles(0).length, 1, 'tree registry must resolve chunk-local render handles by stable tree id');
assert.equal(chunkGroup.getObjectByName('forest-tree-batch-0-0'), undefined, 'global tree batch must be removed after chunk split');
assert.equal(chunks.getTreeTemplateCount(), 1, 'chunk tree registry must retain a reusable render template for occlusion fading');

const waterGroup = new THREE.Group();
const waterChunks = new WorldChunkSystem({ group: waterGroup, chunkSize: 40, renderDistance: 100 });
const waterTerrain = {
  extentX: 45,
  extentZ: 45,
  centerZ: 0,
  waterLevel: -0.5,
  shallowWaterStrengthAt: () => 0.9,
  heightAt: () => -0.72,
  isShallowWaterAt: () => true
};
const water = new WaterVisualSystem({ group: waterGroup, terrain: waterTerrain, chunks: waterChunks });
water.create();
assert.ok(waterGroup.getObjectByName('stylized-ocean-shimmer'), 'expanded water must retain animated ocean shimmer');
assert.equal([...waterChunks.chunks.values()].some(chunk => chunk.root.children.some(child => child.name.startsWith('shallow-water-chunk-'))), true, 'shallow-water geometry must be owned by render chunks');
const ranger = new THREE.Vector3(0, 0, 0);
water.update(1 / 60, ranger);
ranger.x = 0.6;
water.update(1 / 60, ranger);
assert.equal(water.ripples.some(ripple => ripple.visible), true, 'walking through shallow water must emit a visible Ranger ripple');

console.log('expanded world streaming contracts verified');
