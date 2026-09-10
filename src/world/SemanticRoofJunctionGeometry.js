import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

const OPPOSITE_SIDE = Object.freeze({
  west: 'east',
  east: 'west',
  north: 'south',
  south: 'north'
});

const EPSILON = 0.00001;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildGroupForWing = (wingRoot, ridgeAxis) => (
  ridgeAxis === 'z'
    ? wingRoot.getObjectByName('SemanticRoofRotatedZAxis')
    : wingRoot
);

const childLocalJoinEnd = wing => {
  if (wing.ridgeAxis === 'x') {
    if (wing.joinSide === 'west') return 'negative';
    if (wing.joinSide === 'east') return 'positive';
    return null;
  }
  if (wing.joinSide === 'north') return 'positive';
  if (wing.joinSide === 'south') return 'negative';
  return null;
};

const parentSlopeSide = (parent, childJoinSide) => {
  const childSide = OPPOSITE_SIDE[childJoinSide];
  if (parent.ridgeAxis === 'x') {
    if (childSide === 'north') return 'negative';
    if (childSide === 'south') return 'positive';
    return null;
  }
  if (childSide === 'west') return 'negative';
  if (childSide === 'east') return 'positive';
  return null;
};

const parentCutoutCenter = (parent, child) => (
  parent.ridgeAxis === 'x'
    ? child.offsetX - parent.offsetX
    : -(child.offsetZ - parent.offsetZ)
);

const childCrossSpan = child => (
  child.ridgeAxis === 'x' ? child.depth : child.width
);

const parentHalfSpan = parent => (
  parent.ridgeAxis === 'x' ? parent.depth * 0.5 : parent.width * 0.5
);

export function planSemanticRoofJunctionProfiles(plan) {
  if (!plan?.wings?.length) return [];

  const profiles = [];
  for (const child of plan.wings) {
    if (!Number.isInteger(child.joinedToWing)) continue;
    const parent = plan.wings[child.joinedToWing];
    if (!parent || parent === child || child.ridgeAxis === parent.ridgeAxis) continue;

    const localJoinEnd = childLocalJoinEnd(child);
    const slopeSide = parentSlopeSide(parent, child.joinSide);
    if (!localJoinEnd || !slopeSide) continue;

    const childRise = semanticRoofRise(child);
    const parentRise = semanticRoofRise(parent);
    if (!(childRise > 0) || !(parentRise > 0)) continue;

    const apexAmount = clamp(childRise / parentRise, 0, 1);
    if (apexAmount <= EPSILON) continue;

    profiles.push({
      childWingIndex: child.index,
      parentWingIndex: parent.index,
      childLocalJoinEnd: localJoinEnd,
      parentSlopeSide: slopeSide,
      joinInset: parentHalfSpan(parent) * apexAmount,
      cutoutCenter: parentCutoutCenter(parent, child),
      cutoutHalfWidth: childCrossSpan(child) * 0.5,
      apexAmount
    });
  }
  return profiles;
}

const disposeAndReplaceGeometry = (mesh, geometry) => {
  mesh.geometry?.dispose?.();
  mesh.geometry = geometry;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeVertexNormals();
};

const buildPointFromMeshVertex = (mesh, x, y, z) => {
  mesh.updateMatrix();
  return new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrix);
};

const slopeAmountFromBuildPoint = (point, {
  side,
  eaveY,
  rise,
  halfSpan
}) => {
  const slopeLength = Math.hypot(halfSpan, rise);
  const pitch = Math.atan2(rise, halfSpan);
  const sine = Math.sin(pitch);
  const cosine = Math.cos(pitch);
  const signedZ = side * point.z;
  const deltaY = point.y - eaveY;
  return (
    deltaY * sine - cosine * (signedZ - halfSpan)
  ) / slopeLength;
};

const slopeAmountAtMeshZ = (mesh, z, options) => {
  const center = slopeAmountFromBuildPoint(mesh.position, options);
  const slopeLength = Math.hypot(options.halfSpan, options.rise);
  return center - options.side * z / slopeLength;
};

const extendJoinedSlopeMesh = (mesh, {
  joinSign,
  coreHalfLength,
  joinInset,
  eaveY,
  rise,
  halfSpan
}) => {
  const geometry = mesh.geometry?.clone?.();
  const positions = geometry?.getAttribute?.('position');
  if (!geometry || !positions) return false;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const joinedX = joinSign < 0 ? bounds.min.x : bounds.max.x;
  const inverse = new THREE.Matrix4();
  mesh.updateMatrix();
  inverse.copy(mesh.matrix).invert();

  let changed = false;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    if (Math.abs(x - joinedX) > EPSILON) continue;

    const y = positions.getY(index);
    const z = positions.getZ(index);
    const side = mesh.name?.includes('North') ? -1 : 1;
    const amount = clamp(slopeAmountAtMeshZ(mesh, z, {
      side,
      eaveY,
      rise,
      halfSpan
    }), 0, 1);
    const buildPoint = buildPointFromMeshVertex(mesh, x, y, z);
    buildPoint.x = joinSign * (coreHalfLength + joinInset * amount);
    const localPoint = buildPoint.applyMatrix4(inverse);
    positions.setX(index, localPoint.x);
    changed = true;
  }

  if (!changed) return false;
  positions.needsUpdate = true;
  disposeAndReplaceGeometry(mesh, geometry);
  mesh.userData.semanticRoofJoinedSlope = true;
  return true;
};

const extendJoinedFringe = (mesh, {
  joinSign,
  coreHalfLength,
  joinInset,
  eaveY,
  rise,
  halfSpan
}) => {
  if (mesh.userData?.semanticRoofExteriorEave === true) return false;
  const geometry = mesh.geometry?.clone?.();
  const positions = geometry?.getAttribute?.('position');
  if (!geometry || !positions || positions.count < 3) return false;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const oldJoin = joinSign < 0 ? bounds.min.x : bounds.max.x;
  const fixed = joinSign < 0 ? bounds.max.x : bounds.min.x;
  const span = oldJoin - fixed;
  if (Math.abs(span) <= EPSILON) return false;

  const sample = buildPointFromMeshVertex(
    mesh,
    positions.getX(0),
    positions.getY(0),
    positions.getZ(0)
  );
  const side = mesh.name?.includes('North') ? -1 : 1;
  const amount = clamp(slopeAmountFromBuildPoint(sample, {
    side,
    eaveY,
    rise,
    halfSpan
  }), 0, 1);
  const newJoin = joinSign * (coreHalfLength + joinInset * amount);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const ratio = (x - fixed) / span;
    positions.setX(index, fixed + ratio * (newJoin - fixed));
  }
  positions.needsUpdate = true;
  disposeAndReplaceGeometry(mesh, geometry);
  mesh.userData.semanticRoofJoinedFringe = true;
  return true;
};

const extendJoinedRidge = (buildGroup, {
  joinSign,
  coreHalfLength,
  joinInset
}) => {
  const ridge = buildGroup.getObjectByName('SemanticRoofThatchRidge');
  if (!ridge?.geometry) return false;
  ridge.geometry.computeBoundingBox();
  const bounds = ridge.geometry.boundingBox;
  const localHalfLength = Math.max(
    Math.abs(bounds.min.y),
    Math.abs(bounds.max.y)
  );
  if (!(localHalfLength > EPSILON)) return false;

  ridge.updateMatrix();
  const endpointA = new THREE.Vector3(0, bounds.min.y, 0).applyMatrix4(ridge.matrix);
  const endpointB = new THREE.Vector3(0, bounds.max.y, 0).applyMatrix4(ridge.matrix);
  const oldMin = Math.min(endpointA.x, endpointB.x);
  const oldMax = Math.max(endpointA.x, endpointB.x);
  const desiredJoin = joinSign * (coreHalfLength + joinInset);
  const newMin = joinSign < 0 ? desiredJoin : oldMin;
  const newMax = joinSign > 0 ? desiredJoin : oldMax;
  const oldLength = Math.abs(endpointB.x - endpointA.x);
  const newLength = Math.max(0.05, newMax - newMin);
  const oldCenter = (endpointA.x + endpointB.x) * 0.5;
  const newCenter = (newMin + newMax) * 0.5;

  ridge.scale.y *= newLength / oldLength;
  ridge.position.x += newCenter - oldCenter;
  ridge.userData.semanticRoofJoinedRidge = true;

  const ties = [];
  buildGroup.traverse(object => {
    if (object.name?.startsWith('SemanticRoofRidgeTie')) ties.push(object);
  });
  const denominator = oldMax - oldMin;
  if (denominator > EPSILON) {
    for (const tie of ties) {
      const ratio = clamp((tie.position.x - oldMin) / denominator, 0, 1);
      tie.position.x = newMin + (newMax - newMin) * ratio;
      tie.userData.semanticRoofJoinedRidge = true;
    }
  }

  return true;
};

const appendPrism = (positions, indices, {
  xLeftA,
  xRightA,
  zA,
  xLeftB,
  xRightB,
  zB,
  yMin,
  yMax
}) => {
  const widthA = xRightA - xLeftA;
  const widthB = xRightB - xLeftB;
  if (Math.max(widthA, widthB) <= EPSILON || Math.abs(zB - zA) <= EPSILON) return;

  const base = positions.length / 3;
  positions.push(
    xLeftA, yMin, zA,
    xRightA, yMin, zA,
    xRightB, yMin, zB,
    xLeftB, yMin, zB,
    xLeftA, yMax, zA,
    xRightA, yMax, zA,
    xRightB, yMax, zB,
    xLeftB, yMax, zB
  );

  indices.push(
    base, base + 2, base + 1,
    base, base + 3, base + 2,
    base + 4, base + 5, base + 6,
    base + 4, base + 6, base + 7,
    base, base + 1, base + 5,
    base, base + 5, base + 4,
    base + 1, base + 2, base + 6,
    base + 1, base + 6, base + 5,
    base + 2, base + 3, base + 7,
    base + 2, base + 7, base + 6,
    base + 3, base, base + 4,
    base + 3, base + 4, base + 7
  );
};

const visibleIntervals = ({
  xMin,
  xMax,
  amount,
  cutouts
}) => {
  const sorted = [...cutouts].sort((left, right) => left.center - right.center);
  const intervals = [];
  let cursor = xMin;
  for (const cutout of sorted) {
    const normalizedAmount = clamp(amount, 0, cutout.apexAmount);
    const halfWidth = cutout.halfWidth * (1 - normalizedAmount / cutout.apexAmount);
    const cutLeft = clamp(cutout.center - halfWidth, xMin, xMax);
    const cutRight = clamp(cutout.center + halfWidth, xMin, xMax);
    intervals.push({ start: cursor, end: Math.max(cursor, cutLeft) });
    cursor = Math.max(cursor, cutRight);
  }
  intervals.push({ start: cursor, end: xMax });
  return intervals;
};

const clipSlopeMeshForCutouts = (mesh, {
  side,
  cutouts,
  eaveY,
  rise,
  halfSpan
}) => {
  if (!mesh?.geometry || !cutouts.length) return false;
  const source = mesh.geometry;
  source.computeBoundingBox();
  const bounds = source.boundingBox;
  if (!bounds) return false;

  const slopeLength = Math.hypot(halfSpan, rise);
  const centerAmount = slopeAmountFromBuildPoint(mesh.position, {
    side,
    eaveY,
    rise,
    halfSpan
  });
  const amountAtZ = z => centerAmount - side * z / slopeLength;
  const zAtAmount = amount => (centerAmount - amount) * slopeLength / side;

  const localCutouts = cutouts.map(cutout => ({
    center: cutout.center - mesh.position.x,
    halfWidth: cutout.halfWidth,
    apexAmount: cutout.apexAmount
  }));

  const breakpoints = [bounds.min.z, bounds.max.z];
  for (const cutout of localCutouts) {
    const z = zAtAmount(cutout.apexAmount);
    if (z > bounds.min.z + EPSILON && z < bounds.max.z - EPSILON) {
      breakpoints.push(z);
    }
  }
  breakpoints.sort((a, b) => a - b);

  const positions = [];
  const indices = [];
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const zA = breakpoints[index];
    const zB = breakpoints[index + 1];
    if (zB - zA <= EPSILON) continue;
    const amountA = amountAtZ(zA);
    const amountB = amountAtZ(zB);
    const midpoint = (amountA + amountB) * 0.5;
    const active = localCutouts.filter(cutout => midpoint < cutout.apexAmount - EPSILON);

    if (!active.length) {
      appendPrism(positions, indices, {
        xLeftA: bounds.min.x,
        xRightA: bounds.max.x,
        zA,
        xLeftB: bounds.min.x,
        xRightB: bounds.max.x,
        zB,
        yMin: bounds.min.y,
        yMax: bounds.max.y
      });
      continue;
    }

    const intervalsA = visibleIntervals({
      xMin: bounds.min.x,
      xMax: bounds.max.x,
      amount: amountA,
      cutouts: active
    });
    const intervalsB = visibleIntervals({
      xMin: bounds.min.x,
      xMax: bounds.max.x,
      amount: amountB,
      cutouts: active
    });
    const count = Math.min(intervalsA.length, intervalsB.length);
    for (let intervalIndex = 0; intervalIndex < count; intervalIndex += 1) {
      appendPrism(positions, indices, {
        xLeftA: intervalsA[intervalIndex].start,
        xRightA: intervalsA[intervalIndex].end,
        zA,
        xLeftB: intervalsB[intervalIndex].start,
        xRightB: intervalsB[intervalIndex].end,
        zB,
        yMin: bounds.min.y,
        yMax: bounds.max.y
      });
    }
  }

  if (!positions.length || !indices.length) return false;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  disposeAndReplaceGeometry(mesh, geometry);
  mesh.userData.semanticRoofJunctionCutout = true;
  mesh.userData.semanticRoofJunctionCutoutCount = cutouts.length;
  return true;
};

const trimFringeForCutouts = (mesh, {
  cutouts,
  eaveY,
  rise,
  side,
  halfSpan
}) => {
  if (mesh.userData?.semanticRoofExteriorEave === true) return false;
  const source = mesh.geometry;
  const positions = source?.getAttribute?.('position');
  if (!positions || positions.count < 3) return false;

  const kept = [];
  for (let index = 0; index + 2 < positions.count; index += 3) {
    const a = buildPointFromMeshVertex(
      mesh,
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index)
    );
    const b = buildPointFromMeshVertex(
      mesh,
      positions.getX(index + 1),
      positions.getY(index + 1),
      positions.getZ(index + 1)
    );
    const midpointX = (a.x + b.x) * 0.5;
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const amount = clamp(slopeAmountFromBuildPoint(midpoint, {
      side,
      eaveY,
      rise,
      halfSpan
    }), 0, 1);
    const insideCutout = cutouts.some(cutout => {
      if (amount >= cutout.apexAmount) return false;
      const halfWidth = cutout.halfWidth * (1 - amount / cutout.apexAmount);
      return midpointX > cutout.center - halfWidth && midpointX < cutout.center + halfWidth;
    });
    if (insideCutout) continue;

    for (let vertex = 0; vertex < 3; vertex += 1) {
      kept.push(
        positions.getX(index + vertex),
        positions.getY(index + vertex),
        positions.getZ(index + vertex)
      );
    }
  }

  if (kept.length === positions.count * 3) return false;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  disposeAndReplaceGeometry(mesh, geometry);
  mesh.userData.semanticRoofJunctionCutout = true;
  return true;
};

const extendChildWing = (wingRoot, wing, profile) => {
  const buildGroup = buildGroupForWing(wingRoot, wing.ridgeAxis);
  if (!buildGroup) return;

  const joinSign = profile.childLocalJoinEnd === 'negative' ? -1 : 1;
  const coreLength = wing.ridgeAxis === 'z' ? wing.depth : wing.width;
  const eaveY = -semanticRoofWallSeatDrop();
  const rise = semanticRoofRise(wing);
  const options = {
    joinSign,
    coreHalfLength: coreLength * 0.5,
    joinInset: profile.joinInset,
    eaveY,
    rise,
    halfSpan: childCrossSpan(wing) * 0.5
  };

  buildGroup.traverse(object => {
    if (!object.isMesh) return;
    if (object.userData?.semanticRoofUnderlay === true || object.userData?.semanticRoofThatch === true) {
      extendJoinedSlopeMesh(object, options);
      return;
    }
    if (object.userData?.semanticRoofThatchFringe === true) {
      extendJoinedFringe(object, options);
    }
  });
  extendJoinedRidge(buildGroup, options);

  wingRoot.userData.semanticRoofCrossGableJoined = true;
  wingRoot.userData.semanticRoofJoinInset = profile.joinInset;
  wingRoot.userData.semanticRoofJoinApexAmount = profile.apexAmount;
};

const notchParentWing = (wingRoot, wing, slopeSide, profiles) => {
  const buildGroup = buildGroupForWing(wingRoot, wing.ridgeAxis);
  if (!buildGroup || !profiles.length) return;

  const side = slopeSide === 'negative' ? -1 : 1;
  const sideLabel = side < 0 ? 'North' : 'South';
  const rise = semanticRoofRise(wing);
  const halfSpan = parentHalfSpan(wing);
  const eaveY = -semanticRoofWallSeatDrop();
  const cutouts = profiles.map(profile => ({
    center: profile.cutoutCenter,
    halfWidth: profile.cutoutHalfWidth,
    apexAmount: profile.apexAmount
  }));
  const options = { side, cutouts, eaveY, rise, halfSpan };

  buildGroup.traverse(object => {
    if (!object.isMesh) return;
    if (
      object.name === `SemanticRoofSlope${sideLabel}` ||
      object.name?.startsWith(`SemanticRoofThatchCourse${sideLabel}`)
    ) {
      clipSlopeMeshForCutouts(object, options);
      return;
    }
    if (
      object.userData?.semanticRoofThatchFringe === true &&
      object.name?.startsWith(`SemanticRoofThatchFringe${sideLabel}`)
    ) {
      trimFringeForCutouts(object, options);
    }
  });

  wingRoot.userData.semanticRoofValleyCutout = true;
  wingRoot.userData.semanticRoofValleyCutoutCount = (
    wingRoot.userData.semanticRoofValleyCutoutCount ?? 0
  ) + profiles.length;
};

export function applySemanticRoofJunctionGeometry(plan, wingRootsByIndex) {
  const profiles = planSemanticRoofJunctionProfiles(plan);
  if (!profiles.length) return profiles;

  const parentGroups = new Map();
  for (const profile of profiles) {
    const key = `${profile.parentWingIndex}:${profile.parentSlopeSide}`;
    if (!parentGroups.has(key)) parentGroups.set(key, []);
    parentGroups.get(key).push(profile);

    const childRoot = wingRootsByIndex.get(profile.childWingIndex);
    const childWing = plan.wings[profile.childWingIndex];
    if (childRoot && childWing) extendChildWing(childRoot, childWing, profile);
  }

  for (const groupedProfiles of parentGroups.values()) {
    const first = groupedProfiles[0];
    const parentRoot = wingRootsByIndex.get(first.parentWingIndex);
    const parentWing = plan.wings[first.parentWingIndex];
    if (parentRoot && parentWing) {
      notchParentWing(parentRoot, parentWing, first.parentSlopeSide, groupedProfiles);
    }
  }

  return profiles;
}
