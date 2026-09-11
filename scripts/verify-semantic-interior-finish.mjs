import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWallPanelVisual } from '../src/world/PanelConstructionVisual.js';
import { createSemanticRoofFootprintVisual } from '../src/world/SemanticRoofFootprintGeometry.js';
import { planSemanticRoofFootprint } from '../src/world/SemanticRoofFootprintPlanner.js';

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
}

const solidWall = createWallPanelVisual('InteriorSolidToneProbe', 'solid');
const solidTones = new Set(
  objectsWith(solidWall, object => object.userData?.semanticWallInteriorWoodFace === true)
    .map(face => face.userData.semanticWallInteriorWoodTone)
);
assert.ok(solidTones.size >= 2, 'Solid wall rows must use subtle timber-tone variation instead of one flat beige face');

const simplePlan = planSemanticRoofFootprint([
  { x: 0, z: 0 },
  { x: 1, z: 0 }
]);
assert.ok(simplePlan, 'Simple two-cell footprint must produce a semantic roof plan');
const simpleRoof = createSemanticRoofFootprintVisual('InteriorRoofProbe', { plan: simplePlan });
assert.equal(simpleRoof.userData.semanticRoofInteriorFinished, true);
assert.equal(simpleRoof.userData.interiorTimberFinish, true);
assert.equal(simpleRoof.userData.semanticRoofInteriorLinerCount, 2, 'One gable wing needs one interior liner per slope');
assert.equal(simpleRoof.userData.semanticRoofInteriorGableCount, 2, 'Both exposed gable ends must receive inside-facing timber closure');
assert.ok(simpleRoof.userData.semanticRoofInteriorRafterCount >= 6, 'Interior roof must expose repeated decorative rafters');
assert.ok(simpleRoof.userData.semanticRoofInteriorBeamCount >= 2, 'Interior roof must expose a ridge beam plus at least one tie beam');

const liners = objectsWith(simpleRoof, object => object.userData?.semanticRoofInteriorLiner === true);
assert.equal(liners.length, 2);
assert.ok(
  liners.every(liner => liner.material?.side === THREE.FrontSide),
  'Slope lining must render as an inside ceiling surface without showing through the exterior'
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
  'Child interior lining must inherit the structural slope extension into the parent roof'
);
assert.ok(
  objectsWith(joinedRoof, object => object.userData?.semanticRoofJunction === true).length === 0,
  'Interior framing must not reintroduce the retired horizontal seam-mask system'
);

console.log('Semantic roof timber lining/rafters and warm wood wall interiors verified');
