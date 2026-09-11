import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

// Production thatch keeps the structural five-course shell intact and adds two low-draw-call
// detail layers: staggered surface bundles plus tapered edge tufts. The denser surface rows
// break up the flat demo-panel look while the edge layer gives every course a soft, irregular
// straw silhouette without creating one Mesh per reed.
const STRAW_ROW_AMOUNTS = Object.freeze([
  0.045,
  0.155,
  0.265,
  0.375,
  0.485,
  0.595,
  0.705,
  0.815,
  0.925
]);
const STRAW_EDGE_AMOUNTS = Object.freeze([0.025, 0.205, 0.405, 0.605, 0.805]);
const STRAW_COLUMN_SPACING = 0.135;
const STRAW_EDGE_SPACING = 0.105;
const STRAW_BUNDLE_RADIUS = 0.033;
const STRAW_EDGE_RADIUS = 0.026;
const STRAW_BUNDLE_LIFT = 0.142;
const STRAW_EDGE_LIFT = 0.165;
const STRAW_BUNDLE_COLORS = Object.freeze([
  0xe9c875,
  0xddb157,
  0xf0d287,
  0xd29b42,
  0xe2ba61,
  0xc98f38
]);
const STRAW_EDGE_COLORS = Object.freeze([
  0xe6bd62,
  0xd8a64d,
  0xefce7b,
  0xcc913a
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

const slopeMetrics = wing => {
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
  return {
    length,
    rise,
    halfSpan,
    slopeLength,
    pitch,
    eaveY,
    width: length + 0.3
  };
};

const addStrawBundles = (buildGroup, wing, side, junctionProfiles) => {
  const {
    rise,
    halfSpan,
    slopeLength,
    pitch,
    eaveY,
    width
  } = slopeMetrics(wing);
  const surfaceNormal = slopeNormal(side, pitch);
  const downslope = new THREE.Vector3(
    0,
    -rise / slopeLength,
    side * halfSpan / slopeLength
  );
  const columns = Math.max(12, Math.ceil(width / STRAW_COLUMN_SPACING));
  const capacity = columns * STRAW_ROW_AMOUNTS.length;
  const geometry = new THREE.CylinderGeometry(
    STRAW_BUNDLE_RADIUS * 0.34,
    STRAW_BUNDLE_RADIUS,
    1,
    5,
    1,
    false
  );
  const bundle = new THREE.InstancedMesh(geometry, finishedStrawMaterial(), capacity);
  bundle.name = `SemanticRoofStrawBundles${side < 0 ? 'North' : 'South'}`;
  bundle.userData.semanticRoofStrawBundles = true;
  bundle.userData.semanticRoofProductionThatch = true;
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
      const rowStagger = rowIndex % 2 === 0 ? -0.025 : 0.025;
      const x = -width * 0.5
        + width * (column + 0.5) / columns
        + acrossVariation * 0.052
        + rowStagger;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) {
        skippedForJunction += 1;
        continue;
      }
      const bundleLength = 0.25 + lengthVariation * 0.13;
      position.copy(rowPoint);
      position.x = x;
      position
        .addScaledVector(surfaceNormal, STRAW_BUNDLE_LIFT + (column % 4) * 0.005)
        .addScaledVector(downslope, bundleLength * (0.08 + (rowIndex % 3) * 0.018));
      const radialScale = 0.78 + radialVariation * 0.38;
      scale.set(radialScale, bundleLength, radialScale);
      matrix.compose(position, quaternion, scale);
      bundle.setMatrixAt(instanceIndex, matrix);
      color.setHex(STRAW_BUNDLE_COLORS[(rowIndex * 2 + column) % STRAW_BUNDLE_COLORS.length]);
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

const addStrawEdgeTufts = (buildGroup, wing, side, junctionProfiles) => {
  const {
    rise,
    halfSpan,
    slopeLength,
    pitch,
    eaveY,
    width
  } = slopeMetrics(wing);
  const surfaceNormal = slopeNormal(side, pitch);
  const downslope = new THREE.Vector3(
    0,
    -rise / slopeLength,
    side * halfSpan / slopeLength
  );
  const columns = Math.max(14, Math.ceil(width / STRAW_EDGE_SPACING));
  const capacity = columns * STRAW_EDGE_AMOUNTS.length;
  const geometry = new THREE.CylinderGeometry(
    STRAW_EDGE_RADIUS * 0.16,
    STRAW_EDGE_RADIUS,
    1,
    4,
    1,
    false
  );
  const tufts = new THREE.InstancedMesh(geometry, finishedStrawMaterial(), capacity);
  tufts.name = `SemanticRoofStrawEdgeTufts${side < 0 ? 'North' : 'South'}`;
  tufts.userData.semanticRoofStrawEdgeTufts = true;
  tufts.userData.semanticRoofProductionThatch = true;
  tufts.castShadow = true;
  tufts.receiveShadow = true;

  const up = new THREE.Vector3(0, 1, 0);
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(up, downslope);
  const twist = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let instanceIndex = 0;
  let skippedForJunction = 0;

  for (const [rowIndex, amount] of STRAW_EDGE_AMOUNTS.entries()) {
    const rowPoint = slopePoint(side, amount, eaveY, rise, halfSpan);
    for (let column = 0; column < columns; column += 1) {
      const acrossVariation = deterministicVariation(rowIndex, column, side < 0 ? 19 : 23) - 0.5;
      const lengthVariation = deterministicVariation(rowIndex, column, side < 0 ? 29 : 31);
      const leanVariation = deterministicVariation(rowIndex, column, side < 0 ? 37 : 41) - 0.5;
      const x = -width * 0.5
        + width * (column + 0.5) / columns
        + acrossVariation * 0.045;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) {
        skippedForJunction += 1;
        continue;
      }

      const tuftLength = 0.18 + lengthVariation * 0.12;
      position.copy(rowPoint);
      position.x = x;
      position
        .addScaledVector(surfaceNormal, STRAW_EDGE_LIFT + (column % 3) * 0.004)
        .addScaledVector(downslope, tuftLength * 0.46);
      twist.setFromAxisAngle(surfaceNormal, leanVariation * 0.15);
      quaternion.copy(baseQuaternion).premultiply(twist);
      const radialScale = 0.78 + lengthVariation * 0.28;
      scale.set(radialScale, tuftLength, radialScale);
      matrix.compose(position, quaternion, scale);
      tufts.setMatrixAt(instanceIndex, matrix);
      color.setHex(STRAW_EDGE_COLORS[(rowIndex + column * 2) % STRAW_EDGE_COLORS.length]);
      tufts.setColorAt(instanceIndex, color);
      instanceIndex += 1;
    }
  }

  tufts.count = instanceIndex;
  tufts.userData.semanticRoofStrawEdgeTuftCount = instanceIndex;
  tufts.userData.semanticRoofStrawEdgeTuftsSkippedForJunction = skippedForJunction;
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  buildGroup.add(tufts);
  return { count: instanceIndex, skippedForJunction };
};

/**
 * Add a low-draw-call production finish over the existing structural thatch courses.
 * The courses remain the weather-tight shell. Dense tapered surface bundles break up the
 * broad faces and a second instanced edge layer gives each course a pointed hand-laid
 * silhouette. Neither layer changes roof topology, collision, save identity, placement
 * cost or demolition ownership. Parent-valley openings remain clear because both detail
 * layers consume the canonical junction profiles and omit instances inside those cutouts.
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
    object.scale.y *= 1.28;
    object.translateY(0.024);
    object.userData.semanticRoofThatchFullDepth = true;
    object.userData.semanticRoofProductionThatch = true;
    courseCount += 1;
  });

  const ridge = buildGroup.getObjectByName('SemanticRoofThatchRidge');
  if (ridge?.isMesh) {
    ridge.scale.x *= 1.22;
    ridge.scale.z *= 1.22;
    ridge.position.y += 0.018;
    ridge.userData.semanticRoofFullRidgeBundle = true;
    ridge.userData.semanticRoofProductionThatch = true;
  }

  const north = addStrawBundles(buildGroup, wing, -1, junctionProfiles);
  const south = addStrawBundles(buildGroup, wing, 1, junctionProfiles);
  const northEdges = addStrawEdgeTufts(buildGroup, wing, -1, junctionProfiles);
  const southEdges = addStrawEdgeTufts(buildGroup, wing, 1, junctionProfiles);
  const bundleCount = north.count + south.count;
  const edgeTuftCount = northEdges.count + southEdges.count;
  const skippedForJunction = north.skippedForJunction + south.skippedForJunction;
  const edgeTuftsSkippedForJunction = northEdges.skippedForJunction + southEdges.skippedForJunction;
  wingRoot.userData.semanticRoofLayeredThatch = true;
  wingRoot.userData.semanticRoofProductionThatch = true;
  wingRoot.userData.semanticRoofFullDepthCourseCount = courseCount;
  wingRoot.userData.semanticRoofStrawBundleCount = bundleCount;
  wingRoot.userData.semanticRoofStrawEdgeTuftCount = edgeTuftCount;
  wingRoot.userData.semanticRoofStrawBundlesSkippedForJunction = skippedForJunction;
  wingRoot.userData.semanticRoofStrawEdgeTuftsSkippedForJunction = edgeTuftsSkippedForJunction;
  return bundleCount;
}
