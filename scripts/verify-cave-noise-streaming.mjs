import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UNDERGROUND_TUNNELING as config } from '../src/data/UndergroundTunnelingDefinitions.js';
import {
  naturalCaveFeatureDistance2D,
  naturalCaveNoiseAt,
  naturalCaveSegmentCenterAt,
  naturalCaveSegmentFieldAt,
  naturalCaveSegmentBounds,
  naturalCaveSegmentRadiusAt
} from '../src/world/NaturalCaveNetworkProfile.js';
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

const curvedSegment = {
  type: 'segment',
  kind: 'gallery',
  a: {x: 0, y: -8, z: 0},
  b: {x: 0, y: -8, z: 30},
  radiusA: 2,
  radiusB: 2,
  curve: {
    controlA: {x: 2.2, y: -8.6, z: 10},
    controlB: {x: -1.6, y: -8.35, z: 20},
    radiusBulge: 0.36
  }
};
assert.deepEqual(naturalCaveSegmentCenterAt(curvedSegment, 0), curvedSegment.a, 'curve must preserve the route start');
assert.deepEqual(naturalCaveSegmentCenterAt(curvedSegment, 1), curvedSegment.b, 'curve must preserve the route end');
const curvedQuarter = naturalCaveSegmentCenterAt(curvedSegment, 0.25);
const curvedMiddle = naturalCaveSegmentCenterAt(curvedSegment, 0.5);
assert.ok(Math.abs(curvedQuarter.x) > 0.45, 'cached controls must visibly bend the route away from a straight corridor');
assert.ok(curvedMiddle.y < -8.2, 'natural routes must be able to dip between established endpoints');
assert.ok(
  naturalCaveSegmentFieldAt(curvedMiddle.x, curvedMiddle.y, curvedMiddle.z, curvedSegment, config) < 0,
  'the curved centerline must remain open cave space'
);
const curvedBounds = naturalCaveSegmentBounds(curvedSegment, config);
assert.ok(curvedBounds.maxX > curvedSegment.curve.controlA.x, 'bounds must include positive route meanders');
assert.ok(curvedBounds.minX < curvedSegment.curve.controlB.x, 'bounds must include negative route meanders');
assert.equal(
  naturalCaveFeatureDistance2D(curvedSegment, curvedMiddle.x, curvedMiddle.z),
  0,
  'activation distance must follow the curved passage instead of only its straight chord'
);

const terrain = {heightAt: () => 8, naturalHeightAt: () => 8, centerZ: 0, coastRadiusAt: () => 120, isPlayable: () => true, setTunnelingOpenings() {}};
const makeWorld = () => {
  const system = new UndergroundTunnelingSystem({group: new THREE.Group(), terrain});
  system.create();
  return system;
};
const system = makeWorld();
const network = system.getNaturalCaveNetwork();
const curvedNetworkSegments = network.segments.filter(segment => segment.kind !== 'entrance' && segment.curve);
assert.ok(curvedNetworkSegments.length >= network.segments.length * 0.6, 'most underground route sections must use cached natural meanders');
const galleryNetworkSegments = curvedNetworkSegments.filter(segment => segment.kind !== 'fissure');
assert.ok(
  galleryNetworkSegments.every(segment => segment.curve.radiusBulges?.length === 2),
  'traversable cached meanders must carry two separated gallery-width pulses'
);
assert.ok(
  curvedNetworkSegments
    .filter(segment => segment.kind === 'fissure')
    .every(segment => segment.curve.radiusBulges?.length === 0),
  'sealed-room fissures must never inherit gallery bulges that make them traversable'
);
const galleryPulseSegment = galleryNetworkSegments
  .slice()
  .sort((a, b) =>
    Math.max(...b.curve.radiusBulges.map(entry => entry.radius))
      - Math.max(...a.curve.radiusBulges.map(entry => entry.radius))
  )[0];
const galleryPulse = galleryPulseSegment.curve.radiusBulges
  .slice()
  .sort((a, b) => b.radius - a.radius)[0];
const pulseBaseRadius =
  galleryPulseSegment.radiusA
  + (galleryPulseSegment.radiusB - galleryPulseSegment.radiusA) * galleryPulse.t;
assert.ok(
  naturalCaveSegmentRadiusAt(galleryPulseSegment, galleryPulse.t)
    - pulseBaseRadius > 0.7,
  'long natural passages must open into materially wider gallery pockets'
);
assert.ok(network.segments.filter(segment => segment.kind === 'entrance').every(segment => segment.curve === null), 'surface mouth cuts must keep their established exact alignment');
assert.ok(
  network.segments.some(segment => Math.abs(segment.b.y - segment.a.y) > 9),
  'natural topology must contain major vertical transitions between route endpoints'
);
assert.ok(
  curvedNetworkSegments.some(segment => {
    const quarter = naturalCaveSegmentCenterAt(segment, 0.25);
    const linearY = segment.a.y + (segment.b.y - segment.a.y) * 0.25;
    return quarter.y > linearY + 0.35;
  }),
  'cached natural route controls must be able to rise above their linear slope'
);
assert.ok(
  curvedNetworkSegments.some(segment => {
    const quarter = naturalCaveSegmentCenterAt(segment, 0.25);
    const linearY = segment.a.y + (segment.b.y - segment.a.y) * 0.25;
    return quarter.y < linearY - 0.35;
  }),
  'cached natural route controls must also dip below their linear slope'
);
assert.ok(curvedNetworkSegments.some(segment => {
  const oneThird = naturalCaveSegmentCenterAt(segment, 1 / 3);
  const straightX = segment.a.x + (segment.b.x - segment.a.x) / 3;
  const straightZ = segment.a.z + (segment.b.z - segment.a.z) / 3;
  return Math.hypot(oneThird.x - straightX, oneThird.z - straightZ) > 0.35;
}), 'generated natural passages must contain visible horizontal bends');
const deterministicWorld = makeWorld();
assert.deepEqual(
  deterministicWorld.getNaturalCaveNetwork().segments.map(segment => segment.curve),
  network.segments.map(segment => segment.curve),
  'cached route meanders must be deterministic for the same world'
);
const entrance = network.entrances[0];
const player = {...entrance, y: 8};
// Advance a deterministic clock per scheduler checkpoint. Avoid flaky wall-time assertions.
const realNow = performance.now;
let tick = 0;
Object.defineProperty(performance, 'now', {configurable: true, value: () => tick += config.naturalMeshBudgetMs + 1});
try {
  system.update(player);
  assert.ok(system.naturalChunkBuild, 'an expensive chunk must suspend within the frame');
  assert.equal(system.activeChunks.size, 0, 'partial meshes must never be published');

  const prioritySystem = makeWorld();
  prioritySystem.update(player);
  const initialPriorityBuild = prioritySystem.naturalChunkBuild;
  assert.ok(initialPriorityBuild, 'priority regression requires a suspended background chunk');
  const [priorityIx, priorityIy, priorityIz] = initialPriorityBuild.key.split(':').map(Number);
  const caveChunkSize = config.cellSize * config.chunkCells;
  const initialPriorityCenter = {
    x: (priorityIx + 0.5) * caveChunkSize,
    y: (priorityIy + 0.5) * caveChunkSize,
    z: (priorityIz + 0.5) * caveChunkSize
  };
  const effectiveCriticalRadius =
    config.naturalCriticalRenderRadius + caveChunkSize * Math.sqrt(3) * 0.5;
  const moveTarget = prioritySystem.pendingNaturalChunkRebuilds
    .slice()
    .sort((a, b) => {
      const aDistance = Math.hypot(
        a.x - initialPriorityCenter.x,
        a.y - initialPriorityCenter.y,
        a.z - initialPriorityCenter.z
      );
      const bDistance = Math.hypot(
        b.x - initialPriorityCenter.x,
        b.y - initialPriorityCenter.y,
        b.z - initialPriorityCenter.z
      );
      return bDistance - aDistance;
    })
    .find(entry =>
      Math.hypot(
        entry.x - initialPriorityCenter.x,
        entry.y - initialPriorityCenter.y,
        entry.z - initialPriorityCenter.z
      ) > effectiveCriticalRadius + 0.5
      && Math.hypot(
        entry.x - initialPriorityCenter.x,
        entry.z - initialPriorityCenter.z
      ) < config.naturalQueueRetentionRadius
      && Math.abs(entry.y - initialPriorityCenter.y)
        < config.naturalQueueRetentionVerticalRadius
    );
  assert.ok(moveTarget, 'prewarm queue must include a farther resumable chunk for priority coverage');
  prioritySystem.update({x: moveTarget.x, y: moveTarget.y, z: moveTarget.z});
  assert.notEqual(
    prioritySystem.naturalChunkBuild?.key,
    initialPriorityBuild.key,
    'newly critical cave geometry must preempt a farther partially sampled chunk'
  );
  assert.ok(
    prioritySystem.pendingNaturalChunkRebuilds.some(entry =>
      entry.key === initialPriorityBuild.key && entry.iterator
    ),
    'preempted cave work must retain its iterator so completed sampling is not discarded'
  );
  const [activePriorityIx, activePriorityIy, activePriorityIz] =
    prioritySystem.naturalChunkBuild.key.split(':').map(Number);
  assert.ok(
    Math.hypot(
      (activePriorityIx + 0.5) * caveChunkSize - moveTarget.x,
      (activePriorityIy + 0.5) * caveChunkSize - moveTarget.y,
      (activePriorityIz + 0.5) * caveChunkSize - moveTarget.z
    ) <= effectiveCriticalRadius + 0.0001,
    'the resumed scheduler must immediately work inside the near-player critical volume'
  );

  const oldIterator = system.naturalChunkBuild.iterator;
  system.refreshTerrainSurface({x: entrance.x, z: entrance.z, radius: 1});
  system.update(player);
  assert.notEqual(system.naturalChunkBuild.iterator, oldIterator, 'terrain edits must restart stale density snapshots');
  for (let i = 0; i < 2500 && system.activeChunks.size === 0; i++) system.update(player);
  assert.equal(system.activeChunks.size, 1, 'resumable meshing must eventually publish a complete chunk');
  const first = [...system.activeChunks.values()][0];
  assert.ok(first.mesh.geometry.getAttribute('position').array.every(Number.isFinite));
  const reference = makeWorld();
  reference.config = {
    ...config,
    naturalMeshBudgetMs: 1e9,
    naturalCriticalMeshBudgetMs: 1e9
  };
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
