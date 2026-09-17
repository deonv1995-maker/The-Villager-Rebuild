import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { SPROUT_ARRIVAL } from '../src/data/SproutArrivalDefinitions.js';
import { SproutImpactCinematicEffects } from '../src/rendering/SproutImpactCinematicEffects.js';
import { TitleCelestialEvent } from '../src/startup/TitleCelestialEvent.js';
import { TITLE_SCENE } from '../src/startup/TitleSceneConfig.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const effectConfig = SPROUT_ARRIVAL.impactEffects;
assert.equal(effectConfig.shadowLight.mapSize, 512, 'Sprout cinematic shadow map must stay mobile-bounded at 512px');
assert.ok(effectConfig.shadowLight.refreshHz <= 10, 'Moving Sprout shadow refresh must remain capped at 10 Hz');
assert.ok(effectConfig.cameraShake.durationSeconds < 1, 'Impact shake must remain a short camera impulse');
assert.ok(effectConfig.dust.durationSeconds < 2, 'Impact dust must dissipate quickly rather than becoming a persistent world effect');

let shadowRefreshes = 0;
let cameraShake = null;
const scene = new THREE.Scene();
const renderer = { shadowMap: { needsUpdate: false } };
const game = {
  sceneSystem: {
    scene,
    renderer,
    triggerCameraShake(options) {
      cameraShake = options;
      return true;
    }
  },
  celestialShadows: {
    requestLightRefresh(light) {
      shadowRefreshes += 1;
      light.shadow.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      return true;
    }
  }
};

const effects = new SproutImpactCinematicEffects({ game });
const site = new THREE.Vector3(8, 2.5, -14);
const start = new THREE.Vector3(-12, 31, -2);
assert.equal(effects.begin({ site, position: start }), true);
const descentLight = scene.getObjectByName('sprout-incoming-shadow-light');
assert.ok(descentLight?.isSpotLight, 'Gameplay descent must use one directional local spotlight rather than a six-face point-light shadow');
assert.equal(descentLight.castShadow, true, 'Gameplay descent spotlight must cast moving environment shadows');
assert.equal(descentLight.shadow.autoUpdate, false, 'Gameplay descent shadow must use explicit bounded refreshes');
assert.equal(descentLight.shadow.mapSize.width, 512);
assert.equal(descentLight.shadow.mapSize.height, 512);
assert.ok(descentLight.target.position.distanceTo(new THREE.Vector3(site.x, site.y + 0.3, site.z)) < 1e-9);
assert.ok(shadowRefreshes >= 1, 'Starting the descent must request an initial shadow map refresh');

const moved = new THREE.Vector3(2, 17, -10);
effects.update(0.11);
effects.updateDescent(0.55, moved);
assert.ok(descentLight.position.distanceTo(moved) < 1e-9, 'Shadow light must follow the authoritative incoming object position');
assert.ok(shadowRefreshes >= 2, 'Moving light must refresh through the shared celestial shadow gate');

assert.equal(effects.triggerImpact(), true);
assert.equal(descentLight.visible, false, 'Shadow-casting descent light must switch off at ground contact');
const dust = scene.getObjectByName('sprout-impact-dust-burst');
assert.equal(dust.visible, true, 'Ground contact must emit a dust burst');
assert.deepEqual(cameraShake, effectConfig.cameraShake, 'Ground contact must trigger the centrally tuned camera impulse');
const dustBefore = dust.geometry.attributes.position.array.slice();
effects.update(0.2);
assert.notDeepEqual(
  Array.from(dust.geometry.attributes.position.array),
  Array.from(dustBefore),
  'Impact dust particles must expand away from the contact point'
);
effects.dispose();
assert.equal(descentLight.parent, null, 'Transient descent light must release cleanly');
assert.equal(dust.parent, null, 'Transient impact dust must release cleanly');

const titleScene = new THREE.Scene();
titleScene.background = new THREE.Color(0xaeddec);
titleScene.fog = new THREE.FogExp2(0xa9c7bc, 0.0043);
const titleRenderer = { toneMappingExposure: 1 };
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
const sun = new THREE.DirectionalLight(0xffffff, 1);
const ambient = new THREE.AmbientLight(0xffffff, 0.1);
const lightning = new THREE.DirectionalLight(0xffffff, 0);
const titleEvent = new TitleCelestialEvent({
  scene: titleScene,
  renderer: titleRenderer,
  hemi,
  sun,
  ambient,
  lightning
});

const entryIntro = TITLE_SCENE.shootingStarStart;
titleEvent.update(1 / 60, { active: true, introProgress: entryIntro });
const entryRing = titleScene.getObjectByName('title-sprout-atmosphere-entry-ring');
assert.ok(entryRing, 'Title star must expose a visible atmospheric entry ring');
assert.equal(entryRing.visible, true);
assert.ok(entryRing.position.distanceTo(titleEvent.shootingStarStart) < 1e-9, 'Atmospheric ring must remain anchored at the entry point');
const initialRingScale = entryRing.scale.x;
const initialRingOpacity = titleEvent.atmosphereEntryRingCore.material.opacity;

titleEvent.update(0.2, {
  active: true,
  introProgress: THREE.MathUtils.lerp(TITLE_SCENE.shootingStarStart, TITLE_SCENE.shootingStarEnd, 0.3)
});
assert.ok(entryRing.scale.x > initialRingScale, 'Atmospheric ring must expand as the star moves away');
assert.ok(titleEvent.atmosphereEntryRingCore.material.opacity < initialRingOpacity, 'Atmospheric ring must dissipate while expanding');
assert.ok(entryRing.position.distanceTo(titleEvent.shootingStarStart) < 1e-9, 'Atmospheric ring must not follow the falling star');

titleEvent.update(0.3, {
  active: true,
  introProgress: THREE.MathUtils.lerp(TITLE_SCENE.shootingStarStart, TITLE_SCENE.shootingStarEnd, 0.7)
});
assert.equal(entryRing.visible, false, 'Atmospheric entry ring must fully dissipate before the sighting ends');

const controllerSource = read('src/gameplay/SproutArrivalController.js');
const sceneSource = read('src/rendering/SceneSystem.js');
const shadowSource = read('src/rendering/CelestialShadowSystem.js');
const terrainSource = read('src/world/ExpandedIslandTerrainSystem.js');
const environmentSource = read('src/world/EnvironmentScatterSystem.js');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  [
    'Sprout arrival owns presentation sequencing without duplicating the crash trajectory',
    controllerSource.includes('new SproutImpactCinematicEffects({ game })') &&
      controllerSource.includes('this.crashSite.updateImpact(progress);') &&
      controllerSource.includes('this.impactEffects.updateDescent(progress, this.crashSite.incoming?.position);')
  ],
  [
    'impact completion drives dust and shake through the dedicated effect boundary',
    controllerSource.includes('this.crashSite.completeImpact();') &&
      controllerSource.includes('this.impactEffects.triggerImpact();')
  ],
  [
    'gameplay camera shake is temporary and restores the authored camera transform after rendering',
    sceneSource.includes('triggerCameraShake({') &&
      sceneSource.includes('this.camera.position.copy(this.cameraShakeBasePosition);') &&
      sceneSource.includes('this.camera.quaternion.copy(this.cameraShakeBaseQuaternion);')
  ],
  [
    'transient moving-light shadow refresh remains centralized in CelestialShadowSystem',
    shadowSource.includes('requestLightRefresh(light)') &&
      shadowSource.includes('light.shadow.needsUpdate = true;') &&
      shadowSource.includes('this.renderer.shadowMap.needsUpdate = true;')
  ],
  [
    'production trees cast and terrain receives the temporary falling-star shadow',
    environmentSource.includes('object.castShadow = true;') &&
      terrainSource.includes('mesh.receiveShadow = true;')
  ],
  [
    'full repository check suite includes falling-star cinematic regression',
    packageJson.scripts.check.includes('npm run verify:sprout-cinematic-impact')
  ]
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
else console.log(`Sprout falling-star cinematic regression checks passed (${checks.length} integration contracts).`);
