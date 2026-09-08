import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const roofCoverMaterial = new THREE.MeshStandardMaterial({
  color: 0x75633a,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide
});

const clampRise = span => Math.min(
  PHYSICAL_LOG.roofMaxRise,
  Math.max(PHYSICAL_LOG.roofMinRise, span * 0.5 * Math.tan(PHYSICAL_LOG.roofPitch))
);

const addScaledLog = (group, name, center, direction, length) => {
  const root = createPhysicalLogVisual(name);
  root.scale.x = length / PHYSICAL_LOG.length;
  root.position.copy(center);
  const normal = direction.clone().normalize();
  root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
  group.add(root);
  return root;
};

const buildAlongX = (group, length, span, overhang) => {
  const rise = clampRise(span);
  const halfSpan = span * 0.5;
  const slopeLength = Math.hypot(halfSpan, rise);
  const pitch = Math.atan2(rise, halfSpan);
  const coverLength = length + overhang * 2;
  const coverSlope = slopeLength + overhang * 1.3;

  for (const side of [-1, 1]) {
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(coverLength, 0.11, coverSlope),
      roofCoverMaterial
    );
    cover.name = side < 0 ? 'SemanticRoofSlopeNorth' : 'SemanticRoofSlopeSouth';
    cover.position.set(0, rise * 0.5, side * halfSpan * 0.5);
    cover.rotation.x = side * pitch;
    cover.castShadow = true;
    cover.receiveShadow = true;
    group.add(cover);
  }

  const ridgeLength = length + overhang * 1.25;
  addScaledLog(
    group,
    'SemanticRoofRidge',
    new THREE.Vector3(0, rise + PHYSICAL_LOG.radius * 0.34, 0),
    new THREE.Vector3(1, 0, 0),
    ridgeLength
  );

  const rafterInset = Math.max(PHYSICAL_LOG.radius, overhang * 0.45);
  const rafterX = Math.max(0, length * 0.5 - rafterInset);
  for (const x of [-rafterX, rafterX]) {
    for (const side of [-1, 1]) {
      const start = new THREE.Vector3(x, PHYSICAL_LOG.radius * 0.2, side * (halfSpan + overhang * 0.45));
      const end = new THREE.Vector3(x, rise + PHYSICAL_LOG.radius * 0.2, 0);
      const direction = end.clone().sub(start);
      addScaledLog(
        group,
        `SemanticRoofRafter${x < 0 ? 'A' : 'B'}${side < 0 ? 'N' : 'S'}`,
        start.clone().add(end).multiplyScalar(0.5),
        direction,
        direction.length()
      );
    }
  }

  return rise;
};

export function semanticRoofRise({ width, depth, ridgeAxis = 'x' }) {
  const span = ridgeAxis === 'z' ? width : depth;
  return clampRise(span);
}

export function createSemanticRoofZoneVisual(name = 'SemanticRoof', {
  width,
  depth,
  ridgeAxis = 'x',
  overhang = PHYSICAL_LOG.radius * 1.2
} = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    throw new Error('Semantic roof geometry requires positive width and depth');
  }

  const root = new THREE.Group();
  root.name = name;
  root.userData.semanticRoof = true;
  root.userData.ridgeAxis = ridgeAxis;

  if (ridgeAxis === 'z') {
    const rotated = new THREE.Group();
    rotated.rotation.y = Math.PI / 2;
    root.add(rotated);
    buildAlongX(rotated, depth, width, overhang);
  } else {
    buildAlongX(root, width, depth, overhang);
  }

  return root;
}
