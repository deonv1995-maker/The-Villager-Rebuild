import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IslandTerrainSystem } from '../src/world/IslandTerrainSystem.js';
import { FernFieldSystem } from '../src/world/FernFieldSystem.js';
import { DistantMountainSystem } from '../src/world/DistantMountainSystem.js';

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
