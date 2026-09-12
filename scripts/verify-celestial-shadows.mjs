import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CELESTIAL_SHADOWS } from '../src/data/CelestialShadowDefinitions.js';
import { CELESTIAL_PRESENTATION } from '../src/data/CelestialDefinitions.js';
import { CelestialShadowSystem } from '../src/rendering/CelestialShadowSystem.js';
import { dominantCelestialDirectionAt } from '../src/rendering/CelestialOrbit.js';
import { DayNightLightingSystem } from '../src/rendering/DayNightLightingSystem.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

assert.equal(CELESTIAL_SHADOWS.mapSize, 512, 'Mobile celestial shadows must stay on a 512px map');
assert.ok(CELESTIAL_SHADOWS.refreshHz <= 10, 'Shadow map refreshes must remain capped at 10 Hz');
assert.ok(
  CELESTIAL_SHADOWS.cameraHalfSize * 2 <= 60,
  'Shadow coverage must remain local rather than rendering the whole island'
);

const noonDirection = dominantCelestialDirectionAt(12 * 60);
const midnightDirection = dominantCelestialDirectionAt(0);
assert.ok(noonDirection.y > 0.999, 'Daytime celestial key light must follow the sun');
assert.ok(midnightDirection.y > 0.999, 'Night celestial key light must flip to the moon above the horizon');

let nowMs = 0;
const scene = new THREE.Scene();
const opaque = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
opaque.name = 'test-building-wall';
scene.add(opaque);

const transparent = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
);
transparent.name = 'test-transparent-effect';
scene.add(transparent);

const instanced = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x55aa55 }),
  4
);
instanced.name = 'forest-tree-batch-test';
instanced.receiveShadow = true;
scene.add(instanced);

const sun = new THREE.DirectionalLight(0xffffff, 1);
const skyFill = new THREE.DirectionalLight(0xffffff, 0.4);
scene.add(sun, sun.target, skyFill);
const renderer = {
  toneMappingExposure: 1,
  shadowMap: {
    enabled: false,
    type: THREE.BasicShadowMap,
    autoUpdate: true,
    needsUpdate: false
  }
};
const sceneSystem = {
  scene,
  renderer,
  lighting: {
    sun,
    skyFill,
    hemi: new THREE.HemisphereLight(0xffffff, 0x222222, 1),
    ambient: new THREE.AmbientLight(0xffffff, 0.1)
  }
};

const shadows = new CelestialShadowSystem({ sceneSystem, now: () => nowMs });
assert.equal(renderer.shadowMap.enabled, true, 'Celestial shadows must enable the renderer shadow path');
assert.equal(renderer.shadowMap.type, THREE.PCFShadowMap, 'Low-cost shadows must use PCF rather than the softer expensive path');
assert.equal(renderer.shadowMap.autoUpdate, false, 'Shadow maps must not redraw every rendered frame');
assert.equal(sun.castShadow, true, 'Exactly the shared celestial key light must cast the shadow map');
assert.equal(skyFill.castShadow, false, 'Sky fill must not create a second shadow map');
assert.equal(sun.shadow.mapSize.width, CELESTIAL_SHADOWS.mapSize);
assert.equal(sun.shadow.mapSize.height, CELESTIAL_SHADOWS.mapSize);
assert.equal(sun.shadow.camera.left, -CELESTIAL_SHADOWS.cameraHalfSize);
assert.equal(sun.shadow.camera.right, CELESTIAL_SHADOWS.cameraHalfSize);
assert.equal(opaque.castShadow, true, 'Opaque gameplay/building meshes must automatically cast local shadows');
assert.equal(opaque.receiveShadow, true, 'Opaque gameplay/building meshes must automatically receive local shadows');
assert.equal(transparent.castShadow, false, 'Transparent effects must stay out of the shadow pass');
assert.equal(instanced.castShadow, false, 'Large instanced vegetation batches must not cast expensive shadow geometry');
assert.equal(instanced.receiveShadow, false, 'Large instanced vegetation batches must not pay the shadow receive cost');

shadows.apply({ minuteOfDay: 12 * 60 });
renderer.shadowMap.needsUpdate = false;
nowMs = 50;
shadows.apply({ minuteOfDay: 12 * 60 });
assert.equal(renderer.shadowMap.needsUpdate, false, 'Shadow map must not refresh faster than the configured cap');
nowMs = 101;
shadows.apply({ minuteOfDay: 12 * 60 });
assert.equal(renderer.shadowMap.needsUpdate, true, 'Shadow map must refresh after the throttled interval');

const lateMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x8a643f })
);
lateMesh.name = 'late-built-panel';
scene.add(lateMesh);
nowMs = 1100;
shadows.apply({ minuteOfDay: 12 * 60 });
assert.equal(lateMesh.castShadow, true, 'New construction must join the shadow pass without construction-system coupling');
assert.equal(lateMesh.receiveShadow, true);

const focus = new THREE.Vector3(14, 3, -7);
const lighting = new DayNightLightingSystem({
  sceneSystem,
  focusProvider: target => target.copy(focus)
});
lighting.apply({ minuteOfDay: 0 });
const midnightExpected = dominantCelestialDirectionAt(0);
const midnightActual = sun.position.clone().sub(sun.target.position).normalize();
assert.ok(midnightActual.dot(midnightExpected) > 0.999, 'Moonlight direction must match the visible moon orbit at midnight');
assert.ok(sun.target.position.distanceTo(focus) < 0.000001, 'Local shadow/light focus must follow the Ranger position');
assert.ok(
  Math.abs(sun.position.distanceTo(sun.target.position) - CELESTIAL_PRESENTATION.lightDistance) < 0.000001,
  'Local celestial key light must retain the configured light distance'
);

const main = read('src/main.js');
const sceneSource = read('src/rendering/SceneSystem.js');
const packageJson = JSON.parse(read('package.json'));
const checks = [
  ['gameplay boot creates one celestial shadow system', main.includes('new CelestialShadowSystem({ sceneSystem: game.sceneSystem })')],
  ['world time fans into shadows after lighting and visible celestial bodies', main.includes('presentations: [dayNightLighting, celestialBodies, celestialShadows]')],
  ['day/night lighting receives Ranger focus for a local shadow camera', main.includes('focusProvider: lightFocus')],
  ['SceneSystem owns the directional-light target rather than the shadow feature creating another light', sceneSource.includes("sun.target.name = 'celestial-key-target'") && sceneSource.includes('this.scene.add(sun, sun.target)')],
  ['full check suite includes celestial shadow regression', packageJson.scripts.check.includes('npm run verify:celestial-shadows')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failed > 0) process.exitCode = 1;
else console.log(`Low-cost celestial shadow regression checks passed (${checks.length} integration contracts).`);
