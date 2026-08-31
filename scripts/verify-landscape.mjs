import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IslandTerrainSystem } from '../src/world/IslandTerrainSystem.js';
import { FernFieldSystem } from '../src/world/FernFieldSystem.js';
import { DistantMountainSystem } from '../src/world/DistantMountainSystem.js';
import { WaterVisualSystem } from '../src/world/WaterVisualSystem.js';
import { TreeOcclusionSystem } from '../src/world/TreeOcclusionSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const terrain = new IslandTerrainSystem(new THREE.Group());
const satellites = terrain.getSatelliteIslands();
assert.equal(satellites.length >= 5, true, 'landscape pass must retain multiple satellite islands');

for (const island of satellites) {
  assert.equal(terrain.isPlayable(island.x, island.z), true, `${island.id} centre must be traversable`);
  assert.equal(terrain.heightAt(island.x, island.z) > terrain.waterLevel + 0.55, true, `${island.id} must rise above shallow water`);
  assert.equal(terrain.isSandAt(island.x, island.z), false, `${island.id} interior must support vegetation`);
  assert.equal(island.bar.width >= 11, true, `${island.id} shoal must keep a broad base width`);
}

const eastern = satellites.find(island => island.id === 'eastern-cay');
assert.ok(eastern, 'eastern satellite island must exist');
const barX = (eastern.bar.x1 + eastern.bar.x2) * 0.5;
const barZ = (eastern.bar.z1 + eastern.bar.z2) * 0.5;
const barHeight = terrain.heightAt(barX, barZ);
assert.equal(terrain.isPlayable(barX, barZ), true, 'satellite shoals must be traversable');
assert.equal(terrain.isSandAt(barX, barZ), true, 'shoal surface must stay classified as sand');
assert.equal(barHeight > terrain.seabedLevel + 0.25, true, 'shoal must rise materially above the seabed');
assert.equal(barHeight < terrain.waterLevel + 0.4, true, 'shoal midpoint must remain shallow-water / low-sand scale');

const dx = eastern.bar.x2 - eastern.bar.x1;
const dz = eastern.bar.z2 - eastern.bar.z1;
const length = Math.hypot(dx, dz);
const nx = -dz / length;
const nz = dx / length;
const approachT = 0.8;
const approachX = eastern.bar.x1 + dx * approachT + nx * eastern.bar.width * 0.72;
const approachZ = eastern.bar.z1 + dz * approachT + nz * eastern.bar.width * 0.72;
assert.equal(terrain.isPlayable(approachX, approachZ), true, 'satellite shoal must support an angled approach near the island');
assert.equal(terrain.isSandAt(approachX, approachZ), true, 'angled satellite approach should still read as a sand/shallow-water shelf');

const waterGroup = new THREE.Group();
const waterVisuals = new WaterVisualSystem({ group: waterGroup, terrain });
waterVisuals.create();
assert.ok(waterGroup.getObjectByName('stylized-ocean-shimmer'), 'water must retain a lightweight animated ocean shimmer layer');
assert.ok(waterGroup.getObjectByName('main-island-shallow-water-shelf'), 'main shoreline must expose a visible shallow-water shelf');
for (const island of satellites) {
  const satelliteShelf = waterGroup.getObjectByName(`satellite-shallow-water-${island.id}`);
  const barShelf = waterGroup.getObjectByName(`sandbar-shallow-water-${island.id}`);
  assert.ok(satelliteShelf, `${island.id} must have a visible shallow-water shelf around its sides`);
  assert.ok(barShelf, `${island.id} sandbar must have a broad shallow-water visual reach`);
  assert.equal(satelliteShelf.geometry.parameters.outerRadius >= 1.5, true, `${island.id} shallow shelf must visibly extend beyond the island edge`);
}
const shimmer = waterGroup.getObjectByName('stylized-ocean-shimmer');
const initialWaterTime = shimmer.material.uniforms.uTime.value;
waterVisuals.update(0.5);
assert.equal(shimmer.material.uniforms.uTime.value > initialWaterTime, true, 'stylized water shimmer must animate without a texture dependency');

let fernPeak = 0;
for (let x = -120; x <= 120; x += 12) {
  for (let z = -100; z <= 100; z += 12) {
    fernPeak = Math.max(fernPeak, terrain.fernDensityAt(x, z));
  }
}
assert.equal(fernPeak > 0.35, true, 'terrain ecology must expose meaningful fern habitat');
const beachZ = terrain.centerZ + terrain.coastRadiusAt(Math.PI / 2) * 0.95;
assert.equal(terrain.fernDensityAt(0, beachZ), 0, 'ferns must never spawn on beach sand');

const vegetationGroup = new THREE.Group();
const reactiveTerrain = {
  getScatterBounds: () => ({ halfX: 1, halfZ: 1, centerZ: 0 }),
  fernDensityAt: () => 1,
  heightAt: () => 0
};
const ferns = new FernFieldSystem({
  group: vegetationGroup,
  terrain: reactiveTerrain,
  scatter: { isGrassClear: () => true },
  maxInstances: 24
});
assert.equal(ferns.populate(), 24, 'fern field must populate through the shared reactive vegetation engine');
const player = new THREE.Vector3(0, 0, 0);
ferns.update(1 / 60, player);
player.x = 0.35;
ferns.update(1 / 60, player);
assert.equal(ferns.active.size > 0, true, 'nearby ferns must enter the character-reaction set');
assert.equal(ferns.entries.some(entry => Math.abs(entry.bendX) + Math.abs(entry.bendZ) + entry.compression > 0.001), true, 'reactive ferns must bend/compress when the Ranger moves through them');

const occlusionGroup = new THREE.Group();
const treeGeometry = new THREE.BoxGeometry(2, 6, 2);
const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7a3b });
const treeBatch = new THREE.InstancedMesh(treeGeometry, treeMaterial, 1);
treeBatch.name = 'forest-tree-batch-0-0';
treeBatch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 3, 0));
treeBatch.instanceMatrix.needsUpdate = true;
occlusionGroup.add(treeBatch);
const occlusionCollision = new WorldCollisionSystem({
  heightAt: () => 0,
  isPlayable: () => true
});
occlusionCollision.addObstacle({ x: 0, z: 0, radius: 0.72, type: 'tree', label: 'forest-tree-0' });
const treeOcclusion = new TreeOcclusionSystem({
  group: occlusionGroup,
  collision: occlusionCollision,
  maxFadedTrees: 2
});
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 4, 8);
const ranger = new THREE.Vector3(0, 0, -8);
treeOcclusion.update(ranger, camera);
const hiddenMatrix = new THREE.Matrix4();
const hiddenPosition = new THREE.Vector3();
treeBatch.getMatrixAt(0, hiddenMatrix);
hiddenPosition.setFromMatrixPosition(hiddenMatrix);
assert.equal(hiddenPosition.y < -900, true, 'tree between camera and Ranger must leave the opaque forest batch');
const fadeBatch = occlusionGroup.getObjectByName('forest-tree-occlusion-fade-0-0');
assert.ok(fadeBatch, 'tree occlusion must use a bounded transparent instanced fade batch');
assert.equal(fadeBatch.count, 1, 'only occluding trees should enter the transparent fade batch');
assert.equal(fadeBatch.material.transparent, true, 'occluding tree presentation must be transparent');
assert.equal(fadeBatch.material.opacity <= 0.25, true, 'foreground tree must become transparent enough to keep the Ranger visible');

camera.position.set(20, 4, 8);
treeOcclusion.update(ranger, camera);
const restoredMatrix = new THREE.Matrix4();
const restoredPosition = new THREE.Vector3();
treeBatch.getMatrixAt(0, restoredMatrix);
restoredPosition.setFromMatrixPosition(restoredMatrix);
assert.equal(Math.abs(restoredPosition.y - 3) < 0.001, true, 'tree must return to opaque presentation when it no longer blocks the Ranger');
assert.equal(fadeBatch.count, 0, 'transparent fade batch must clear after occlusion ends');

const horizonGroup = new THREE.Group();
const mountains = new DistantMountainSystem({ group: horizonGroup, centerZ: terrain.centerZ });
assert.equal(mountains.create(), 25, 'distant landmass silhouette count must remain deterministic');
assert.equal(horizonGroup.children.length, 2, 'distant landmasses should remain batched into two render-only rings');
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
for (const mesh of horizonGroup.children) {
  assert.equal(mesh.isInstancedMesh, true, 'distant landmasses must remain instanced for mobile performance');
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const radius = Math.hypot(position.x, position.z - terrain.centerZ);
    assert.equal(radius >= 315, true, 'distant landmasses must stay beyond the playable island envelope');
    assert.equal(scale.x / scale.y >= 2.4, true, 'horizon silhouettes must stay broad and land-like rather than sharp peaks');
  }
}

console.log('landscape contracts verified');
