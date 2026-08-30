import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IslandTerrainSystem } from '../src/world/IslandTerrainSystem.js';
import { SatelliteApproachSystem } from '../src/world/SatelliteApproachSystem.js';
import { WaterSurfaceSystem } from '../src/world/WaterSurfaceSystem.js';
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

const approachGroup = new THREE.Group();
const approaches = new SatelliteApproachSystem({ group: approachGroup, terrain });
assert.equal(approaches.create(), satellites.length, 'each satellite must receive one broad blended shallow shelf');
for (const side of [-0.72, 0.72]) {
  const angled = approaches.getApproachPoint('eastern-cay', 0.82, side);
  assert.ok(angled, 'eastern approach sample must exist');
  assert.equal(terrain.isPlayable(angled.x, angled.z), false, 'test point must sit outside the old narrow shoal boundary');
  assert.equal(approaches.isPlayable(angled.x, angled.z, 0.8), true, 'new satellite shelf must support a strong angled approach');
  const shelfHeight = approaches.heightAt(angled.x, angled.z);
  assert.equal(shelfHeight > terrain.seabedLevel + 0.2, true, 'angled shelf must rise above the deep seabed');
  assert.equal(shelfHeight < terrain.waterLevel + 0.28, true, 'angled shelf must stay shallow-water / low-sand scale');
}

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

const waterGroup = new THREE.Group();
const placeholderWater = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial());
placeholderWater.name = 'foundation-water';
waterGroup.add(placeholderWater);
const waterTerrain = {
  extentX: 20,
  extentZ: 20,
  waterLevel: 0,
  seabedLevel: -1.5,
  isPlayable: () => true,
  heightAt: () => -0.28
};
const water = new WaterSurfaceSystem({ group: waterGroup, terrain: waterTerrain, maxRipples: 4 });
assert.equal(water.create(), 4, 'water effect must keep a small deterministic ripple pool');
assert.equal(water.surface.material.isShaderMaterial, true, 'water surface must use the lightweight animated shader');
const wader = new THREE.Vector3(0, 0, 0);
water.update(0.1, wader);
wader.x = 1.1;
water.update(0.1, wader);
assert.equal(water.getActiveRippleCount() > 0, true, 'moving through shallow water must activate a pooled ripple');
water.update(1.2, wader);
assert.equal(water.getActiveRippleCount(), 0, 'water ripples must recover back into the pool');

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
