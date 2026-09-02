import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { ConstructionTerrainAdaptationSystem } from '../src/world/ConstructionTerrainAdaptationSystem.js';

const nearlyEqual = (left, right, tolerance = 0.00001) => Math.abs(left - right) <= tolerance;

// Reproduce the production low-poly terrain condition: an 8 m patch with two
// segments gives 4 m render cells, which are wider than one split-log floor strip.
// Without render-cell-aware grading, a single untouched triangle can bridge across
// the floor and visually bury it even though the analytical terrain height is cut.
const group = new THREE.Group();
const geometry = new THREE.PlaneGeometry(8, 8, 2, 2);
geometry.rotateX(-Math.PI / 2);
const position = geometry.getAttribute('position');
const naturalHeightAt = x => x * 0.6;
for (let index = 0; index < position.count; index += 1) {
  position.setY(index, naturalHeightAt(position.getX(index)));
}
geometry.computeVertexNormals();
const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
mesh.name = 'terrain-chunk-test-slope';
group.add(mesh);

const terrain = { heightAt: naturalHeightAt };
const adaptation = new ConstructionTerrainAdaptationSystem({
  group,
  terrain,
  chunks: { chunkSize: 8 }
});
assert.equal(adaptation.captureTerrainMeshes(), 1, 'Slope regression needs one captured low-poly terrain mesh');

const floorCenterX = 2;
const floorCenterZ = 2;
const floorBaseY = naturalHeightAt(floorCenterX) + PHYSICAL_LOG.floorGroundClearance;
const floorTopY = floorBaseY + 0.028;
const cutY = floorTopY - PHYSICAL_LOG.floorTerrainSurfaceClearance;
const floor = {
  id: 1,
  mode: 'floor',
  active: true,
  x: floorCenterX,
  z: floorCenterZ,
  yaw: 0,
  baseY: floorBaseY,
  topY: floorTopY
};

assert.equal(adaptation.setFloors([floor]), true);
assert.ok(
  nearlyEqual(adaptation.heightAt(4, 2), cutY),
  'The uphill side of a low-poly render cell that crosses the floor must retreat to the floor cut plane'
);
assert.ok(
  nearlyEqual(adaptation.heightAt(0, 2), naturalHeightAt(0)),
  'Terrain below the floor datum must never be raised; the downhill side remains a deck edge'
);
assert.ok(
  nearlyEqual(adaptation.heightAt(10, 2), naturalHeightAt(10)),
  'Render-cell compensation must remain local instead of flattening distant uphill terrain'
);

let checkedHighSideVertices = 0;
for (let index = 0; index < position.count; index += 1) {
  const x = position.getX(index);
  const z = position.getZ(index);
  if (!nearlyEqual(x, 4) || ( !nearlyEqual(z, 0) && !nearlyEqual(z, 4) )) continue;
  checkedHighSideVertices += 1;
  assert.ok(
    position.getY(index) <= cutY + 0.00001,
    'Every coarse triangle vertex bordering the uphill floor cell must be lowered below the split-log walking face'
  );
  assert.ok(
    nearlyEqual(position.getY(index), adaptation.heightAt(x, z)),
    'Rendered terrain vertices and collision/vegetation construction height must share one shaped surface'
  );
}
assert.equal(checkedHighSideVertices, 2, 'Regression fixture must inspect both uphill vertices of the floor-crossing cell');

assert.equal(adaptation.clear(), true);
for (let index = 0; index < position.count; index += 1) {
  assert.ok(
    nearlyEqual(position.getY(index), naturalHeightAt(position.getX(index))),
    'Removing the floor must restore the immutable natural terrain mesh exactly'
  );
}

console.log('Slope split-log floor terrain shaping and reversible low-poly grading verified.');
