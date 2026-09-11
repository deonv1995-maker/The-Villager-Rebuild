import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

const INTERIOR_LINER_COLOR = 0x845535;
const INTERIOR_GABLE_COLOR = 0x764a2f;
const INTERIOR_FRAME_COLOR = 0x5a3b25;
const INTERIOR_SOFFIT_COLOR = 0x7b4f31;
const RAFTER_SPACING = 1.0;
const RAFTER_RADIUS = 0.055;
const RIDGE_BEAM_RADIUS = 0.082;
const TIE_BEAM_RADIUS = 0.06;
const JOIN_TRIM_RADIUS = 0.082;
const JOIN_TOP_PLATE_RADIUS = 0.07;
const LINER_INSET = 0.072;
const SOFFIT_INSET = 0.115;
const LINER_JOIN_SETBACK = 0.12;
const FRAME_JOIN_SETBACK = 0.08;
const EPSILON = 0.00001;

const linerMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_LINER_COLOR,
  roughness: 0.96,
  metalness: 0,
  side: THREE.FrontSide,
  flatShading: true
});

const gableInteriorMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_GABLE_COLOR,
  roughness: 0.96,
  metalness: 0,
  side: THREE.BackSide,
  flatShading: true
});

const frameMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_FRAME_COLOR,
  roughness: 0.97,
  metalness: 0,
  flatShading: true
});

const soffitMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_SOFFIT_COLOR,
  roughness: 0.97,
  metalness: 0,
  flatShading: true
});

const buildGroupForWing = (wingRoot, wing) => (
  wing.ridgeAxis === 'z'
    ? wingRoot.getObjectByName('SemanticRoofRotatedZAxis')
    : wingRoot
);

const metricsForWing = wing => {
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
    span,
    rise,
    halfSpan,
    slopeLength,
    pitch,
    eaveY,
    ridgeY: eaveY + rise
  };
};

const slopeNormal = (side, pitch) => new THREE.Vector3(
  0,
  Math.cos(pitch),
  side * Math.sin(pitch)
);

const slopePoint = (side, amount, { eaveY, rise, halfSpan }) => new THREE.Vector3(
  0,
  eaveY + rise * amount,
  side * halfSpan * (1 - amount)
);

const cylinderBetween = (start, end, radius, name) => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.05) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius, length, 7, 1, false),
    frameMaterial
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const coreRunBounds = wing => {
  const length = wing.ridgeAxis === 'z' ? wing.depth : wing.width;
  return {
    min: -length * 0.5,
    max: length * 0.5
  };
};

const childJoinProfilesForWing = (wing, junctionProfiles) => (
  (junctionProfiles ?? []).filter(profile => profile.childWingIndex === wing.index)
);

const interiorFrameRunBounds = (wing, junctionProfiles) => {
  const core = coreRunBounds(wing);
  let min = core.min;
  let max = core.max;

  for (const profile of childJoinProfilesForWing(wing, junctionProfiles)) {
    if (profile.childLocalJoinEnd === 'negative') min += FRAME_JOIN_SETBACK;
    if (profile.childLocalJoinEnd === 'positive') max -= FRAME_JOIN_SETBACK;
  }

  if (max - min <= 0.2) return core;
  return { min, max };
};

const setBackJoinedLinerGeometry = (geometry, wing, junctionProfiles) => {
  const positions = geometry?.getAttribute?.('position');
  if (!positions) return false;

  const { min, max } = coreRunBounds(wing);
  const coreHalfLength = (max - min) * 0.5;
  let changed = false;

  for (const profile of childJoinProfilesForWing(wing, junctionProfiles)) {
    const sign = profile.childLocalJoinEnd === 'negative' ? -1 : 1;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const directedX = sign * x;
      const excess = directedX - coreHalfLength;
      if (excess <= EPSILON) continue;

      const trimmedExcess = Math.max(0, excess - LINER_JOIN_SETBACK);
      positions.setX(index, sign * (coreHalfLength + trimmedExcess));
      changed = true;
    }
  }

  if (!changed) return false;
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
};

const rafterCrossesValley = (x, side, wing, junctionProfiles) => {
  const sideLabel = side < 0 ? 'negative' : 'positive';
  return (junctionProfiles ?? []).some(profile => (
    profile.parentWingIndex === wing.index &&
    profile.parentSlopeSide === sideLabel &&
    Math.abs(x - profile.cutoutCenter) <= profile.cutoutHalfWidth + RAFTER_RADIUS * 1.4
  ));
};

const anyValleyAt = (x, wing, junctionProfiles) => (
  (junctionProfiles ?? []).some(profile => (
    profile.parentWingIndex === wing.index &&
    Math.abs(x - profile.cutoutCenter) <= profile.cutoutHalfWidth + TIE_BEAM_RADIUS * 1.4
  ))
);

const addInteriorLiners = (buildGroup, wing, junctionProfiles, metrics) => {
  let count = 0;
  for (const side of [-1, 1]) {
    const sideLabel = side < 0 ? 'North' : 'South';
    const underlay = buildGroup.getObjectByName(`SemanticRoofSlope${sideLabel}`);
    if (!underlay?.isMesh || !underlay.geometry) continue;

    const linerGeometry = underlay.geometry.clone();
    const jointSetback = setBackJoinedLinerGeometry(
      linerGeometry,
      wing,
      junctionProfiles
    );
    const liner = new THREE.Mesh(linerGeometry, linerMaterial);
    liner.name = `SemanticRoofInteriorLiner${sideLabel}`;
    liner.position.copy(underlay.position);
    liner.rotation.copy(underlay.rotation);
    liner.scale.copy(underlay.scale);
    liner.scale.y *= 0.34;
    liner.position.addScaledVector(slopeNormal(side, metrics.pitch), -LINER_INSET);
    liner.castShadow = false;
    liner.receiveShadow = true;
    liner.userData.semanticRoofInteriorLiner = true;
    liner.userData.semanticRoofInteriorJoinedSlope = underlay.userData?.semanticRoofJoinedSlope === true;
    liner.userData.semanticRoofInteriorJunctionCutout = underlay.userData?.semanticRoofJunctionCutout === true;
    liner.userData.semanticRoofInteriorJointSetback = jointSetback;
    buildGroup.add(liner);
    count += 1;
  }
  return count;
};

const addInteriorSoffits = (buildGroup, metrics) => {
  const sources = [];
  buildGroup.traverse(object => {
    if (
      object?.isMesh &&
      object.userData?.semanticRoofExteriorEave === true &&
      object.name?.startsWith('SemanticRoofThatchEave')
    ) {
      sources.push(object);
    }
  });

  let count = 0;
  for (const source of sources) {
    const side = Number(source.userData?.semanticRoofEaveSide) < 0 ? -1 : 1;
    const soffit = new THREE.Mesh(source.geometry.clone(), soffitMaterial);
    soffit.name = source.name.replace('SemanticRoofThatchEave', 'SemanticRoofInteriorSoffit');
    soffit.position.copy(source.position);
    soffit.rotation.copy(source.rotation);
    soffit.scale.copy(source.scale);
    soffit.scale.y *= 0.22;
    soffit.position.addScaledVector(slopeNormal(side, metrics.pitch), -SOFFIT_INSET);
    soffit.castShadow = false;
    soffit.receiveShadow = true;
    soffit.userData.semanticRoofInteriorSoffit = true;
    soffit.userData.semanticRoofInteriorThatchShield = true;
    soffit.userData.semanticRoofEaveSide = side;
    soffit.userData.semanticRoofEaveSegmentStart = source.userData.semanticRoofEaveSegmentStart;
    soffit.userData.semanticRoofEaveSegmentEnd = source.userData.semanticRoofEaveSegmentEnd;
    buildGroup.add(soffit);
    count += 1;
  }
  return count;
};

const addInteriorGables = buildGroup => {
  const gables = [];
  buildGroup.traverse(object => {
    if (object.isMesh && object.userData?.semanticRoofGable === true) gables.push(object);
  });

  for (const gable of gables) {
    const lining = new THREE.Mesh(gable.geometry.clone(), gableInteriorMaterial);
    lining.name = `${gable.name}InteriorLining`;
    lining.position.copy(gable.position);
    lining.rotation.copy(gable.rotation);
    lining.scale.copy(gable.scale);
    lining.castShadow = false;
    lining.receiveShadow = true;
    lining.userData.semanticRoofInteriorGable = true;
    buildGroup.add(lining);
  }
  return gables.length;
};

const addInteriorJointTrim = (buildGroup, wing, junctionProfiles, metrics) => {
  const profiles = childJoinProfilesForWing(wing, junctionProfiles);
  if (!profiles.length) return 0;

  const core = coreRunBounds(wing);
  const coreHalfLength = (core.max - core.min) * 0.5;
  let count = 0;

  for (const [profileIndex, profile] of profiles.entries()) {
    const sign = profile.childLocalJoinEnd === 'negative' ? -1 : 1;
    const joinX = sign * coreHalfLength;
    const ridge = new THREE.Vector3(joinX, metrics.ridgeY - 0.11, 0);

    for (const side of [-1, 1]) {
      const eave = new THREE.Vector3(
        joinX,
        metrics.eaveY - 0.08,
        side * Math.max(0.08, metrics.halfSpan - 0.045)
      );
      const trim = cylinderBetween(
        eave,
        ridge,
        JOIN_TRIM_RADIUS,
        `SemanticRoofInteriorJoinRake${profileIndex + 1}${side < 0 ? 'North' : 'South'}`
      );
      if (!trim) continue;
      trim.userData.semanticRoofInteriorJointTrim = true;
      trim.userData.semanticRoofInteriorJointThatchShield = true;
      buildGroup.add(trim);
      count += 1;
    }

    const plate = cylinderBetween(
      new THREE.Vector3(joinX, metrics.eaveY - 0.105, -Math.max(0.08, metrics.halfSpan - 0.06)),
      new THREE.Vector3(joinX, metrics.eaveY - 0.105, Math.max(0.08, metrics.halfSpan - 0.06)),
      JOIN_TOP_PLATE_RADIUS,
      `SemanticRoofInteriorJoinTopPlate${profileIndex + 1}`
    );
    if (plate) {
      plate.userData.semanticRoofInteriorJointTrim = true;
      plate.userData.semanticRoofInteriorJointThatchShield = true;
      buildGroup.add(plate);
      count += 1;
    }
  }

  return count;
};

const addInteriorFraming = (buildGroup, wing, junctionProfiles, metrics) => {
  const run = interiorFrameRunBounds(wing, junctionProfiles);
  const runLength = Math.max(0.1, run.max - run.min);
  const rafterStations = Math.max(3, Math.ceil(runLength / RAFTER_SPACING) + 1);
  const childJoined = childJoinProfilesForWing(wing, junctionProfiles).length > 0;
  let rafterCount = 0;
  let beamCount = 0;

  for (let index = 0; index < rafterStations; index += 1) {
    const x = rafterStations === 1
      ? (run.min + run.max) * 0.5
      : THREE.MathUtils.lerp(run.min, run.max, index / (rafterStations - 1));

    for (const side of [-1, 1]) {
      if (rafterCrossesValley(x, side, wing, junctionProfiles)) continue;
      const normal = slopeNormal(side, metrics.pitch);
      const start = slopePoint(side, 0.035, metrics)
        .addScaledVector(normal, -0.115);
      const end = slopePoint(side, 0.955, metrics)
        .addScaledVector(normal, -0.115);
      start.x = x;
      end.x = x;
      const rafter = cylinderBetween(
        start,
        end,
        RAFTER_RADIUS,
        `SemanticRoofInteriorRafter${side < 0 ? 'North' : 'South'}${index + 1}`
      );
      if (!rafter) continue;
      rafter.userData.semanticRoofInteriorRafter = true;
      rafter.userData.semanticRoofInteriorJointTrimmed = childJoined;
      buildGroup.add(rafter);
      rafterCount += 1;
    }
  }

  const ridgeBeam = cylinderBetween(
    new THREE.Vector3(run.min, metrics.ridgeY - 0.15, 0),
    new THREE.Vector3(run.max, metrics.ridgeY - 0.15, 0),
    RIDGE_BEAM_RADIUS,
    'SemanticRoofInteriorRidgeBeam'
  );
  if (ridgeBeam) {
    ridgeBeam.userData.semanticRoofInteriorBeam = true;
    ridgeBeam.userData.semanticRoofInteriorRidgeBeam = true;
    ridgeBeam.userData.semanticRoofInteriorJointTrimmed = childJoined;
    buildGroup.add(ridgeBeam);
    beamCount += 1;
  }

  const desiredTieCount = THREE.MathUtils.clamp(Math.floor(runLength / 2.35), 1, 3);
  for (let index = 0; index < desiredTieCount; index += 1) {
    const fraction = (index + 1) / (desiredTieCount + 1);
    const x = THREE.MathUtils.lerp(run.min, run.max, fraction);
    if (anyValleyAt(x, wing, junctionProfiles)) continue;

    const amount = 0.23;
    const halfWidth = metrics.halfSpan * (1 - amount) - 0.08;
    if (halfWidth <= 0.08) continue;
    const y = metrics.eaveY + metrics.rise * amount - 0.19;
    const tie = cylinderBetween(
      new THREE.Vector3(x, y, -halfWidth),
      new THREE.Vector3(x, y, halfWidth),
      TIE_BEAM_RADIUS,
      `SemanticRoofInteriorTieBeam${index + 1}`
    );
    if (!tie) continue;
    tie.userData.semanticRoofInteriorBeam = true;
    tie.userData.semanticRoofInteriorTieBeam = true;
    tie.userData.semanticRoofInteriorJointTrimmed = childJoined;
    buildGroup.add(tie);
    beamCount += 1;
  }

  return { rafterCount, beamCount };
};

/**
 * Add an interior-only presentation layer to a completed semantic Roof wing. Parent
 * valley openings still come directly from the canonical integrated roof underlay. At a
 * child-wing join, the inward liner is set back slightly from the exterior intersection,
 * then a timber join frame masks the exposed seam without sealing the real opening.
 * Exterior eave-thatch geometry is covered from below by matching timber soffits, so straw
 * remains an exterior material while the occupied room reads as a finished timber shell.
 * Exposed gable infill receives a BackSide timber lining. All added members remain visual
 * only and do not participate in support, collision, cost, save identity or demolition.
 */
export function applySemanticRoofInteriorFinish(wingRoot, wing, {
  junctionProfiles = []
} = {}) {
  if (!wingRoot || !wing) {
    return {
      linerCount: 0,
      soffitCount: 0,
      gableCount: 0,
      jointTrimCount: 0,
      rafterCount: 0,
      beamCount: 0
    };
  }
  const buildGroup = buildGroupForWing(wingRoot, wing);
  if (!buildGroup) {
    return {
      linerCount: 0,
      soffitCount: 0,
      gableCount: 0,
      jointTrimCount: 0,
      rafterCount: 0,
      beamCount: 0
    };
  }

  const metrics = metricsForWing(wing);
  const linerCount = addInteriorLiners(
    buildGroup,
    wing,
    junctionProfiles,
    metrics
  );
  const soffitCount = addInteriorSoffits(buildGroup, metrics);
  const gableCount = addInteriorGables(buildGroup);
  const jointTrimCount = addInteriorJointTrim(
    buildGroup,
    wing,
    junctionProfiles,
    metrics
  );
  const { rafterCount, beamCount } = addInteriorFraming(
    buildGroup,
    wing,
    junctionProfiles,
    metrics
  );

  wingRoot.userData.semanticRoofInteriorFinished = true;
  wingRoot.userData.semanticRoofInteriorLinerCount = linerCount;
  wingRoot.userData.semanticRoofInteriorSoffitCount = soffitCount;
  wingRoot.userData.semanticRoofInteriorGableCount = gableCount;
  wingRoot.userData.semanticRoofInteriorJointTrimCount = jointTrimCount;
  wingRoot.userData.semanticRoofInteriorRafterCount = rafterCount;
  wingRoot.userData.semanticRoofInteriorBeamCount = beamCount;
  wingRoot.userData.semanticRoofInteriorThatchShielded = soffitCount > 0;
  wingRoot.userData.semanticRoofInteriorJointTrimmed = childJoinProfilesForWing(
    wing,
    junctionProfiles
  ).length > 0;

  return {
    linerCount,
    soffitCount,
    gableCount,
    jointTrimCount,
    rafterCount,
    beamCount
  };
}
