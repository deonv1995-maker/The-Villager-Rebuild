import * as THREE from 'three';
import {
  semanticRoofRise,
  semanticRoofWallSeatDrop
} from './SemanticRoofZoneGeometry.js';

const INTERIOR_LINER_COLOR = 0x93623b;
const INTERIOR_GABLE_COLOR = 0x875634;
const INTERIOR_FRAME_COLOR = 0x51351f;
const RAFTER_SPACING = 0.86;
const RAFTER_RADIUS = 0.055;
const RIDGE_BEAM_RADIUS = 0.082;
const TIE_BEAM_RADIUS = 0.06;
const LINER_INSET = 0.072;

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

const localRunBounds = (wing, junctionProfiles) => {
  const length = wing.ridgeAxis === 'z' ? wing.depth : wing.width;
  let min = -length * 0.5;
  let max = length * 0.5;

  for (const profile of junctionProfiles ?? []) {
    if (profile.childWingIndex !== wing.index) continue;
    if (profile.childLocalJoinEnd === 'negative') min -= profile.joinInset;
    if (profile.childLocalJoinEnd === 'positive') max += profile.joinInset;
  }
  return { min, max };
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

const addInteriorLiners = (buildGroup, wing, metrics) => {
  let count = 0;
  for (const side of [-1, 1]) {
    const sideLabel = side < 0 ? 'North' : 'South';
    const underlay = buildGroup.getObjectByName(`SemanticRoofSlope${sideLabel}`);
    if (!underlay?.isMesh || !underlay.geometry) continue;

    const liner = new THREE.Mesh(underlay.geometry.clone(), linerMaterial);
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
    buildGroup.add(liner);
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
  const run = localRunBounds(wing, junctionProfiles);
  const runLength = Math.max(0.1, run.max - run.min);
  const rafterStations = Math.max(3, Math.ceil(runLength / RAFTER_SPACING) + 1);
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
      buildGroup.add(rafter);
      rafterCount += 1;
    }
  }

  const ridgeBeam = cylinderBetween(
    new THREE.Vector3(run.min - 0.04, metrics.ridgeY - 0.15, 0),
    new THREE.Vector3(run.max + 0.04, metrics.ridgeY - 0.15, 0),
    RIDGE_BEAM_RADIUS,
    'SemanticRoofInteriorRidgeBeam'
  );
  if (ridgeBeam) {
    ridgeBeam.userData.semanticRoofInteriorBeam = true;
    ridgeBeam.userData.semanticRoofInteriorRidgeBeam = true;
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
    buildGroup.add(tie);
    beamCount += 1;
  }

  return { rafterCount, beamCount };
};

/**
 * Add an interior-only presentation layer to a completed semantic Roof wing. The source
 * underlay geometry is cloned only after junction integration, so the timber lining keeps
 * the same child-wing extensions and parent valley cutouts instead of sealing real roof
 * joins. Exposed gable infill receives a BackSide timber lining, closing the view from the
 * room without making the exterior facade render through the building. Rafters, ridge beam
 * and sparse tie beams are decorative only: they do not participate in support, collision,
 * cost, save identity, placement or demolition ownership.
 */
export function applySemanticRoofInteriorFinish(wingRoot, wing, {
  junctionProfiles = []
} = {}) {
  if (!wingRoot || !wing) return { linerCount: 0, gableCount: 0, rafterCount: 0, beamCount: 0 };
  const buildGroup = buildGroupForWing(wingRoot, wing);
  if (!buildGroup) return { linerCount: 0, gableCount: 0, rafterCount: 0, beamCount: 0 };

  const metrics = metricsForWing(wing);
  const linerCount = addInteriorLiners(buildGroup, wing, metrics);
  const gableCount = addInteriorGables(buildGroup);
  const { rafterCount, beamCount } = addInteriorFraming(
    buildGroup,
    wing,
    junctionProfiles,
    metrics
  );

  wingRoot.userData.semanticRoofInteriorFinished = true;
  wingRoot.userData.semanticRoofInteriorLinerCount = linerCount;
  wingRoot.userData.semanticRoofInteriorGableCount = gableCount;
  wingRoot.userData.semanticRoofInteriorRafterCount = rafterCount;
  wingRoot.userData.semanticRoofInteriorBeamCount = beamCount;

  return { linerCount, gableCount, rafterCount, beamCount };
}
