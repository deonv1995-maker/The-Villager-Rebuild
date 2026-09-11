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
const LINER_INSET = 0.038;
const LINER_DEPTH_SCALE = 0.72;
const SOFFIT_INSET = 0.07;
const SOFFIT_DEPTH_SCALE = 0.72;
const SOFFIT_RUN_SCALE = 1.45;
const SOFFIT_DOWNSLOPE_SHIFT = 0.08;
const RIDGE_JOIN_CLEARANCE = 0.035;
const RIDGE_VALLEY_CLEARANCE = 0.13;
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

const downslopeVector = (side, { rise, halfSpan, slopeLength }) => new THREE.Vector3(
  0,
  -rise / slopeLength,
  side * halfSpan / slopeLength
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

const parentRidgeProfilesForWing = (wing, junctionProfiles) => (
  (junctionProfiles ?? []).filter(profile => (
    profile.parentWingIndex === wing.index &&
    profile.apexAmount >= 1 - EPSILON
  ))
);

const joinedRidgeRunBounds = (wing, junctionProfiles) => {
  const run = coreRunBounds(wing);
  for (const profile of childJoinProfilesForWing(wing, junctionProfiles)) {
    const extension = Math.max(0, profile.joinInset - RIDGE_JOIN_CLEARANCE);
    if (profile.childLocalJoinEnd === 'negative') run.min -= extension;
    if (profile.childLocalJoinEnd === 'positive') run.max += extension;
  }
  return run;
};

const subtractInterval = (intervals, cutMin, cutMax) => {
  const result = [];
  for (const interval of intervals) {
    if (cutMax <= interval.min || cutMin >= interval.max) {
      result.push(interval);
      continue;
    }
    if (cutMin - interval.min > 0.05) {
      result.push({ min: interval.min, max: Math.min(interval.max, cutMin) });
    }
    if (interval.max - cutMax > 0.05) {
      result.push({ min: Math.max(interval.min, cutMax), max: interval.max });
    }
  }
  return result;
};

const interiorRidgeRunSegments = (wing, junctionProfiles) => {
  const run = joinedRidgeRunBounds(wing, junctionProfiles);
  let segments = [run];
  for (const profile of parentRidgeProfilesForWing(wing, junctionProfiles)) {
    segments = subtractInterval(
      segments,
      profile.cutoutCenter - RIDGE_VALLEY_CLEARANCE,
      profile.cutoutCenter + RIDGE_VALLEY_CLEARANCE
    );
  }
  return segments;
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
  const childJoined = childJoinProfilesForWing(wing, junctionProfiles).length > 0;

  for (const side of [-1, 1]) {
    const sideLabel = side < 0 ? 'North' : 'South';
    const underlay = buildGroup.getObjectByName(`SemanticRoofSlope${sideLabel}`);
    if (!underlay?.isMesh || !underlay.geometry) continue;

    // The integrated underlay already owns the exact cross-gable valley topology. The
    // interior liner must keep that same geometry instead of shortening the child wing
    // a second time. Pulling the joined liner back created a visible slot where exterior
    // thatch and course end-caps could be seen from inside on multi-wing roofs.
    const liner = new THREE.Mesh(underlay.geometry.clone(), linerMaterial);
    liner.name = `SemanticRoofInteriorLiner${sideLabel}`;
    liner.position.copy(underlay.position);
    liner.rotation.copy(underlay.rotation);
    liner.scale.copy(underlay.scale);
    liner.scale.y *= LINER_DEPTH_SCALE;
    liner.position.addScaledVector(slopeNormal(side, metrics.pitch), -LINER_INSET);
    liner.castShadow = false;
    liner.receiveShadow = true;
    liner.userData.semanticRoofInteriorLiner = true;
    liner.userData.semanticRoofInteriorJoinedSlope = underlay.userData?.semanticRoofJoinedSlope === true;
    liner.userData.semanticRoofInteriorJunctionCutout = underlay.userData?.semanticRoofJunctionCutout === true;
    liner.userData.semanticRoofInteriorJunctionAligned = (
      childJoined || underlay.userData?.semanticRoofJunctionCutout === true
    );
    liner.userData.semanticRoofInteriorJointSetback = false;
    liner.userData.semanticRoofInteriorShellContact = true;
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
    soffit.scale.y *= SOFFIT_DEPTH_SCALE;
    soffit.scale.z *= SOFFIT_RUN_SCALE;
    soffit.position
      .addScaledVector(slopeNormal(side, metrics.pitch), -SOFFIT_INSET)
      .addScaledVector(downslopeVector(side, metrics), SOFFIT_DOWNSLOPE_SHIFT);
    soffit.castShadow = false;
    soffit.receiveShadow = true;
    soffit.userData.semanticRoofInteriorSoffit = true;
    soffit.userData.semanticRoofInteriorThatchShield = true;
    soffit.userData.semanticRoofInteriorExtendedEaveShield = true;
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

const addInteriorFraming = (buildGroup, wing, junctionProfiles, metrics) => {
  const rafterRun = coreRunBounds(wing);
  const runLength = Math.max(0.1, rafterRun.max - rafterRun.min);
  const rafterStations = Math.max(3, Math.ceil(runLength / RAFTER_SPACING) + 1);
  const childJoined = childJoinProfilesForWing(wing, junctionProfiles).length > 0;
  let rafterCount = 0;
  let beamCount = 0;

  for (let index = 0; index < rafterStations; index += 1) {
    const x = rafterStations === 1
      ? (rafterRun.min + rafterRun.max) * 0.5
      : THREE.MathUtils.lerp(rafterRun.min, rafterRun.max, index / (rafterStations - 1));

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

  const ridgeSegments = interiorRidgeRunSegments(wing, junctionProfiles);
  for (const [segmentIndex, segment] of ridgeSegments.entries()) {
    const ridgeBeam = cylinderBetween(
      new THREE.Vector3(segment.min, metrics.ridgeY - 0.15, 0),
      new THREE.Vector3(segment.max, metrics.ridgeY - 0.15, 0),
      RIDGE_BEAM_RADIUS,
      ridgeSegments.length === 1
        ? 'SemanticRoofInteriorRidgeBeam'
        : `SemanticRoofInteriorRidgeBeam${segmentIndex + 1}`
    );
    if (!ridgeBeam) continue;
    ridgeBeam.userData.semanticRoofInteriorBeam = true;
    ridgeBeam.userData.semanticRoofInteriorRidgeBeam = true;
    ridgeBeam.userData.semanticRoofInteriorJointTrimmed = childJoined;
    ridgeBeam.userData.semanticRoofInteriorJunctionAligned = (
      childJoined || parentRidgeProfilesForWing(wing, junctionProfiles).length > 0
    );
    ridgeBeam.userData.semanticRoofInteriorRidgeRunMin = segment.min;
    ridgeBeam.userData.semanticRoofInteriorRidgeRunMax = segment.max;
    buildGroup.add(ridgeBeam);
    beamCount += 1;
  }

  const desiredTieCount = THREE.MathUtils.clamp(Math.floor(runLength / 2.35), 1, 3);
  for (let index = 0; index < desiredTieCount; index += 1) {
    const fraction = (index + 1) / (desiredTieCount + 1);
    const x = THREE.MathUtils.lerp(rafterRun.min, rafterRun.max, fraction);
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
 * Add an interior-only presentation layer to a completed semantic Roof wing. The
 * integrated structural underlay is the sole junction-topology authority: interior slope
 * liners clone it exactly, so parent valley cutouts and child penetration geometry meet
 * at the same seam instead of being shortened or masked by a second competing shape.
 * Exterior eave thatch is shielded from below by a deeper timber soffit that extends past
 * the fine straw tips. Decorative framing stays inside the occupied wing, while a joined
 * child ridge follows the canonical ridge penetration and a parent ridge is interrupted
 * only when a full-height cross-gable actually reaches it. Exposed gable infill receives
 * a BackSide timber lining. All added members remain visual only and do not participate
 * in support, collision, cost, save identity or demolition.
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
  wingRoot.userData.semanticRoofInteriorJointTrimCount = 0;
  wingRoot.userData.semanticRoofInteriorRafterCount = rafterCount;
  wingRoot.userData.semanticRoofInteriorBeamCount = beamCount;
  wingRoot.userData.semanticRoofInteriorThatchShielded = soffitCount > 0;
  wingRoot.userData.semanticRoofInteriorJunctionAligned = (
    childJoinProfilesForWing(wing, junctionProfiles).length > 0 ||
    (junctionProfiles ?? []).some(profile => profile.parentWingIndex === wing.index)
  );
  wingRoot.userData.semanticRoofInteriorJointTrimmed = false;

  return {
    linerCount,
    soffitCount,
    gableCount,
    jointTrimCount: 0,
    rafterCount,
    beamCount
  };
}
