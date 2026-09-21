import * as THREE from 'three';

const SCANNER_COLOR = 0x67d7f0;
const BEAM_TIP_Y = 0;
const BEAM_HEIGHT = 1;
const BEAM_RADIUS = 1;
const GROUND_Y = -BEAM_HEIGHT;
const MIN_VISUAL_LENGTH = 0.35;
const MIN_VISUAL_RADIUS = 0.28;
const MAX_VISUAL_RADIUS = 1;
const TERRAIN_GRID_DIVISIONS = 6;
const TERRAIN_GRID_HALF_EXTENT = 1.18;
const TERRAIN_GRID_LIFT = 0.028;
const TARGET_RING_SEGMENTS = 18;
const TARGET_GROUND_RADIUS = 0.28;
const TARGET_ITEM_RADIUS = 0.2;
const FALLBACK_LENS_POSITION = Object.freeze({ x: -0.36, y: 0.33, z: 0.415 });
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const lensWorld = new THREE.Vector3();
const targetWorld = new THREE.Vector3();
const lensLocal = new THREE.Vector3();
const targetLocal = new THREE.Vector3();
const scanDirection = new THREE.Vector3();
const terrainPointWorld = new THREE.Vector3();
const terrainPointLocal = new THREE.Vector3();

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

const createTerrainGridGeometry = () => {
  const segmentCount = (TERRAIN_GRID_DIVISIONS + 1) * TERRAIN_GRID_DIVISIONS * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  return geometry;
};

const createTargetMarkerGeometry = () => {
  const segmentCount = TARGET_RING_SEGMENTS * 2 + 5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
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

const writeLocalPoint = (root, array, offset, x, y, z) => {
  terrainPointWorld.set(x, y, z);
  terrainPointLocal.copy(terrainPointWorld);
  root.worldToLocal(terrainPointLocal);
  array[offset] = terrainPointLocal.x;
  array[offset + 1] = terrainPointLocal.y;
  array[offset + 2] = terrainPointLocal.z;
};

const updateTerrainProjection = (root, target, terrainHeightAt) => {
  const terrainGrid = root.userData.sproutScannerTerrainGrid;
  const targetMarker = root.userData.sproutScannerTargetMarker;
  if (!terrainGrid || !targetMarker) return false;

  const active = isFiniteTarget(target) && typeof terrainHeightAt === 'function';
  terrainGrid.visible = active;
  targetMarker.visible = active;
  if (!active) return false;

  root.updateWorldMatrix?.(true, true);
  const gridPosition = terrainGrid.geometry.attributes.position;
  const gridArray = gridPosition.array;
  const step = (TERRAIN_GRID_HALF_EXTENT * 2) / TERRAIN_GRID_DIVISIONS;
  let offset = 0;

  const appendSegment = (ax, az, bx, bz) => {
    const ay = terrainHeightAt(ax, az) + TERRAIN_GRID_LIFT;
    const by = terrainHeightAt(bx, bz) + TERRAIN_GRID_LIFT;
    writeLocalPoint(root, gridArray, offset, ax, ay, az);
    offset += 3;
    writeLocalPoint(root, gridArray, offset, bx, by, bz);
    offset += 3;
  };

  for (let line = 0; line <= TERRAIN_GRID_DIVISIONS; line += 1) {
    const axisOffset = -TERRAIN_GRID_HALF_EXTENT + line * step;
    for (let segment = 0; segment < TERRAIN_GRID_DIVISIONS; segment += 1) {
      const alongA = -TERRAIN_GRID_HALF_EXTENT + segment * step;
      const alongB = alongA + step;
      appendSegment(
        target.x + axisOffset,
        target.z + alongA,
        target.x + axisOffset,
        target.z + alongB
      );
      appendSegment(
        target.x + alongA,
        target.z + axisOffset,
        target.x + alongB,
        target.z + axisOffset
      );
    }
  }
  gridPosition.needsUpdate = true;
  terrainGrid.geometry.computeBoundingSphere?.();

  const markerPosition = targetMarker.geometry.attributes.position;
  const markerArray = markerPosition.array;
  const groundY = terrainHeightAt(target.x, target.z) + TERRAIN_GRID_LIFT * 1.35;
  const itemY = Math.max(groundY + 0.12, target.y + 0.08);
  offset = 0;

  const appendMarkerSegment = (ax, ay, az, bx, by, bz) => {
    writeLocalPoint(root, markerArray, offset, ax, ay, az);
    offset += 3;
    writeLocalPoint(root, markerArray, offset, bx, by, bz);
    offset += 3;
  };

  for (let index = 0; index < TARGET_RING_SEGMENTS; index += 1) {
    const angleA = index * (Math.PI * 2 / TARGET_RING_SEGMENTS);
    const angleB = (index + 1) * (Math.PI * 2 / TARGET_RING_SEGMENTS);
    appendMarkerSegment(
      target.x + Math.cos(angleA) * TARGET_GROUND_RADIUS,
      groundY,
      target.z + Math.sin(angleA) * TARGET_GROUND_RADIUS,
      target.x + Math.cos(angleB) * TARGET_GROUND_RADIUS,
      groundY,
      target.z + Math.sin(angleB) * TARGET_GROUND_RADIUS
    );
    appendMarkerSegment(
      target.x + Math.cos(angleA) * TARGET_ITEM_RADIUS,
      itemY,
      target.z + Math.sin(angleA) * TARGET_ITEM_RADIUS,
      target.x + Math.cos(angleB) * TARGET_ITEM_RADIUS,
      itemY,
      target.z + Math.sin(angleB) * TARGET_ITEM_RADIUS
    );
  }

  appendMarkerSegment(target.x - 0.42, groundY, target.z, target.x + 0.42, groundY, target.z);
  appendMarkerSegment(target.x, groundY, target.z - 0.42, target.x, groundY, target.z + 0.42);
  appendMarkerSegment(target.x, groundY, target.z, target.x, itemY, target.z);
  appendMarkerSegment(target.x - 0.13, itemY, target.z, target.x + 0.13, itemY, target.z);
  appendMarkerSegment(target.x, itemY, target.z - 0.13, target.x, itemY, target.z + 0.13);

  markerPosition.needsUpdate = true;
  targetMarker.geometry.computeBoundingSphere?.();
  return true;
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
  const terrainGridMaterial = makeAdditiveMaterial(0.52, { lines: true });
  const targetMarkerMaterial = makeAdditiveMaterial(0.88, { lines: true });

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

  const terrainGrid = new THREE.LineSegments(createTerrainGridGeometry(), terrainGridMaterial);
  terrainGrid.name = 'sprout-laser-terrain-grid';
  terrainGrid.visible = false;
  terrainGrid.frustumCulled = false;
  terrainGrid.renderOrder = 12;
  scannerVisual.add(terrainGrid);

  const targetMarker = new THREE.LineSegments(createTargetMarkerGeometry(), targetMarkerMaterial);
  targetMarker.name = 'sprout-laser-detected-item-marker';
  targetMarker.visible = false;
  targetMarker.frustumCulled = false;
  targetMarker.renderOrder = 13;
  scannerVisual.add(targetMarker);

  root.add(scannerVisual);
  root.userData.sproutScannerVisual = scannerVisual;
  root.userData.sproutScannerBeamPivot = beamPivot;
  root.userData.sproutScannerBeam = beam;
  root.userData.sproutScannerGrid = grid;
  root.userData.sproutScannerFootprint = footprint;
  root.userData.sproutScannerFootprintRing = footprintRing;
  root.userData.sproutScannerInnerRing = innerRing;
  root.userData.sproutScannerSweep = sweep;
  root.userData.sproutScannerTerrainGrid = terrainGrid;
  root.userData.sproutScannerTargetMarker = targetMarker;
  root.userData.sproutScannerBeamMaterial = beamMaterial;
  root.userData.sproutScannerGridMaterial = gridMaterial;
  root.userData.sproutScannerFootprintMaterial = footprintMaterial;
  root.userData.sproutScannerSweepMaterial = sweepMaterial;
  root.userData.sproutScannerTerrainGridMaterial = terrainGridMaterial;
  root.userData.sproutScannerTargetMarkerMaterial = targetMarkerMaterial;

  return scannerVisual;
}

export function updateSproutScannerVisual(root, elapsed, {
  powered = true,
  scanning = false,
  target = null,
  terrainHeightAt = null,
  signalStrength = 0
} = {}) {
  const scannerVisual = ensureSproutScannerVisual(root);
  if (!scannerVisual) return;

  const active = Boolean(powered && scanning);
  scannerVisual.visible = active;
  if (!active) return;

  const strength = THREE.MathUtils.clamp(Number(signalStrength) || 0, 0, 1);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * (9.2 + strength * 5.8));
  const slowerPulse = 0.5 + 0.5 * Math.sin(elapsed * (3.4 + strength * 2.4) + 0.7);
  const intensityGain = 1 + strength * 0.55;
  const beamMaterial = root.userData.sproutScannerBeamMaterial;
  const gridMaterial = root.userData.sproutScannerGridMaterial;
  const footprintMaterial = root.userData.sproutScannerFootprintMaterial;
  const sweepMaterial = root.userData.sproutScannerSweepMaterial;
  const terrainGridMaterial = root.userData.sproutScannerTerrainGridMaterial;
  const targetMarkerMaterial = root.userData.sproutScannerTargetMarkerMaterial;

  if (beamMaterial) beamMaterial.opacity = Math.min(0.2, (0.065 + pulse * 0.045) * intensityGain);
  if (gridMaterial) gridMaterial.opacity = Math.min(0.72, (0.24 + pulse * 0.22) * intensityGain);
  if (footprintMaterial) footprintMaterial.opacity = Math.min(0.95, (0.48 + pulse * 0.26) * intensityGain);
  if (sweepMaterial) sweepMaterial.opacity = Math.min(1, (0.48 + slowerPulse * 0.34) * intensityGain);
  if (terrainGridMaterial) terrainGridMaterial.opacity = 0.34 + pulse * 0.34;
  if (targetMarkerMaterial) targetMarkerMaterial.opacity = 0.68 + slowerPulse * 0.3;

  const widthPulse = 0.985 + slowerPulse * 0.03 + strength * 0.06;
  resolveBeamTransform(root, target, widthPulse);
  const terrainProjectionActive = updateTerrainProjection(root, target, terrainHeightAt);

  const grid = root.userData.sproutScannerGrid;
  if (grid) grid.rotation.y = elapsed * 0.38;

  const footprint = root.userData.sproutScannerFootprint;
  if (footprint) {
    footprint.visible = !terrainProjectionActive;
    footprint.rotation.y = -elapsed * 0.16;
  }

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
  if (sweep) sweep.rotation.y = elapsed * (3.15 + strength * 3.4);
}
