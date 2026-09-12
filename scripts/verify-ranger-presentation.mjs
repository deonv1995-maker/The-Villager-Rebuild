import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RangerAppearancePresentation } from '../src/player/RangerAppearancePresentation.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const model = new THREE.Group();
const quiver = new THREE.Object3D();
quiver.name = 'Ranger_Quiver';
model.add(quiver);

const sourceGeometry = new THREE.BufferGeometry();
sourceGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.4, 1.2, -0.05,
  0.4, 1.2, -0.05,
  -0.4, 0.2, -0.3,
  0.4, 0.2, -0.3
], 3));
sourceGeometry.setIndex([0, 2, 1, 1, 2, 3]);
sourceGeometry.computeVertexNormals();

const cape = new THREE.Mesh(sourceGeometry, new THREE.MeshStandardMaterial());
cape.name = 'Ranger_Cape';
model.add(cape);

const root = new THREE.Group();
const player = {
  model,
  root,
  getPosition(target) {
    return target.copy(root.position);
  }
};

const originalHemZ = sourceGeometry.getAttribute('position').getZ(2);
const originalTop = new THREE.Vector3().fromBufferAttribute(sourceGeometry.getAttribute('position'), 0);
const presentation = new RangerAppearancePresentation({ player });

assert.equal(model.getObjectByName('Ranger_Quiver'), undefined, 'unused Ranger quiver should be detached');
assert.notEqual(cape.geometry, sourceGeometry, 'cape deformation should own a cloned geometry');
assert.equal(sourceGeometry.getAttribute('position').getZ(2), originalHemZ, 'source Ranger geometry must remain untouched');

root.rotation.y = 0.25;
for (let frame = 0; frame < 8; frame += 1) {
  root.position.z += 0.1;
  presentation.update(1 / 60);
}

const deformedPositions = cape.geometry.getAttribute('position');
const deformedTop = new THREE.Vector3().fromBufferAttribute(deformedPositions, 0);
const deformedHem = new THREE.Vector3().fromBufferAttribute(deformedPositions, 2);

assert.ok(deformedTop.distanceTo(originalTop) < 1e-6, 'cape shoulder vertices should remain pinned');
assert.ok(deformedHem.z < originalHemZ - 0.01, 'cape hem should settle into a visible trail under sustained movement');
assert.ok(presentation.trail > 0.05, 'sustained movement should build damped cape trail');
assert.ok(Math.abs(presentation.sideLag) > 0, 'turning should create lateral cape inertia');

const verticalLagBeforeJump = presentation.verticalLag;
root.position.y += 0.08;
presentation.update(1 / 60);
assert.ok(
  presentation.verticalLag < verticalLagBeforeJump,
  'upward Ranger motion should pull the cape response downward relative to its running state'
);

const toolPresentation = read('src/player/RangerToolPresentation.js');
const packageJson = JSON.parse(read('package.json'));
assert.ok(
  toolPresentation.includes("import { RangerAppearancePresentation } from './RangerAppearancePresentation.js';")
    && toolPresentation.includes('this.appearancePresentation = new RangerAppearancePresentation({ player });')
    && toolPresentation.includes('this.appearancePresentation.update(dt);'),
  'Ranger appearance presentation must stay wired into the existing player presentation update'
);
assert.ok(
  packageJson.scripts.check.includes('npm run verify:ranger-presentation'),
  'full repository check must include Ranger presentation regression coverage'
);

console.log('Ranger presentation regression checks passed.');
