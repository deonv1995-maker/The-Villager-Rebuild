import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const SEGMENT_RADIUS_SCALE = Object.freeze([1, 0.86, 0.72]);
const MIN_SOURCE_RADIUS = PHYSICAL_LOG.radius;
const MAX_SOURCE_RADIUS = 1.2;
const REFERENCE_TREE_RADIUS = 0.58;
const MIN_LENGTH_SCALE = 0.9;
const MAX_LENGTH_SCALE = 1.35;

export const FELLED_TREE_BARK_COLOR = 0x815a3d;

const barkMaterial = new THREE.MeshStandardMaterial({
  color: FELLED_TREE_BARK_COLOR,
  roughness: 0.98,
  metalness: 0,
  flatShading: true
});
const cutMaterial = new THREE.MeshStandardMaterial({
  color: 0xc09260,
  roughness: 0.94,
  metalness: 0,
  flatShading: true
});

// Unit-radius geometry is shared by every felled-tree pickup. Per-tree scale stays on
// the presentation meshes so chopping many trees does not allocate unique geometry.
const trunkGeometry = new THREE.CylinderGeometry(0.82, 1, PHYSICAL_LOG.length, 8, 1, false);
const cutGeometry = new THREE.CylinderGeometry(1, 1, 0.016, 8, 1, false);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function normalizeFelledTreeLogPresentation(value) {
  if (!value || value.kind !== 'felled-tree') return null;
  const sourceRadius = Number(value.sourceRadius);
  if (!Number.isFinite(sourceRadius) || sourceRadius <= 0) return null;
  const rawSegmentIndex = Number(value.segmentIndex);
  const segmentIndex = Number.isFinite(rawSegmentIndex)
    ? clamp(Math.floor(rawSegmentIndex), 0, SEGMENT_RADIUS_SCALE.length - 1)
    : 0;
  return {
    kind: 'felled-tree',
    sourceRadius: clamp(sourceRadius, MIN_SOURCE_RADIUS, MAX_SOURCE_RADIUS),
    segmentIndex
  };
}

export function attachFelledTreeLogGroundPresentation(root, presentation, groundParent) {
  const normalized = normalizeFelledTreeLogPresentation(presentation);
  if (!root || !normalized || !groundParent) return null;

  const segmentScale = SEGMENT_RADIUS_SCALE[normalized.segmentIndex];
  const radius = Math.max(PHYSICAL_LOG.radius, normalized.sourceRadius * segmentScale);
  const lengthScale = clamp(
    normalized.sourceRadius / REFERENCE_TREE_RADIUS,
    MIN_LENGTH_SCALE,
    MAX_LENGTH_SCALE
  );
  const displayLength = PHYSICAL_LOG.length * lengthScale;
  const upperRadius = radius * 0.82;

  const shell = new THREE.Group();
  shell.name = 'felled-tree-log-ground-presentation';
  shell.userData.harvestOnlyPresentation = true;
  // The physical pickup stays on the canonical PHYSICAL_LOG ground plane. Lift only
  // the larger harvest shell so its source-tree-sized trunk does not sink into terrain.
  shell.position.y = radius - PHYSICAL_LOG.radius;

  const trunk = new THREE.Mesh(trunkGeometry, barkMaterial);
  trunk.name = 'felled-tree-log-bark';
  trunk.rotation.z = Math.PI / 2;
  trunk.scale.set(radius, lengthScale, radius);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  shell.add(trunk);

  const ends = [
    { x: -(displayLength * 0.5 + 0.008), radius },
    { x: displayLength * 0.5 + 0.008, radius: upperRadius }
  ];
  for (const end of ends) {
    const cut = new THREE.Mesh(cutGeometry, cutMaterial);
    cut.name = 'felled-tree-log-cut';
    cut.rotation.z = Math.PI / 2;
    cut.position.x = end.x;
    cut.scale.set(end.radius, 1, end.radius);
    cut.castShadow = true;
    cut.receiveShadow = true;
    shell.add(cut);
  }

  const canonicalRoll = root.userData?.rollGroup ?? null;
  root.userData.felledTreeGroundPresentation = shell;
  root.userData.felledTreePresentation = normalized;
  root.add(shell);

  const syncForParent = () => {
    const showHarvestPresentation = root.parent === groundParent;
    shell.visible = showHarvestPresentation;
    if (canonicalRoll) canonicalRoll.visible = !showHarvestPresentation;
  };
  const clearForDetach = () => {
    shell.visible = false;
    if (canonicalRoll) canonicalRoll.visible = true;
  };

  // The shell exists only while the logical Log is a world gatherable. Reparenting
  // the same item into Ranger carry or construction restores the canonical Log visual,
  // so harvest presentation can never change structural dimensions or placement.
  root.addEventListener('added', syncForParent);
  root.addEventListener('removed', clearForDetach);
  syncForParent();

  return shell;
}
