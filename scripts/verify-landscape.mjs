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
}

const eastern = satellites.find(island => island.id === 'eastern-cay');
assert.ok(eastern, 'eastern satellite island must exist');
const barX = (eastern.bar.x1 + eastern.bar.x2) * 0.5;
const barZ = (eastern.bar.z1 + eastern.bar.z2) * 0.5;
const barHeight = terrain.heightAt(barX, barZ);
assert.equal(terrain.isPlayable(barX, barZ), true, 'satellite sandbars must be traversable');
assert.equal(terrain.isSandAt(barX, barZ), true, 'sandbar surface must stay classified as sand');
assert.equal(barHeight > terrain.seabedLevel + 0.25, true, 'sandbar must rise materially above the seabed');
assert.equal(barHeight < terrain.waterLevel + 0.4, true, 'sandbar midpoint must remain shallow-water / low-sand scale');

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
assert.equal(mountains.create(), 37, 'distant mountain silhouette count must remain deterministic');
assert.equal(horizonGroup.children.length, 2, 'distant mountains should remain batched into two render-only rings');
for (const mesh of horizonGroup.children) {
  assert.equal(mesh.isInstancedMesh, true, 'distant mountains must remain instanced for mobile performance');
}

console.log('landscape contracts verified');
