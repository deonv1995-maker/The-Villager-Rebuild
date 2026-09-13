import * as THREE from 'three';

const SCANNER_COLOR = 0x67d7f0;
const BEAM_TIP_Y = 0;
const BEAM_HEIGHT = 1;
const BEAM_RADIUS = 1;
const GROUND_Y = -BEAM_HEIGHT;
const MIN_VISUAL_LENGTH = 0.35;
const MIN_VISUAL_RADIUS = 0.28;
const MAX_VISUAL_RADIUS = 1;
const FALLBACK_LENS_POSITION = Object.freeze({ x: -0.36, y: 0.33, z: 0.415 });
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const lensWorld = new THREE.Vector3();
const targetWorld = new THREE.Vector3();
const lensLocal = new THREE.Vector3();
const targetLocal = new THREE.Vector3();
const scanDirection = new THREE.Vector3();

const makeAdditiveMaterial = (opacity, { lines = false } = {}) => {
  const options = {
    color: SCANNER_COLOR,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false
  };
  return lines ? new THREE.LineBasicMaterial(options) : new THREE.MeshBasicMaterial({
    ...options,
    side: THREE.DoubleSide
  });
};

const createRayGeometry = () => {
  const points = [];
  const rayCount = 8;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = index * (Math.PI * 2 / rayCount);
    points.push(
      0, BEAM_TIP_Y, 0,
      Math.cos(angle) * BEAM_RADIUS, GROUND_Y, Math.sin(angle) * BEAM_RADIUS
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
};

const createSweepGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    BEAM_RADIUS * 0.98, 0, 0
  ], 3));
  return geometry;
};

const isFiniteTarget = target => (
  target
  && Number.isFinite(target.x)
  && Number.isFinite(target.y)
  && Number.isFinite(target.z)
);

const resolveBeamTransform = (root, target, widthPulse = 1) => {
  const beamPivot = root.userData.sproutScannerBeamPivot;
  if (!beamPivot) return;

  root.updateWorldMatrix?.(true, true);
  const scannerLens = root.userData.scannerLens;
  if (scannerLens?.getWorldPosition) {
    scannerLens.getWorldPosition(lensWorld);
    lensLocal.copy(lensWorld);
    root.worldToLocal(lensLocal);
  } else {
    lensLocal.set(FALLBACK_LENS_POSITION.x, FALLBACK_LENS_POSITION.y, FALLBACK_LENS_POSITION.z);
  }

  if (isFiniteTarget(target)) {
    targetWorld.set(target.x, target.y + 0.08, target.z);
    targetLocal.copy(targetWorld);
    root.worldToLocal(targetLocal);
  } else {
    targetLocal.set(lensLocal.x + 0.16, -1.42, lensLocal.z + 0.58);
  }

  scanDirection.subVectors(targetLocal, lensLocal);
  const length = Math.max(MIN_VISUAL_LENGTH, scanDirection.length());
  if (scanDirection.lengthSq() < 0.0001) scanDirection.copy(DOWN_AXIS);
  else scanDirection.normalize();

  const radius = THREE.MathUtils.clamp(length * 0.14, MIN_VISUAL_RADIUS, MAX_VISUAL_RADIUS) * widthPulse;
  beamPivot.position.copy(lensLocal);
  beamPivot.quaternion.setFromUnitVectors(DOWN_AXIS, scanDirection);
  beamPivot.scale.set(radius, length, radius);
};

export function ensureSproutScannerVisual(root) {
  if (!root?.userData?.sproutProductionVisual) return null;
  if (root.userData.sproutScannerVisual) return root.userData.sproutScannerVisual;

  const scannerVisual = new THREE.Group();
  scannerVisual.name = 'sprout-laser-scanner-visual';
  scannerVisual.visible = false;
  scannerVisual.renderOrder = 8;

  const beamPivot = new THREE.Group();
  beamPivot.name = 'sprout-laser-scan-beam-pivot';
  scannerVisual.add(beamPivot);

  const beamMaterial = makeAdditiveMaterial(0.08);
  const gridMaterial = makeAdditiveMaterial(0.36, { lines: true });
  const footprintMaterial = makeAdditiveMaterial(0.62);
  const sweepMaterial = makeAdditiveMaterial(0.72, { lines: true });

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(BEAM_RADIUS, BEAM_HEIGHT, 24, 1, true),
    beamMaterial
  );
  beam.name = 'sprout-laser-scan-cone';
  beam.position.y = -BEAM_HEIGHT * 0.5;
  beam.castShadow = false;
  beam.receiveShadow = false;
  beam.renderOrder = 8;
  beamPivot.add(beam);

  const grid = new THREE.Group();
  grid.name = 'sprout-laser-scan-grid';
  const rays = new THREE.LineSegments(createRayGeometry(), gridMaterial);
  rays.name = 'sprout-laser-scan-rays';
  rays.renderOrder = 9;
  grid.add(rays);

  for (const fraction of [0.26, 0.48, 0.7, 0.9]) {
    const radius = BEAM_RADIUS * fraction;
    const y = -BEAM_HEIGHT * fraction;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.008, 4, 28),
      footprintMaterial
    );
    ring.name = `sprout-laser-scan-contour-${Math.round(fraction * 100)}`;
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    ring.receiveShadow = false;
    ring.renderOrder = 9;
    grid.add(ring);
  }
  beamPivot.add(grid);

  const footprint = new THREE.Group();
  footprint.name = 'sprout-laser-scan-footprint';
  footprint.position.y = GROUND_Y;
  footprint.renderOrder = 10;

  const footprintRing = new THREE.Mesh(
    new THREE.TorusGeometry(BEAM_RADIUS * 1.01, 0.018, 5, 36),
    footprintMaterial
  );
  footprintRing.name = 'sprout-laser-scan-ground-ring';
  footprintRing.rotation.x = Math.PI / 2;
  footprintRing.castShadow = false;
  footprintRing.receiveShadow = false;
  footprintRing.renderOrder = 10;
  footprint.add(footprintRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(BEAM_RADIUS * 0.72, 0.007, 4, 30),
    footprintMaterial
  );
  innerRing.name = 'sprout-laser-scan-inner-ground-ring';
  innerRing.rotation.x = Math.PI / 2;
  innerRing.castShadow = false;
  innerRing.receiveShadow = false;
  innerRing.renderOrder = 10;
  footprint.add(innerRing);

  const sweep = new THREE.Line(createSweepGeometry(), sweepMaterial);
  sweep.name = 'sprout-laser-scan-sweep';
  sweep.position.y = 0.006;
  sweep.renderOrder = 11;
  footprint.add(sweep);
  beamPivot.add(footprint);

  root.add(scannerVisual);
  root.userData.sproutScannerVisual = scannerVisual;
  root.userData.sproutScannerBeamPivot = beamPivot;
  root.userData.sproutScannerBeam = beam;
  root.userData.sproutScannerGrid = grid;
  root.userData.sproutScannerFootprint = footprint;
  root.userData.sproutScannerFootprintRing = footprintRing;
  root.userData.sproutScannerInnerRing = innerRing;
  root.userData.sproutScannerSweep = sweep;
  root.userData.sproutScannerBeamMaterial = beamMaterial;
  root.userData.sproutScannerGridMaterial = gridMaterial;
  root.userData.sproutScannerFootprintMaterial = footprintMaterial;
  root.userData.sproutScannerSweepMaterial = sweepMaterial;

  return scannerVisual;
}

export function updateSproutScannerVisual(root, elapsed, {
  powered = true,
  scanning = false,
  target = null
} = {}) {
  const scannerVisual = ensureSproutScannerVisual(root);
  if (!scannerVisual) return;

  const active = Boolean(powered && scanning);
  scannerVisual.visible = active;
  if (!active) return;

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 9.2);
  const slowerPulse = 0.5 + 0.5 * Math.sin(elapsed * 3.4 + 0.7);
  const beamMaterial = root.userData.sproutScannerBeamMaterial;
  const gridMaterial = root.userData.sproutScannerGridMaterial;
  const footprintMaterial = root.userData.sproutScannerFootprintMaterial;
  const sweepMaterial = root.userData.sproutScannerSweepMaterial;

  if (beamMaterial) beamMaterial.opacity = 0.065 + pulse * 0.045;
  if (gridMaterial) gridMaterial.opacity = 0.24 + pulse * 0.22;
  if (footprintMaterial) footprintMaterial.opacity = 0.48 + pulse * 0.26;
  if (sweepMaterial) sweepMaterial.opacity = 0.48 + slowerPulse * 0.34;

  const widthPulse = 0.985 + slowerPulse * 0.03;
  resolveBeamTransform(root, target, widthPulse);

  const grid = root.userData.sproutScannerGrid;
  if (grid) grid.rotation.y = elapsed * 0.38;

  const footprint = root.userData.sproutScannerFootprint;
  if (footprint) footprint.rotation.y = -elapsed * 0.16;

  const footprintRing = root.userData.sproutScannerFootprintRing;
  if (footprintRing) {
    const ringPulse = 0.97 + pulse * 0.045;
    footprintRing.scale.set(ringPulse, ringPulse, ringPulse);
  }

  const innerRing = root.userData.sproutScannerInnerRing;
  if (innerRing) {
    const innerPulse = 0.985 + slowerPulse * 0.025;
    innerRing.scale.set(innerPulse, innerPulse, innerPulse);
  }

  const sweep = root.userData.sproutScannerSweep;
  if (sweep) sweep.rotation.y = elapsed * 3.15;
}
