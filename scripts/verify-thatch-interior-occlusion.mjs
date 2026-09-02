import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  RoofThatchSystem,
  THATCH_GRASS_COST,
  roofPanelEdgeHasNeighbour
} from '../src/world/RoofThatchSystem.js';
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
assert.ok(
  roofQuery.findStoreyRegion(new THREE.Vector3(0, 0, 0)),
  'A Ranger standing on the lower level must resolve the closed structural storey around them'
);

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
const adjoiningPanel = {
  id: 'adjoining-roof-bay',
  corners: [
    panels[0].corners[1],
    { x: panels[0].corners[1].x + PHYSICAL_LOG.length, y: panels[0].corners[1].y, z: panels[0].corners[1].z },
    { x: panels[0].corners[2].x + PHYSICAL_LOG.length, y: panels[0].corners[2].y, z: panels[0].corners[2].z },
    panels[0].corners[2]
  ]
};
assert.equal(
  roofPanelEdgeHasNeighbour(panels[0], [...panels, adjoiningPanel], 1, 2),
  true,
  'A shared multi-bay slope edge must be recognized so internal gable trim can be suppressed'
);
assert.equal(
  roofPanelEdgeHasNeighbour(panels[0], [...panels, adjoiningPanel], 0, 3),
  false,
  'An exposed outer slope edge must retain its gable trim'
);

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
const firstVisual = thatch.thatched.get(firstTarget.id)?.root;
assert.ok(firstVisual, 'A thatched panel must retain its finished visual root');
const firstVisualNames = new Set();
firstVisual.traverse(object => firstVisualNames.add(object.name));
assert.ok(firstVisualNames.has('thatch-underlay'), 'Finished thatch needs a darker depth underlay');
for (let index = 0; index < 5; index += 1) {
  assert.ok(firstVisualNames.has(`thatch-course-${index}`), `Finished thatch is missing overlapping course ${index}`);
  assert.ok(firstVisualNames.has(`thatch-course-fringe-${index}`), `Finished thatch is missing straw fringe ${index}`);
}
const battenBundle = firstVisual.getObjectByName('thatch-course-battens');
assert.ok(battenBundle?.isInstancedMesh, 'Finished thatch support battens must use one mobile-efficient instanced mesh');
assert.equal(battenBundle.count, 4, 'Each upper course edge must expose one support batten');
const eaveFringe = firstVisual.getObjectByName('thatch-course-fringe-0');
const fringePositions = eaveFringe?.geometry?.getAttribute('position');
assert.ok(fringePositions && fringePositions.count >= 18, 'The eave fringe needs multiple visible straw tufts');
const firstTuftBase = new THREE.Vector3(
  (fringePositions.getX(0) + fringePositions.getX(1)) * 0.5,
  (fringePositions.getY(0) + fringePositions.getY(1)) * 0.5,
  (fringePositions.getZ(0) + fringePositions.getZ(1)) * 0.5
);
const firstTuftTip = new THREE.Vector3(
  fringePositions.getX(2),
  fringePositions.getY(2),
  fringePositions.getZ(2)
);
assert.ok(firstTuftTip.distanceTo(firstTuftBase) > 0.17, 'The lowest straw fringe must project visibly beyond the eave');
const firstCourse = firstVisual.getObjectByName('thatch-course-0');
assert.ok(
  firstCourse?.geometry?.getAttribute('position')?.count === 8,
  'Each thatch course must be a solid-depth bundle instead of a flat four-corner sheet'
);
assert.ok(firstVisualNames.has('thatch-eave-fascia'), 'Finished thatch needs a timber eave fascia');
assert.ok(firstVisualNames.has('thatch-gable-trim-left'), 'Finished thatch needs left gable rake trim');
assert.ok(firstVisualNames.has('thatch-gable-trim-right'), 'Finished thatch needs right gable rake trim');
assert.ok(firstVisualNames.has('thatch-ridge-cap'), 'The canonical first roof side must own one shared ridge cap');
assert.equal(
  [...firstVisualNames].filter(name => name.startsWith('thatch-ridge-tie-')).length,
  3,
  'The finished ridge cap must be secured by three visible rope ties'
);

const secondTarget = thatch.getTarget(playerPosition);
assert.ok(secondTarget && secondTarget.id !== firstTarget.id, 'After one side is covered, targeting must advance to the remaining roof panel');
assert.equal(thatch.thatch(secondTarget.id, playerPosition)?.built, true);
assert.equal(inventory.get('grass'), 0, 'Two basic roof panels must consume eight Grass total');
assert.equal(thatch.getTarget(playerPosition), null, 'Fully thatched basic roof must have no open thatch target');
const secondVisualNames = new Set();
thatch.thatched.get(secondTarget.id)?.root.traverse(object => secondVisualNames.add(object.name));
assert.equal(
  secondVisualNames.has('thatch-ridge-cap'),
  false,
  'The opposite roof side must not duplicate the shared ridge cap'
);

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

const groundFloorRoot = new THREE.Group();
const groundFloorMesh = new THREE.Mesh(
  new THREE.BoxGeometry(PHYSICAL_LOG.length, 0.08, PHYSICAL_LOG.length),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
groundFloorRoot.position.set(0, 0.04, 0);
groundFloorRoot.add(groundFloorMesh);
physicalLogs.builtLogs.push({
  id: 32,
  mode: 'floor',
  active: true,
  x: 0,
  z: 0,
  baseY: 0,
  centerY: 0.04,
  topY: 0.08,
  storey: 0,
  root: groundFloorRoot
});

const upperFloorY = region.frameTopY + PHYSICAL_LOG.radius;
const upperFloorRoot = new THREE.Group();
const upperFloorMesh = new THREE.Mesh(
  new THREE.BoxGeometry(PHYSICAL_LOG.length, 0.08, PHYSICAL_LOG.length),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
upperFloorRoot.position.set(0, upperFloorY, 0);
upperFloorRoot.add(upperFloorMesh);
physicalLogs.builtLogs.push({
  id: 33,
  mode: 'floor',
  active: true,
  x: 0,
  z: 0,
  baseY: upperFloorY - 0.04,
  centerY: upperFloorY,
  topY: upperFloorY + 0.04,
  storey: 1,
  root: upperFloorRoot
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
assert.equal(
  Math.abs(upperFloorMesh.material.opacity - STRUCTURE_INTERIOR_FADE_OPACITY) < 0.000001,
  true,
  'An upper floor above the Ranger must fade while the Ranger occupies the lower storey'
);
assert.equal(
  groundFloorMesh.material.opacity,
  1,
  'The floor supporting the Ranger must remain solid while the upper floor fades'
);

const outsidePlayer = new THREE.Vector3(20, 0, 20);
const exteriorBlockerRoot = new THREE.Group();
const exteriorBlockerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 3, 0.4),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
exteriorBlockerRoot.position.set(20, 1.4, 23);
exteriorBlockerRoot.add(exteriorBlockerMesh);
physicalLogs.builtLogs.push({
  id: 34,
  mode: 'wall',
  active: true,
  x: 20,
  z: 23,
  baseY: -0.1,
  centerY: 1.4,
  topY: 2.9,
  root: exteriorBlockerRoot
});

const exteriorSideRoot = new THREE.Group();
const exteriorSideMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 3, 0.4),
  new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
);
exteriorSideRoot.position.set(23, 1.4, 23);
exteriorSideRoot.add(exteriorSideMesh);
physicalLogs.builtLogs.push({
  id: 35,
  mode: 'wall',
  active: true,
  x: 23,
  z: 23,
  baseY: -0.1,
  centerY: 1.4,
  topY: 2.9,
  root: exteriorSideRoot
});
physicalLogs.structureRevision += 1;

camera.position.set(20, 3, 26);
camera.lookAt(20, 1, 20);
camera.updateMatrixWorld(true);
occlusion.update(outsidePlayer, camera);
assert.equal(nearMesh.material.opacity, 1, 'Leaving the structure must restore interior camera-side materials to solid');
assert.equal(upperFloorMesh.material.opacity, 1, 'Leaving the lower storey must restore its upper floor to solid');
assert.equal(
  Math.abs(exteriorBlockerMesh.material.opacity - STRUCTURE_INTERIOR_FADE_OPACITY) < 0.000001,
  true,
  'A building part between the camera and an outside Ranger must fade even when the Ranger is not indoors'
);
assert.equal(
  exteriorSideMesh.material.opacity,
  1,
  'Nearby building parts that do not cover the outside Ranger must remain solid'
);

camera.position.set(40, 3, 46);
camera.lookAt(40, 1, 40);
camera.updateMatrixWorld(true);
occlusion.update(new THREE.Vector3(40, 0, 40), camera);
assert.equal(exteriorBlockerMesh.material.opacity, 1, 'Moving away from an exterior blocker must restore its original material');

const removedRoof = physicalLogs.builtLogs.find(entry => entry.mode === 'roof');
removedRoof.active = false;
physicalLogs.structureRevision += 1;
thatch.sync();
assert.equal(thatch.getVisualEntries().length, 0, 'Removing required roof framing must remove dependent thatch panels');
assert.equal(inventory.get('grass'), 8, 'Invalidated thatch panels must refund their four-Grass costs');

console.log('Thatch roof cost, storey-aware upper-floor fading, exterior structure occlusion and material restoration verified');
