import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

const STRAW_ROW_AMOUNTS = Object.freeze([0.08, 0.27, 0.46, 0.65, 0.84]);
const STRAW_COLUMN_SPACING = 0.17;
const STRAW_BUNDLE_RADIUS = 0.046;
const STRAW_BUNDLE_LIFT = 0.135;
const STRAW_BUNDLE_COLORS = Object.freeze([
  0xe4bb62,
  0xd9aa50,
  0xe9c875,
  0xd3a04a
]);
const JUNCTION_STRAW_CLEARANCE = 0.055;

const reverseIndexedTriangleWinding = geometry => {
  const clone = geometry.clone();
  const index = clone.index;
  if (!index) return clone;
  const values = index.array;
  for (let offset = 0; offset + 2 < values.length; offset += 3) {
    const temporary = values[offset + 1];
    values[offset + 1] = values[offset + 2];
    values[offset + 2] = temporary;
  }
  index.needsUpdate = true;
  clone.computeVertexNormals();
  return clone;
};

/**
 * Gable infill is an exterior facade, not an interior ceiling surface. Semantic roof
 * slopes remain double-sided so the thatch underside still reads from inside, but gable
 * closure triangles are single-sided and explicitly wound toward the outside of the roof.
 */
export function makeSemanticRoofGablesExteriorOnly(wingRoot) {
  let count = 0;
  wingRoot.traverse(object => {
    if (!object.userData?.semanticRoofGable || !object.isMesh) return;
    const material = object.material?.clone?.() ?? object.material;
    if (material) {
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
      object.material = material;
    }
    if (object.name === 'SemanticRoofGableB') {
      object.geometry = reverseIndexedTriangleWinding(object.geometry);
    }
    object.userData.semanticRoofExteriorOnly = true;
    count += 1;
  });
  wingRoot.userData.semanticRoofExteriorOnlyGables = count;
  return count;
}

const finishedStrawMaterial = () => new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.98,
  metalness: 0,
  flatShading: true
});

const slopeNormal = (side, pitch) => new THREE.Vector3(
  0,
  Math.cos(pitch),
  side * Math.sin(pitch)
);

const slopePoint = (side, amount, eaveY, rise, halfSpan) => new THREE.Vector3(
  0,
  eaveY + rise * amount,
  side * halfSpan * (1 - amount)
);

const deterministicVariation = (row, column, salt) => (
  ((row * 31 + column * 17 + salt * 13) % 19) / 18
);

const bundleIntersectsJunction = (x, amount, side, wing, junctionProfiles) => {
  const sideLabel = side < 0 ? 'negative' : 'positive';
  return (junctionProfiles ?? []).some(profile => {
    if (profile.parentWingIndex !== wing.index || profile.parentSlopeSide !== sideLabel) return false;
    if (!(profile.apexAmount > 0) || amount >= profile.apexAmount) return false;
    const taper = 1 - amount / profile.apexAmount;
    const halfWidth = profile.cutoutHalfWidth * taper + JUNCTION_STRAW_CLEARANCE;
    return Math.abs(x - profile.cutoutCenter) <= halfWidth;
  });
};

const addStrawBundles = (buildGroup, wing, side, junctionProfiles) => {
  const length = wing.ridgeAxis === 'z' ? wing.depth : wing.width;
  const span = wing.ridgeAxis === 'z' ? wing.width : wing.depth;
  const rise = semanticRoofRise({
    width: wing.width,
    depth: wing.depth,
    ridgeAxis: wing.ridgeAxis
  });
  const halfSpan = span * 0.5;
  const slopeLength = Math.hypot(halfSpan, rise);
  const pitch = Math.atan2(rise, halfSpan);
  const eaveY = -semanticRoofWallSeatDrop();
  const surfaceNormal = slopeNormal(side, pitch);
  const downslope = new THREE.Vector3(
    0,
    -rise / slopeLength,
    side * halfSpan / slopeLength
  );
  const width = length + 0.3;
  const columns = Math.max(10, Math.ceil(width / STRAW_COLUMN_SPACING));
  const capacity = columns * STRAW_ROW_AMOUNTS.length;
  const geometry = new THREE.CylinderGeometry(
    STRAW_BUNDLE_RADIUS * 0.68,
    STRAW_BUNDLE_RADIUS,
    1,
    5,
    1,
    false
  );
  const bundle = new THREE.InstancedMesh(geometry, finishedStrawMaterial(), capacity);
  bundle.name = `SemanticRoofStrawBundles${side < 0 ? 'North' : 'South'}`;
  bundle.userData.semanticRoofStrawBundles = true;
  bundle.castShadow = true;
  bundle.receiveShadow = true;

  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, downslope);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let instanceIndex = 0;
  let skippedForJunction = 0;

  for (const [rowIndex, amount] of STRAW_ROW_AMOUNTS.entries()) {
    const rowPoint = slopePoint(side, amount, eaveY, rise, halfSpan);
    for (let column = 0; column < columns; column += 1) {
      const acrossVariation = deterministicVariation(rowIndex, column, side < 0 ? 3 : 11) - 0.5;
      const lengthVariation = deterministicVariation(rowIndex, column, side < 0 ? 7 : 17);
      const radialVariation = deterministicVariation(rowIndex, column, side < 0 ? 5 : 13);
      const x = -width * 0.5 + width * (column + 0.5) / columns + acrossVariation * 0.055;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) {
        skippedForJunction += 1;
        continue;
      }
      const bundleLength = 0.29 + lengthVariation * 0.12;
      position.copy(rowPoint);
      position.x = x;
      position
        .addScaledVector(surfaceNormal, STRAW_BUNDLE_LIFT + (column % 3) * 0.006)
        .addScaledVector(downslope, bundleLength * 0.08);
      const radialScale = 0.82 + radialVariation * 0.34;
      scale.set(radialScale, bundleLength, radialScale);
      matrix.compose(position, quaternion, scale);
      bundle.setMatrixAt(instanceIndex, matrix);
      color.setHex(STRAW_BUNDLE_COLORS[(rowIndex + column) % STRAW_BUNDLE_COLORS.length]);
      bundle.setColorAt(instanceIndex, color);
      instanceIndex += 1;
    }
  }

  bundle.count = instanceIndex;
  bundle.userData.semanticRoofStrawBundleCount = instanceIndex;
  bundle.userData.semanticRoofStrawBundlesSkippedForJunction = skippedForJunction;
  bundle.instanceMatrix.needsUpdate = true;
  if (bundle.instanceColor) bundle.instanceColor.needsUpdate = true;
  buildGroup.add(bundle);
  return { count: instanceIndex, skippedForJunction };
};

/**
 * Add a low-draw-call layer of tapered straw bundles over the existing structural thatch
 * courses. The courses remain the weather-tight shell; the instanced bundles provide the
 * thicker, hand-laid silhouette and surface breakup without changing roof topology,
 * collision, save identity, placement cost or demolition ownership. Parent-valley
 * openings remain clear so the new finish cannot refill an integrated cross-gable cutout.
 */
export function applySemanticRoofThatchFinish(wingRoot, wing, {
  junctionProfiles = []
} = {}) {
  if (!wingRoot || !wing) return 0;
  const buildGroup = wing.ridgeAxis === 'z'
    ? wingRoot.getObjectByName('SemanticRoofRotatedZAxis')
    : wingRoot;
  if (!buildGroup) return 0;

  let courseCount = 0;
  buildGroup.traverse(object => {
    if (object.userData?.semanticRoofThatch !== true || !object.isMesh) return;
    object.scale.y *= 1.16;
    object.translateY(0.016);
    object.userData.semanticRoofThatchFullDepth = true;
    courseCount += 1;
  });

  const ridge = buildGroup.getObjectByName('SemanticRoofThatchRidge');
  if (ridge?.isMesh) {
    ridge.scale.x *= 1.16;
    ridge.scale.z *= 1.16;
    ridge.userData.semanticRoofFullRidgeBundle = true;
  }

  const north = addStrawBundles(buildGroup, wing, -1, junctionProfiles);
  const south = addStrawBundles(buildGroup, wing, 1, junctionProfiles);
  const bundleCount = north.count + south.count;
  const skippedForJunction = north.skippedForJunction + south.skippedForJunction;
  wingRoot.userData.semanticRoofLayeredThatch = true;
  wingRoot.userData.semanticRoofFullDepthCourseCount = courseCount;
  wingRoot.userData.semanticRoofStrawBundleCount = bundleCount;
  wingRoot.userData.semanticRoofStrawBundlesSkippedForJunction = skippedForJunction;
  return bundleCount;
}
