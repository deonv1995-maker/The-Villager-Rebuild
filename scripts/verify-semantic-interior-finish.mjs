import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWallPanelVisual } from '../src/world/PanelConstructionVisual.js';
import { createSemanticRoofFootprintVisual } from '../src/world/SemanticRoofFootprintGeometry.js';
import { planSemanticRoofFootprint } from '../src/world/SemanticRoofFootprintPlanner.js';
import { planSemanticRoofJunctionProfiles } from '../src/world/SemanticRoofJunctionGeometry.js';

const objectsWith = (root, predicate) => {
  const matches = [];
  root.traverse(object => {
    if (predicate(object)) matches.push(object);
  });
  return matches;
};

const near = (left, right, epsilon = 0.000001) => Math.abs(left - right) <= epsilon;

for (const variant of ['solid', 'door', 'window']) {
  const wall = createWallPanelVisual(`Interior${variant}`, variant);
  assert.equal(wall.userData.wallFlatFaceInward, true, `${variant} wall must preserve inward split-face orientation`);
  assert.equal(wall.userData.semanticWallInteriorWood, true, `${variant} wall must expose the timber interior finish`);
  assert.equal(
    wall.userData.semanticWallInteriorWoodUnifiedTone,
    true,
    `${variant} wall must use the coherent interior timber-tone contract`
  );
  assert.ok(
    wall.userData.semanticWallInteriorWoodFaceCount > 0,
    `${variant} wall must style at least one inward split-log face`
  );
  const faces = objectsWith(wall, object => object.userData?.semanticWallInteriorWoodFace === true);
  assert.equal(
    faces.length,
    wall.userData.semanticWallInteriorWoodFaceCount,
    `${variant} wall timber-face diagnostics must match the actual presentation meshes`
  );
  assert.ok(
    faces.every(face => face.material?.isMeshStandardMaterial === true),
    `${variant} wall timber finish must remain a normal lit material rather than a UI/preview shader`
  );

  const seams = objectsWith(wall, object => object.userData?.semanticWallInteriorCourseSeam === true);
  assert.equal(
    seams.length,
    wall.userData.semanticWallInteriorCourseSeamCount,
    `${variant} wall course-seam diagnostics must match the finished interior geometry`
  );
  assert.equal(
    seams.length,
    faces.length,
    `${variant} wall must keep one subtle interior course seam per split-log face`
  );
  assert.equal(
    wall.userData.semanticWallInteriorCourseDefinition,
    true,
    `${variant} wall must advertise readable interior log-course definition`
  );
}

const solidWall = createWallPanelVisual('InteriorSolidToneProbe', 'solid');
const solidFaces = objectsWith(
  solidWall,
  object => object.userData?.semanticWallInteriorWoodFace === true
);
const solidTones = new Set(solidFaces.map(face => face.userData.semanticWallInteriorWoodTone));
const solidColors = new Set(solidFaces.map(face => face.material?.color?.getHex?.()));
assert.equal(solidTones.size, 1, 'Solid wall rows must use one coherent timber tone instead of patchwork row colours');
assert.equal(solidColors.size, 1, 'All inward wall faces must share the same lit timber material colour');

const simplePlan = planSemanticRoofFootprint([
  { x: 0, z: 0 },
  { x: 1, z: 0 }
]);
assert.ok(simplePlan, 'Simple two-cell footprint must produce a semantic roof plan');
const simpleRoof = createSemanticRoofFootprintVisual('InteriorRoofProbe', { plan: simplePlan });
assert.equal(simpleRoof.userData.semanticRoofInteriorFinished, true);
assert.equal(simpleRoof.userData.interiorTimberFinish, true);
assert.equal(simpleRoof.userData.interiorThatchShielded, true);
assert.equal(simpleRoof.userData.semanticRoofInteriorLinerCount, 2, 'One gable wing needs one interior liner per slope');
assert.ok(simpleRoof.userData.semanticRoofInteriorSoffitCount >= 2, 'Each exposed eave must receive a timber soffit under the exterior thatch');
assert.equal(simpleRoof.userData.semanticRoofInteriorGableCount, 2, 'Both exposed gable ends must receive inside-facing timber closure');
assert.ok(simpleRoof.userData.semanticRoofInteriorRafterCount >= 6, 'Interior roof must expose repeated decorative rafters');
assert.ok(simpleRoof.userData.semanticRoofInteriorBeamCount >= 2, 'Interior roof must expose a ridge beam plus at least one tie beam');
assert.equal(simpleRoof.userData.semanticRoofInteriorThatchShielded, true, 'Finished roof must mark exterior thatch as shielded from the occupied interior');

const liners = objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorLiner === true);
assert.equal(liners.length, 2);
assert.ok(
  liners.every(liner => liner.material?.side === THREE.FrontSide),
  'Slope lining must render as an inside ceiling surface without showing through the exterior'
);
assert.ok(
  liners.every(liner => liner.userData.semanticRoofInteriorShellContact === true),
  'Interior slope lining must remain close enough to the canonical shell to hide course end-caps at roof seams'
);
const soffits = objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorSoffit === true);
const exteriorEaves = objectsWith(simpleRoof, object => (
  object.userData?.semanticRoofExteriorEave === true &&
  object.name?.startsWith('SemanticRoofThatchEave')
));
assert.equal(
  soffits.length,
  exteriorEaves.length,
  'Every exterior thatch eave extension must have a matching interior timber soffit shield'
);
assert.ok(
  soffits.every(soffit => soffit.userData.semanticRoofInteriorThatchShield === true),
  'Interior eave soffits must explicitly own the thatch-occlusion presentation contract'
);
assert.ok(
  soffits.every(soffit => soffit.userData.semanticRoofInteriorExtendedEaveShield === true),
  'Interior eave soffits must extend under the exposed straw-tip run rather than stopping at the solid course box'
);
const interiorGables = objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorGable === true);
assert.equal(interiorGables.length, 2);
assert.ok(
  interiorGables.every(gable => gable.material?.side === THREE.BackSide),
  'Gable lining must render only toward the room so exterior gable ownership stays unchanged'
);
assert.ok(
  objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorRafter === true).length >= 6,
  'Decorative interior rafters must be present as explicit timber members'
);
assert.ok(
  objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorRidgeBeam === true).length >= 1,
  'Decorative interior framing must include a ridge beam'
);
assert.ok(
  objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorTieBeam === true).length >= 1,
  'Decorative interior framing must include at least one tie beam'
);

const joinedPlan = planSemanticRoofFootprint([
  { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
  { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 },
  { x: 1, z: 2 }
]);
assert.ok(joinedPlan?.wings?.length > 1, 'Cross-gable probe must create multiple semantic roof wings');
const joinedProfiles = planSemanticRoofJunctionProfiles(joinedPlan);
assert.ok(joinedProfiles.length > 0, 'Cross-gable probe must expose at least one integrated roof junction');
const joinedRoof = createSemanticRoofFootprintVisual('JoinedInteriorRoofProbe', { plan: joinedPlan });
const joinedLiners = objectsWith(joinedRoof, object => object.userData?.semanticRoofInteriorLiner === true);
assert.equal(
  joinedLiners.length,
  joinedPlan.wings.length * 2,
  'Every joined wing must retain two inside ceiling liners'
);
assert.ok(
  joinedLiners.some(liner => liner.userData.semanticRoofInteriorJunctionCutout === true),
  'Parent interior lining must inherit the real valley cutout rather than sealing the joined roof'
);
assert.ok(
  joinedLiners.some(liner => liner.userData.semanticRoofInteriorJoinedSlope === true),
  'Child interior lining must still derive from the canonical joined slope geometry'
);

const joinedProfile = joinedProfiles[0];
const childWing = joinedPlan.wings[joinedProfile.childWingIndex];
const childRoot = joinedRoof.children.find(child => (
  child.userData?.semanticRoofWingId === childWing.id
));
assert.ok(childRoot, 'Joined child roof wing must remain addressable in the finished footprint');
assert.equal(
  childRoot.userData.semanticRoofInteriorJunctionAligned,
  true,
  'Joined child wing must advertise canonical interior-junction alignment'
);
assert.equal(
  childRoot.userData.semanticRoofInteriorJointTrimmed,
  false,
  'Joined child wing must not depend on a second seam-mask frame'
);
assert.equal(
  childRoot.userData.semanticRoofInteriorJointTrimCount,
  0,
  'Canonical junction alignment must retire the extra rake/top-plate seam masks'
);

const childLiners = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorLiner === true
);
assert.ok(
  childLiners.every(liner => liner.userData.semanticRoofInteriorJunctionAligned === true),
  'Both child ceiling liners must keep the canonical joined geometry'
);
assert.ok(
  childLiners.every(liner => liner.userData.semanticRoofInteriorJointSetback === false),
  'Joined child liners must not be shortened away from the structural valley'
);
const childCoreHalfLength = (
  childWing.ridgeAxis === 'z' ? childWing.depth : childWing.width
) * 0.5;
for (const liner of childLiners) {
  const sideLabel = liner.name.endsWith('North') ? 'North' : 'South';
  const underlay = childRoot.getObjectByName(`SemanticRoofSlope${sideLabel}`);
  assert.ok(underlay?.geometry, 'Joined child liner must retain its matching structural underlay source');
  liner.geometry.computeBoundingBox();
  underlay.geometry.computeBoundingBox();
  assert.ok(
    near(liner.geometry.boundingBox.min.x, underlay.geometry.boundingBox.min.x) &&
    near(liner.geometry.boundingBox.max.x, underlay.geometry.boundingBox.max.x),
    'Joined child liner must share the exact canonical run boundary with its structural slope'
  );
  const bound = joinedProfile.childLocalJoinEnd === 'negative'
    ? -liner.geometry.boundingBox.min.x
    : liner.geometry.boundingBox.max.x;
  assert.ok(
    bound > childCoreHalfLength + 0.05,
    'Joined child liner must continue through the old wall line to the real valley intersection'
  );
}

assert.equal(
  objectsWith(childRoot, object => object.userData?.semanticRoofInteriorJointTrim === true).length,
  0,
  'Joined roof interior must not add competing rake/top-plate cover geometry at the wall line'
);

const childRafters = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorRafter === true
);
const joinSign = joinedProfile.childLocalJoinEnd === 'negative' ? -1 : 1;
assert.ok(
  childRafters.every(rafter => (
    joinSign * rafter.position.x <= childCoreHalfLength + 0.000001
  )),
  'Child decorative rafters must remain within the occupied wing while the liner owns the valley penetration'
);

const childRidgeBeams = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorRidgeBeam === true
);
assert.ok(childRidgeBeams.length >= 1, 'Joined child roof must retain an interior ridge beam');
assert.ok(
  childRidgeBeams.every(beam => beam.userData.semanticRoofInteriorJunctionAligned === true),
  'Joined child ridge framing must follow the canonical penetration instead of stopping at the wall line'
);
const childRidgeJoinBound = joinedProfile.childLocalJoinEnd === 'negative'
  ? -Math.min(...childRidgeBeams.map(beam => beam.userData.semanticRoofInteriorRidgeRunMin))
  : Math.max(...childRidgeBeams.map(beam => beam.userData.semanticRoofInteriorRidgeRunMax));
assert.ok(
  childRidgeJoinBound >= childCoreHalfLength + Math.max(0, joinedProfile.joinInset - 0.05),
  'Joined child ridge beam must terminate at the real valley apex rather than exposing the exterior ridge bundle'
);

const multiWingPlan = planSemanticRoofFootprint([
  { x: 0, z: 0 }, { x: 2, z: 0 },
  { x: 0, z: 1 }, { x: 2, z: 1 },
  { x: 0, z: 2 }, { x: 1, z: 2 }, { x: 2, z: 2 }
]);
const multiWingProfiles = planSemanticRoofJunctionProfiles(multiWingPlan);
assert.ok(multiWingProfiles.length >= 2, 'Multi-wing courtyard probe must expose both child-to-parent roof junctions');
const multiWingRoof = createSemanticRoofFootprintVisual('MultiWingInteriorJunctionProbe', { plan: multiWingPlan });
assert.equal(
  objectsWith(multiWingRoof, object => object.userData?.semanticRoofInteriorJointTrim === true).length,
  0,
  'Multi-wing interiors must not accumulate overlapping seam-mask frames'
);
for (const profile of multiWingProfiles) {
  const wing = multiWingPlan.wings[profile.childWingIndex];
  const root = multiWingRoof.children.find(child => child.userData?.semanticRoofWingId === wing.id);
  assert.ok(root?.userData.semanticRoofInteriorJunctionAligned, 'Every joined child wing must use canonical interior-junction alignment');
  const wingLiners = objectsWith(root, object => object.userData?.semanticRoofInteriorLiner === true);
  assert.equal(wingLiners.length, 2, 'Every multi-wing child must retain both ceiling slopes');
  for (const liner of wingLiners) {
    const sideLabel = liner.name.endsWith('North') ? 'North' : 'South';
    const underlay = root.getObjectByName(`SemanticRoofSlope${sideLabel}`);
    liner.geometry.computeBoundingBox();
    underlay.geometry.computeBoundingBox();
    assert.ok(
      near(liner.geometry.boundingBox.min.x, underlay.geometry.boundingBox.min.x) &&
      near(liner.geometry.boundingBox.max.x, underlay.geometry.boundingBox.max.x),
      'Every multi-wing child liner must preserve its canonical valley boundary exactly'
    );
  }
}

assert.ok(
  objectsWith(joinedRoof, object => object.userData?.semanticRoofJunction === true).length === 0,
  'Interior framing must not reintroduce the retired horizontal seam-mask system'
);

console.log('Finished wall courses, canonical roof-junction liners, extended soffits and valley-aware interior framing verified');
