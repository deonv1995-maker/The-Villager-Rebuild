import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UNDERGROUND_TUNNELING as config } from '../src/data/UndergroundTunnelingDefinitions.js';
import { naturalCaveNoiseAt, naturalCaveSegmentFieldAt, naturalCaveSegmentBounds } from '../src/world/NaturalCaveNetworkProfile.js';
import { tunnelingExcavationFieldAt } from '../src/world/TunnelingTerrainProfile.js';
import { UndergroundTunnelingSystem } from '../src/world/UndergroundTunnelingSystem.js';

const segment = {kind: 'gallery', a: {x: 0, y: -8, z: 0}, b: {x: 0, y: -8, z: 30}, radiusA: 2, radiusB: 2};
const bounds = naturalCaveSegmentBounds(segment, config);
const floorY = -8 - 2 * config.tunnelFloorDropScale;
let erodedSamples = 0;
const widths = [];
for (let z = 1; z < 29; z += 0.5) {
  let width = 0;
  for (let x = 0; x < bounds.maxX + 1; x += 0.05) {
    const y = -7.6;
    const field = naturalCaveSegmentFieldAt(x, y, z, segment, config);
    const original = tunnelingExcavationFieldAt(x, y, z, {x: 0, y: -8, z, radius: 2}, config);
    assert.ok(field <= original + 1e-9, 'natural erosion must preserve existing passage clearance');
    if (original > 0 && field < 0) erodedSamples++;
    if (field < 0) width = x;
    assert.ok(naturalCaveSegmentFieldAt(x, floorY - 0.1, z, segment, config) > 0, 'support floors must not be eroded');
  }
  widths.push(width);
  assert.ok(naturalCaveSegmentFieldAt(bounds.maxX + 0.01, -8, z, segment, config) > 0, 'erosion must stay within feature bounds');
  assert.ok(naturalCaveSegmentFieldAt(0, bounds.maxY + 0.01, z, segment, config) > 0, 'roof must stay within feature bounds');
}
assert.ok(erodedSamples > 100, 'noise must change real traversable cave geometry');
assert.ok(Math.max(...widths) - Math.min(...widths) > 0.25, 'passage walls must vary along the route');
for (const x of [-8.64, -1, 0, 8.64, 17.28]) {
  const n = naturalCaveNoiseAt(x, -4.2, 3.7);
  assert.ok(n >= 0 && n <= 1);
  assert.equal(n, naturalCaveNoiseAt(x, -4.2, 3.7));
  assert.ok(Math.abs(naturalCaveNoiseAt(x - 1e-7, -4.2, 3.7) - naturalCaveNoiseAt(x + 1e-7, -4.2, 3.7)) < 1e-5, 'noise must be continuous across negative coordinates and chunk borders');
}

const terrain = {heightAt: () => 8, naturalHeightAt: () => 8, centerZ: 0, coastRadiusAt: () => 120, isPlayable: () => true, setTunnelingOpenings() {}};
const makeWorld = () => {
  const system = new UndergroundTunnelingSystem({group: new THREE.Group(), terrain});
  system.create();
  return system;
};
const system = makeWorld();
const entrance = system.getNaturalCaveNetwork().entrances[0];
const player = {...entrance, y: 8};
// Advance a deterministic clock per scheduler checkpoint. Avoid flaky wall-time assertions.
const realNow = performance.now;
let tick = 0;
Object.defineProperty(performance, 'now', {configurable: true, value: () => tick += config.naturalMeshBudgetMs + 1});
try {
  system.update(player);
  assert.ok(system.naturalChunkBuild, 'an expensive chunk must suspend within the frame');
  assert.equal(system.activeChunks.size, 0, 'partial meshes must never be published');
  const oldIterator = system.naturalChunkBuild.iterator;
  system.refreshTerrainSurface({x: entrance.x, z: entrance.z, radius: 1});
  system.update(player);
  assert.notEqual(system.naturalChunkBuild.iterator, oldIterator, 'terrain edits must restart stale density snapshots');
  for (let i = 0; i < 2500 && system.activeChunks.size === 0; i++) system.update(player);
  assert.equal(system.activeChunks.size, 1, 'resumable meshing must eventually publish a complete chunk');
  const first = [...system.activeChunks.values()][0];
  assert.ok(first.mesh.geometry.getAttribute('position').array.every(Number.isFinite));
  const reference = makeWorld();
  reference.config = {...config, naturalMeshBudgetMs: 1e9};
  reference.update(player);
  const referenceChunk = reference.activeChunks.get(first.key);
  assert.ok(referenceChunk, 'distance ordering must remain stable across time slices');
  assert.deepEqual(first.mesh.geometry.getAttribute('position').array,
    referenceChunk.mesh.geometry.getAttribute('position').array,
    'slicing must not change completed geometry');
  system.update(player);
  assert.ok(system.naturalChunkBuild, 'the next chunk must begin without a full synchronous rebuild');
  // Reset/load must discard a partially sampled old world.
  const saved = system.captureState();
  system.restoreState(saved);
  assert.equal(system.naturalChunkBuild, null);
} finally {
  Object.defineProperty(performance, 'now', {configurable: true, value: realNow});
}
console.log('Natural cave noise, preserved floors, chunk bounds and resumable mesh invalidation verified');
