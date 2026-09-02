import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { RoofThatchSystem, THATCH_GRASS_COST } from '../src/world/RoofThatchSystem.js';
import {
  StructureRoofQuery,
  pointInsideRoofRegion,
  roofMemberCandidates
} from '../src/world/StructureRoofQuery.js';
import {
  STRUCTURE_INTERIOR_FADE_OPACITY,
  StructureInteriorOcclusionSystem,
  isCameraSideStructurePart
} from '../src/world/StructureInteriorOcclusionSystem.js';

const half = PHYSICAL_LOG.halfLength;
const framePoints = [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half]
];
const physicalLogs = {
  builtLogs: framePoints.map(([x, z], id) => ({
    id,
    mode: 'frame',
    active: true,
    x,
    z,
    yaw: 0,
    baseY: 0,
    centerY: PHYSICAL_LOG.halfLength,
    topY: PHYSICAL_LOG.length,
    root: new THREE.Group()
  })),
  structureRevision: 1
};
physicalLogs.builtLogs.push(...[
  'beam:0-1',
  'beam:1-2',
  'beam:2-3',
  'beam:0-3'
].map((rawKey, index) => ({
  id: 4 + index,
  mode: 'raw',
  active: true,
  rawKey,
  snapKind: 'frame-pair-top',
  x: 0,
  z: 0,
  yaw: 0,
  baseY: PHYSICAL_LOG.length,
  centerY: PHYSICAL_LOG.length,
  topY: PHYSICAL_LOG.length + PHYSICAL_LOG.radius,
  root: new THREE.Group()
})));

const roofQuery = new StructureRoofQuery({ physicalLogs });
const regions = roofQuery.getRegions({ x: 0, z: 0 });
assert.equal(regions.length, 1, 'A closed four-frame and RAW-beam structure must resolve one roof region');
const region = regions[0];
assert.equal(pointInsideRoofRegion(region, { x: 0, z: 0 }), true, 'Region centre must be recognized as interior');

const members = roofMemberCandidates(region);
assert.equal(members.length, 5, 'A basic gable roof must require four rafters and one ridge');
physicalLogs.builtLogs.push(...members.map((member, index) => ({
  id: 10 + index,
  mode: 'roof',
  active: true,
  x: member.x,
  z: member.z,
  yaw: member.yaw,
  baseY: Math.min(region.eaveY, member.y),
  centerY: member.y,
  topY: Math.max(region.ridgeY, member.y),
  roofLength: member.roofLength,
  roofKey: member.roofKey,
  roofRegionKey: member.roofRegionKey,
  root: new THREE.Group()
})));
physicalLogs.structureRevision += 1;

const panels = roofQuery.getCompletedPanels({ x: 0, z: 0 });
assert.equal(panels.length, 2, 'A completed gable roof must expose two thatch panels, one per slope');
assert.notEqual(panels[0].id, panels[1].id, 'Each roof slope needs a stable unique panel identity');

const inventory = new InventorySystem();
inventory.add('grass', THATCH_GRASS_COST * 2);
const group = new THREE.Group();
const thatch = new RoofThatchSystem({ group, physicalLogs, inventory, roofQuery });
const playerPosition = new THREE.Vector3(0, 0, 0);
const firstTarget = thatch.getTarget(playerPosition);
assert.ok(firstTarget, 'A completed unthatched roof must offer a nearby thatch target');
assert.equal(firstTarget.cost, 4, 'Each roof panel must cost exactly four Grass');
assert.equal(firstTarget.canAfford, true);
const firstBuild = thatch.thatch(firstTarget.id, playerPosition);
assert.equal(firstBuild?.built, true, 'First roof panel must accept thatch when four Grass are available');
assert.equal(inventory.get('grass'), 4, 'Thatching one panel must consume exactly four Grass');
assert.equal(thatch.getVisualEntries().length, 1, 'A thatched panel must create one structure-owned visual entry');

const secondTarget = thatch.getTarget(playerPosition);
assert.ok(secondTarget && secondTarget.id !== firstTarget.id, 'After one side is covered, targeting must advance to the remaining roof panel');
assert.equal(thatch.thatch(secondTarget.id, playerPosition)?.built, true);
assert.equal(inventory.get('grass'), 0, 'Two basic roof panels must consume eight Grass total');
assert.equal(thatch.getTarget(playerPosition), null, 'Fully thatched basic roof must have no open thatch target');

const nearRoot = new THREE.Group();
const nearMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 2.4, 0.3),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
nearRoot.add(nearMesh);
physicalLogs.builtLogs.push({
  id: 30,
  mode: 'wall',
  active: true,
  x: 0,
  z: half,
  centerY: 1.4,
  root: nearRoot
});
const farRoot = new THREE.Group();
const farMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 2.4, 0.3),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
farRoot.add(farMesh);
physicalLogs.builtLogs.push({
  id: 31,
  mode: 'wall',
  active: true,
  x: 0,
  z: -half,
  centerY: 1.4,
  root: farRoot
});
physicalLogs.structureRevision += 1;

const cameraPosition = new THREE.Vector3(0, 3, 6);
assert.equal(
  isCameraSideStructurePart(playerPosition, cameraPosition, { x: 0, z: half }),
  true,
  'Structure between the camera and Ranger must classify as camera-side'
);
assert.equal(
  isCameraSideStructurePart(playerPosition, cameraPosition, { x: 0, z: -half }),
  false,
  'Structure furthest from the camera must remain on the solid side'
);

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
camera.position.copy(cameraPosition);
camera.lookAt(0, 1, 0);
camera.updateMatrixWorld(true);
const occlusion = new StructureInteriorOcclusionSystem({
  physicalLogs,
  roofQuery,
  roofThatchSystem: thatch
});
const activeRegion = occlusion.update(playerPosition, camera);
assert.ok(activeRegion, 'Ranger under a completed roof must activate interior structure visibility');
assert.equal(
  Math.abs(nearMesh.material.opacity - STRUCTURE_INTERIOR_FADE_OPACITY) < 0.000001,
  true,
  'Camera-side structure must become semi-transparent while indoors'
);
assert.equal(farMesh.material.opacity, 1, 'Far-side structure must remain fully solid while indoors');

occlusion.update(new THREE.Vector3(20, 0, 20), camera);
assert.equal(nearMesh.material.opacity, 1, 'Leaving the structure must restore camera-side materials to solid');

const removedRoof = physicalLogs.builtLogs.find(entry => entry.mode === 'roof');
removedRoof.active = false;
physicalLogs.structureRevision += 1;
thatch.sync();
assert.equal(thatch.getVisualEntries().length, 0, 'Removing required roof framing must remove dependent thatch panels');
assert.equal(inventory.get('grass'), 8, 'Invalidated thatch panels must refund their four-Grass costs');

console.log('Thatch roof cost, panel targeting, structural dependency and interior camera-side fading verified');
