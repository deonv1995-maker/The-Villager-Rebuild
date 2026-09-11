import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

// The structural five-course shell remains the semantic roof authority. The production
// finish is deliberately a separate presentation layer: dense fine straw breaks up the
// broad course faces, longer pointed tips soften every lap/eave, and sparse flattened moss
// clumps add the small green roof accents used by the approved village art direction.
const STRAW_ROW_AMOUNTS = Object.freeze([
  0.025,
  0.095,
  0.165,
  0.235,
  0.305,
  0.375,
  0.445,
  0.515,
  0.585,
  0.655,
  0.725,
  0.795,
  0.865,
  0.935,
  0.985
]);
const STRAW_EDGE_AMOUNTS = Object.freeze([0.012, 0.202, 0.402, 0.602, 0.802]);
const STRAW_COLUMN_SPACING = 0.085;
const STRAW_EDGE_SPACING = 0.072;
const STRAW_BUNDLE_RADIUS = 0.019;
const STRAW_EDGE_RADIUS = 0.015;
const STRAW_BUNDLE_LIFT = 0.135;
const STRAW_EDGE_LIFT = 0.154;
const STRAW_BUNDLE_COLORS = Object.freeze([
  0xd8ad5a,
  0xe3bd6b,
  0xc9903d,
  0xedca7a,
  0xbf8132,
  0xd09c48,
  0xe6c273
]);
const STRAW_EDGE_COLORS = Object.freeze([
  0xe5bc65,
  0xd3a24d,
  0xefcc78,
  0xc78c37,
  0xdbad56
]);
const MOSS_COLORS = Object.freeze([0x66874a, 0x789553, 0x557a43]);
const MOSS_AMOUNTS = Object.freeze([0.24, 0.49, 0.73]);
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
  roughness: 0.99,
  metalness: 0,
  flatShading: true
});

const finishedMossMaterial = () => new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
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
  const columns = Math.max(18, Math.ceil(width / STRAW_COLUMN_SPACING));
  const capacity = columns * STRAW_ROW_AMOUNTS.length;
  const geometry = new THREE.CylinderGeometry(
    STRAW_BUNDLE_RADIUS * 0.12,
    STRAW_BUNDLE_RADIUS,
    1,
    4,
    1,
    false
  );
  const bundle = new THREE.InstancedMesh(geometry, finishedStrawMaterial(), capacity);
  bundle.name = `SemanticRoofStrawBundles${side < 0 ? 'North' : 'South'}`;
  bundle.userData.semanticRoofStrawBundles = true;
  bundle.userData.semanticRoofProductionThatch = true;
  bundle.userData.semanticRoofFineStraw = true;
  bundle.castShadow = true;
  bundle.receiveShadow = true;

  const up = new THREE.Vector3(0, 1, 0);
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(up, downslope);
  const surfaceTwist = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
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
      const leanVariation = deterministicVariation(rowIndex, column, side < 0 ? 43 : 53) - 0.5;
      const rowStagger = rowIndex % 2 === 0 ? -0.018 : 0.018;
      const x = -width * 0.5
        + width * (column + 0.5) / columns
        + acrossVariation * 0.04
        + rowStagger;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) {
        skippedForJunction += 1;
        continue;
      }
      const bundleLength = 0.29 + lengthVariation * 0.17;
      position.copy(rowPoint);
      position.x = x;
      position
        .addScaledVector(surfaceNormal, STRAW_BUNDLE_LIFT + (column % 5) * 0.003)
        .addScaledVector(downslope, bundleLength * (0.1 + (rowIndex % 3) * 0.02));
      surfaceTwist.setFromAxisAngle(surfaceNormal, leanVariation * 0.11);
      quaternion.copy(baseQuaternion).premultiply(surfaceTwist);
      const radialScale = 0.68 + radialVariation * 0.44;
      scale.set(radialScale, bundleLength, radialScale);
      matrix.compose(position, quaternion, scale);
      bundle.setMatrixAt(instanceIndex, matrix);
      color.setHex(STRAW_BUNDLE_COLORS[(rowIndex * 3 + column) % STRAW_BUNDLE_COLORS.length]);
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
  const columns = Math.max(20, Math.ceil(width / STRAW_EDGE_SPACING));
  const capacity = columns * STRAW_EDGE_AMOUNTS.length;
  const geometry = new THREE.CylinderGeometry(
    STRAW_EDGE_RADIUS * 0.08,
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
  tufts.userData.semanticRoofFineStraw = true;
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
        + acrossVariation * 0.038;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) {
        skippedForJunction += 1;
        continue;
      }

      const eaveBoost = rowIndex === 0 ? 0.105 : 0;
      const tuftLength = 0.2 + eaveBoost + lengthVariation * 0.13;
      position.copy(rowPoint);
      position.x = x;
      position
        .addScaledVector(surfaceNormal, STRAW_EDGE_LIFT + (column % 4) * 0.003)
        .addScaledVector(downslope, tuftLength * 0.5);
      twist.setFromAxisAngle(surfaceNormal, leanVariation * 0.18);
      quaternion.copy(baseQuaternion).premultiply(twist);
      const radialScale = 0.68 + lengthVariation * 0.3;
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

const addMossAccents = (buildGroup, wing, junctionProfiles) => {
  const {
    rise,
    halfSpan,
    pitch,
    eaveY,
    width
  } = slopeMetrics(wing);
  const candidates = [];

  for (const side of [-1, 1]) {
    const surfaceNormal = slopeNormal(side, pitch);
    for (const [index, amount] of MOSS_AMOUNTS.entries()) {
      const xVariation = deterministicVariation(index, wing.index ?? 0, side < 0 ? 61 : 67) - 0.5;
      const x = xVariation * width * 0.62;
      if (bundleIntersectsJunction(x, amount, side, wing, junctionProfiles)) continue;
      candidates.push({ side, surfaceNormal, amount, x, index });
    }
  }

  if (!candidates.length) return 0;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const accents = new THREE.InstancedMesh(geometry, finishedMossMaterial(), candidates.length);
  accents.name = 'SemanticRoofMossAccents';
  accents.userData.semanticRoofMossAccents = true;
  accents.userData.semanticRoofProductionThatch = true;
  accents.castShadow = false;
  accents.receiveShadow = true;

  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  candidates.forEach((entry, instanceIndex) => {
    position.copy(slopePoint(entry.side, entry.amount, eaveY, rise, halfSpan));
    position.x = entry.x;
    position.addScaledVector(entry.surfaceNormal, 0.155);
    quaternion.setFromUnitVectors(up, entry.surfaceNormal);
    const sizeVariation = deterministicVariation(entry.index, wing.index ?? 0, entry.side < 0 ? 73 : 79);
    scale.set(0.18 + sizeVariation * 0.16, 0.025, 0.12 + sizeVariation * 0.11);
    matrix.compose(position, quaternion, scale);
    accents.setMatrixAt(instanceIndex, matrix);
    color.setHex(MOSS_COLORS[(entry.index + (entry.side < 0 ? 0 : 1)) % MOSS_COLORS.length]);
    accents.setColorAt(instanceIndex, color);
  });

  accents.count = candidates.length;
  accents.userData.semanticRoofMossAccentCount = candidates.length;
  accents.instanceMatrix.needsUpdate = true;
  if (accents.instanceColor) accents.instanceColor.needsUpdate = true;
  buildGroup.add(accents);
  return candidates.length;
};

/**
 * Add a low-draw-call production finish over the existing structural thatch courses.
 * The courses remain the weather-tight shell. Fine tapered straw now carries most of the
 * visible surface so the roof reads as hand-laid material instead of stacked solid slabs.
 * A second instanced edge layer gives each lap a pointed silhouette, while sparse moss
 * accents provide the small green breakup used by the village visual target. None of these
 * layers change roof topology, collision, save identity, placement cost or demolition
 * ownership. Canonical junction profiles keep every decorative layer out of real valleys.
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
    // Keep the shell substantial enough to close the roof, but let the fine straw carry the
    // visible thickness. The previous 1.28 depth multiplier made each lap read like a block.
    object.scale.y *= 1.08;
    object.translateY(0.016);
    object.userData.semanticRoofThatchFullDepth = true;
    object.userData.semanticRoofProductionThatch = true;
    object.userData.semanticRoofFineStrawShell = true;
    courseCount += 1;
  });

  const ridge = buildGroup.getObjectByName('SemanticRoofThatchRidge');
  if (ridge?.isMesh) {
    ridge.scale.x *= 1.18;
    ridge.scale.z *= 1.18;
    ridge.position.y += 0.022;
    ridge.userData.semanticRoofFullRidgeBundle = true;
    ridge.userData.semanticRoofProductionThatch = true;
  }

  const north = addStrawBundles(buildGroup, wing, -1, junctionProfiles);
  const south = addStrawBundles(buildGroup, wing, 1, junctionProfiles);
  const northEdges = addStrawEdgeTufts(buildGroup, wing, -1, junctionProfiles);
  const southEdges = addStrawEdgeTufts(buildGroup, wing, 1, junctionProfiles);
  const mossAccentCount = addMossAccents(buildGroup, wing, junctionProfiles);
  const bundleCount = north.count + south.count;
  const edgeTuftCount = northEdges.count + southEdges.count;
  const skippedForJunction = north.skippedForJunction + south.skippedForJunction;
  const edgeTuftsSkippedForJunction = northEdges.skippedForJunction + southEdges.skippedForJunction;
  wingRoot.userData.semanticRoofLayeredThatch = true;
  wingRoot.userData.semanticRoofProductionThatch = true;
  wingRoot.userData.semanticRoofFineStraw = true;
  wingRoot.userData.semanticRoofFullDepthCourseCount = courseCount;
  wingRoot.userData.semanticRoofStrawBundleCount = bundleCount;
  wingRoot.userData.semanticRoofStrawEdgeTuftCount = edgeTuftCount;
  wingRoot.userData.semanticRoofMossAccentCount = mossAccentCount;
  wingRoot.userData.semanticRoofStrawBundlesSkippedForJunction = skippedForJunction;
  wingRoot.userData.semanticRoofStrawEdgeTuftsSkippedForJunction = edgeTuftsSkippedForJunction;
  return bundleCount;
}
