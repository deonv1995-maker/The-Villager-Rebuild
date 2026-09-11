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
  childRoot.userData.semanticRoofInteriorJointTrimmed,
  true,
  'Joined child wing must advertise trimmed interior presentation at the roof seam'
);
assert.ok(
  childRoot.userData.semanticRoofInteriorJointTrimCount >= 3,
  'Joined child wing must frame the open roof seam with two rakes and one top plate'
);

const childLiners = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorLiner === true
);
assert.ok(
  childLiners.every(liner => liner.userData.semanticRoofInteriorJointSetback === true),
  'Both child ceiling liners must be set back from the exterior roof intersection'
);
const childCoreHalfLength = (
  childWing.ridgeAxis === 'z' ? childWing.depth : childWing.width
) * 0.5;
for (const liner of childLiners) {
  liner.geometry.computeBoundingBox();
  const bound = joinedProfile.childLocalJoinEnd === 'negative'
    ? -liner.geometry.boundingBox.min.x
    : liner.geometry.boundingBox.max.x;
  assert.ok(
    bound <= childCoreHalfLength + Math.max(0, joinedProfile.joinInset - 0.08),
    'Child interior liner must terminate before the exterior joined-slope endpoint'
  );
}

const childJointTrim = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorJointTrim === true
);
assert.ok(
  childJointTrim.length >= 3,
  'Joined child roof must expose explicit timber trim around the interior opening'
);
assert.ok(
  childJointTrim.every(trim => trim.userData.semanticRoofInteriorJointThatchShield === true),
  'Joined seam trim must explicitly shield exterior straw from the interior view'
);

const childRafters = objectsWith(
  childRoot,
  object => object.userData?.semanticRoofInteriorRafter === true
);
const joinSign = joinedProfile.childLocalJoinEnd === 'negative' ? -1 : 1;
assert.ok(
  childRafters.every(rafter => (
    joinSign * rafter.position.x <= childCoreHalfLength - 0.05
  )),
  'Child decorative rafters must stay inside the joined wall line instead of projecting through the parent roof'
);
assert.ok(
  objectsWith(childRoot, object => object.userData?.semanticRoofInteriorRidgeBeam === true)
    .every(beam => beam.userData.semanticRoofInteriorJointTrimmed === true),
  'Joined child ridge beams must use the trimmed interior framing run'
);

assert.ok(
  objectsWith(joinedRoof, object => object.userData?.semanticRoofJunction === true).length === 0,
  'Interior framing must not reintroduce the retired horizontal seam-mask system'
);

console.log('Finished wall log courses, timber roof soffits and cleanly shielded semantic roof interiors verified');
