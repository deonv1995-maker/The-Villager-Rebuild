import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const barkMaterial = new THREE.MeshStandardMaterial({
  color: 0x6f472c,
  roughness: 0.96,
  metalness: 0,
  flatShading: true
});
const cutMaterial = new THREE.MeshStandardMaterial({
  color: 0xb98555,
  roughness: 0.92,
  metalness: 0
});

const logGeometry = new THREE.CylinderGeometry(
  0.22,
  PHYSICAL_LOG.radius,
  PHYSICAL_LOG.length,
  8,
  1,
  false
);
const cutGeometry = new THREE.CylinderGeometry(0.225, 0.225, 0.012, 8, 1, false);

const halfShape = new THREE.Shape();
const halfRadius = 0.26;
halfShape.moveTo(-halfRadius, 0);
halfShape.lineTo(halfRadius, 0);
for (let index = 0; index <= 10; index += 1) {
  const angle = -index / 10 * Math.PI;
  halfShape.lineTo(Math.cos(angle) * halfRadius, Math.sin(angle) * halfRadius);
}
halfShape.closePath();
const halfLogGeometry = new THREE.ExtrudeGeometry(halfShape, {
  depth: PHYSICAL_LOG.length,
  bevelEnabled: false,
  steps: 1
});
halfLogGeometry.translate(0, 0, -PHYSICAL_LOG.halfLength);
halfLogGeometry.rotateY(Math.PI / 2);
halfLogGeometry.computeVertexNormals();
const splitFaceGeometry = new THREE.BoxGeometry(PHYSICAL_LOG.length, 0.018, 0.52);

export function createPhysicalLogVisual(name = 'RawLog') {
  const group = new THREE.Group();
  group.name = name;

  const rollGroup = new THREE.Group();
  rollGroup.name = 'LogRollVisual';
  group.userData.rollGroup = rollGroup;
  group.add(rollGroup);

  const trunk = new THREE.Mesh(logGeometry, barkMaterial);
  trunk.rotation.z = Math.PI / 2;
  trunk.receiveShadow = true;
  rollGroup.add(trunk);

  const capX = PHYSICAL_LOG.halfLength + 0.006;
  for (const x of [-capX, capX]) {
    const cut = new THREE.Mesh(cutGeometry, cutMaterial);
    cut.rotation.z = Math.PI / 2;
    cut.position.x = x;
    cut.receiveShadow = true;
    rollGroup.add(cut);
  }
  return group;
}

export function createSplitHalfLogVisual(name = 'SplitHalfLog') {
  const group = new THREE.Group();
  group.name = name;
  const half = new THREE.Mesh(halfLogGeometry, barkMaterial);
  half.receiveShadow = true;
  group.add(half);

  const face = new THREE.Mesh(splitFaceGeometry, cutMaterial);
  face.position.y = 0.008;
  face.receiveShadow = true;
  group.add(face);
  return group;
}

export function createConstructionLogVisual(mode) {
  // Orientation belongs to PhysicalLogSystem's resolved placement transform.
  // Keeping the source visual neutral prevents previews and committed pieces from
  // receiving different/doubled rotations.
  if (mode === 'raw') return createPhysicalLogVisual('StructuralRawLog');
  if (mode === 'frame') return createPhysicalLogVisual('UprightLogFrame');
  if (mode === 'angle') return createPhysicalLogVisual('AngledLog');
  if (mode === 'roof') return createPhysicalLogVisual('RoofLog');
  if (mode === 'floor') {
    const group = new THREE.Group();
    group.name = 'SplitLogFloor';
    for (const offset of [-PHYSICAL_LOG.floorSplitOffset, PHYSICAL_LOG.floorSplitOffset]) {
      const half = createSplitHalfLogVisual();
      half.position.z = offset;
      group.add(half);
    }
    return group;
  }
  if (mode === 'wall') {
    const group = new THREE.Group();
    group.name = 'SplitLogWallSection';
    for (const y of [0, 0.5]) {
      const half = createSplitHalfLogVisual();
      half.rotation.x = Math.PI / 2;
      half.position.y = y;
      group.add(half);
    }
    return group;
  }
  throw new Error(`Unknown log construction visual mode: ${mode}`);
}

export function tintConstructionPreview(root, material) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 8;
  });
}
