import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  isSnappedRoofMember,
  roofMemberCandidates
} from '../src/world/RoofMemberRules.js';
import { StructureRoofQuery } from '../src/world/StructureRoofQuery.js';
import {
  STRUCTURE_INTERIOR_FADE_OPACITY,
  STRUCTURE_INTERIOR_ROOF_OPACITY,
  StructureInteriorOcclusionSystem
} from '../src/world/StructureInteriorOcclusionSystem.js';

const half = PHYSICAL_LOG.halfLength;
const visualRoot = (name, x, y, z) => {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(x, y, z);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshBasicMaterial({ opacity: 1, transparent: false })
  );
  root.add(mesh);
  return { root, mesh };
};

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
const [region] = roofQuery.getRegions({ x: 0, z: 0 });
assert.ok(region, 'Closed FRAME + RAW support must resolve a roof region');

const memberVisuals = [];
for (const [index, member] of roofMemberCandidates(region).entries()) {
  const { root, mesh } = visualRoot(`roof-member-${index}`, member.x, member.y, member.z);
  memberVisuals.push(mesh);
  physicalLogs.builtLogs.push({
    id: 10 + index,
    mode: member.roofRole === 'rafter' ? 'angle' : 'raw',
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
    roofRole: member.roofRole,
    snapKind: member.snapKind,
    root
  });
}
physicalLogs.structureRevision += 1;

const loose = visualRoot('ordinary-angle', 0, region.eaveY + 0.4, 0);
const looseAngle = {
  id: 30,
  mode: 'angle',
  active: true,
  x: 0,
  z: 0,
  yaw: 0,
  baseY: region.eaveY,
  centerY: region.eaveY + 0.4,
  topY: region.eaveY + 0.8,
  root: loose.root
};
physicalLogs.builtLogs.push(looseAngle);
physicalLogs.structureRevision += 1;

assert.equal(isSnappedRoofMember(physicalLogs.builtLogs[10]), true, 'Roof snap metadata must identify a structural roof member');
assert.equal(isSnappedRoofMember(looseAngle), false, 'Ordinary ANGLE construction must not be mistaken for snapped roof framing');

const playerInside = new THREE.Vector3(0, 0, 0);
const occlusion = new StructureInteriorOcclusionSystem({ physicalLogs, roofQuery });
assert.ok(
  occlusion.updateFirstPerson(playerInside),
  'A completed roof must recognize the Ranger as indoors in first person'
);
for (const mesh of memberVisuals) {
  assert.equal(
    mesh.material.opacity,
    STRUCTURE_INTERIOR_ROOF_OPACITY,
    'Snapped roof rafters and ridge must be visually suppressed from the occupied interior'
  );
  assert.equal(mesh.material.depthWrite, false, 'Invisible interior roof framing must not write depth');
}
assert.equal(
  loose.mesh.material.opacity,
  1,
  'First-person roof cleanup must leave unrelated ANGLE construction unchanged'
);

occlusion.updateFirstPerson(new THREE.Vector3(20, 0, 20));
for (const mesh of memberVisuals) {
  assert.equal(mesh.material.opacity, 1, 'Leaving the building must restore snapped roof framing for exterior viewing');
  assert.equal(mesh.material.depthWrite, true, 'Restored roof framing must recover its original depth-write state');
}

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
camera.position.set(0, 3, 6);
camera.lookAt(0, 1, 0);
camera.updateMatrixWorld(true);
occlusion.update(playerInside, camera);
for (const mesh of memberVisuals) {
  assert.equal(
    mesh.material.opacity,
    STRUCTURE_INTERIOR_ROOF_OPACITY,
    'Third-person indoor shell fading must also fully suppress snapped roof framing'
  );
}
assert.equal(
  Math.abs(loose.mesh.material.opacity - STRUCTURE_INTERIOR_FADE_OPACITY) < 0.000001,
  true,
  'Non-roof construction in the connected shell must keep the established third-person fade behavior'
);

console.log('Roof-snap identity and polished interior roof-member visibility verified');
