import * as THREE from 'three';

const TREE_LASER_COLOR = 0xff2b22;
const TREE_LASER_TARGET_LIFT = 0.82;
const TREE_LASER_RADIUS = 0.018;
const TREE_LASER_MIN_LENGTH = 0.2;
const FALLBACK_LENS_POSITION = Object.freeze({ x: -0.36, y: 0.33, z: 0.415 });
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const lensWorld = new THREE.Vector3();
const lensLocal = new THREE.Vector3();
const targetWorld = new THREE.Vector3();
const targetLocal = new THREE.Vector3();
const laserDirection = new THREE.Vector3();

const isFiniteTarget = target => (
  target
  && Number.isFinite(target.x)
  && Number.isFinite(target.y)
  && Number.isFinite(target.z)
);

const makeLaserMaterial = opacity => new THREE.MeshBasicMaterial({
  color: TREE_LASER_COLOR,
  transparent: true,
  opacity,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  toneMapped: false
});

const resolveLaserTransform = (root, target) => {
  const beamPivot = root.userData.sproutTreeLaserBeamPivot;
  const impact = root.userData.sproutTreeLaserImpact;
  if (!beamPivot || !impact || !isFiniteTarget(target)) return false;

  root.updateWorldMatrix?.(true, true);
  const scannerLens = root.userData.scannerLens;
  if (scannerLens?.getWorldPosition) {
    scannerLens.getWorldPosition(lensWorld);
    lensLocal.copy(lensWorld);
    root.worldToLocal(lensLocal);
  } else {
    lensLocal.set(FALLBACK_LENS_POSITION.x, FALLBACK_LENS_POSITION.y, FALLBACK_LENS_POSITION.z);
  }

  targetWorld.set(target.x, target.y + TREE_LASER_TARGET_LIFT, target.z);
  targetLocal.copy(targetWorld);
  root.worldToLocal(targetLocal);

  laserDirection.subVectors(targetLocal, lensLocal);
  const length = Math.max(TREE_LASER_MIN_LENGTH, laserDirection.length());
  if (laserDirection.lengthSq() < 0.0001) laserDirection.copy(DOWN_AXIS);
  else laserDirection.normalize();

  beamPivot.position.copy(lensLocal);
  beamPivot.quaternion.setFromUnitVectors(DOWN_AXIS, laserDirection);
  beamPivot.scale.set(1, length, 1);
  impact.position.copy(targetLocal);
  return true;
};

export function ensureSproutTreeLaserVisual(root) {
  if (!root?.userData?.sproutProductionVisual) return null;
  if (root.userData.sproutTreeLaserVisual) return root.userData.sproutTreeLaserVisual;

  const laserVisual = new THREE.Group();
  laserVisual.name = 'sprout-tree-cut-laser-visual';
  laserVisual.visible = false;
  laserVisual.renderOrder = 14;

  const beamPivot = new THREE.Group();
  beamPivot.name = 'sprout-tree-cut-laser-pivot';
  laserVisual.add(beamPivot);

  const beamMaterial = makeLaserMaterial(0.9);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(TREE_LASER_RADIUS, TREE_LASER_RADIUS, 1, 8, 1, true),
    beamMaterial
  );
  beam.name = 'sprout-tree-cut-laser-beam';
  beam.position.y = -0.5;
  beam.castShadow = false;
  beam.receiveShadow = false;
  beam.renderOrder = 14;
  beamPivot.add(beam);

  const impactMaterial = makeLaserMaterial(0.82);
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 8, 6),
    impactMaterial
  );
  impact.name = 'sprout-tree-cut-impact-glow';
  impact.castShadow = false;
  impact.receiveShadow = false;
  impact.renderOrder = 15;
  laserVisual.add(impact);

  root.add(laserVisual);
  root.userData.sproutTreeLaserVisual = laserVisual;
  root.userData.sproutTreeLaserBeamPivot = beamPivot;
  root.userData.sproutTreeLaserBeam = beam;
  root.userData.sproutTreeLaserImpact = impact;
  root.userData.sproutTreeLaserBeamMaterial = beamMaterial;
  root.userData.sproutTreeLaserImpactMaterial = impactMaterial;

  return laserVisual;
}

export function updateSproutTreeLaserVisual(root, elapsed, {
  powered = true,
  cutting = false,
  target = null
} = {}) {
  const laserVisual = ensureSproutTreeLaserVisual(root);
  if (!laserVisual) return;

  const active = Boolean(powered && cutting && isFiniteTarget(target));
  laserVisual.visible = active;
  if (!active) return;
  if (!resolveLaserTransform(root, target)) {
    laserVisual.visible = false;
    return;
  }

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 22);
  const slowerPulse = 0.5 + 0.5 * Math.sin(elapsed * 11.5 + 0.8);
  const beamMaterial = root.userData.sproutTreeLaserBeamMaterial;
  const impactMaterial = root.userData.sproutTreeLaserImpactMaterial;
  const beam = root.userData.sproutTreeLaserBeam;
  const impact = root.userData.sproutTreeLaserImpact;

  if (beamMaterial) beamMaterial.opacity = 0.72 + pulse * 0.26;
  if (impactMaterial) impactMaterial.opacity = 0.56 + slowerPulse * 0.38;
  if (beam) {
    const width = 0.84 + pulse * 0.28;
    beam.scale.set(width, 1, width);
  }
  if (impact) {
    const scale = 0.82 + slowerPulse * 0.42;
    impact.scale.setScalar(scale);
  }
}
