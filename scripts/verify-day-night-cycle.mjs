import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { WorldTimeRuntime } from '../src/core/WorldTimeRuntime.js';
import { WorldTimeSystem, worldTimePhaseAt } from '../src/core/WorldTimeSystem.js';
import { CELESTIAL_PRESENTATION } from '../src/data/CelestialDefinitions.js';
import { WORLD_TIME } from '../src/data/WorldTimeDefinitions.js';
import {
  UNDERGROUND_LIGHTING,
  undergroundDarknessAtDepth
} from '../src/data/UndergroundLightingDefinitions.js';
import { CelestialBodySystem } from '../src/rendering/CelestialBodySystem.js';
import { celestialDirectionAt } from '../src/rendering/CelestialOrbit.js';
import { DayNightLightingSystem } from '../src/rendering/DayNightLightingSystem.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const nearlyEqual = (left, right, epsilon = 0.000001) => Math.abs(left - right) <= epsilon;

assert.equal(WORLD_TIME.startDay, 1, 'New games must begin on Day 1');
assert.equal(WORLD_TIME.startMinuteOfDay, 4 * 60 + 30, 'New games must begin at 04:30 in the final dark stretch before dawn');
assert.equal(WORLD_TIME.legacySaveFallbackMinuteOfDay, 8 * 60, 'Legacy saves without world time must retain the 08:00 fallback');
assert.equal(WORLD_TIME.realSecondsPerDay, 24 * 60, 'A complete game day must take 24 real minutes');
assert.equal(worldTimePhaseAt(4 * 60 + 59), 'night');
assert.equal(worldTimePhaseAt(5 * 60), 'dawn');
assert.equal(worldTimePhaseAt(7 * 60), 'day');
assert.equal(worldTimePhaseAt(17 * 60 + 30), 'dusk');
assert.equal(worldTimePhaseAt(20 * 60), 'night');
assert.ok(CELESTIAL_PRESENTATION.sun.radius >= 15, 'Sun presentation must remain visibly enlarged');
assert.ok(CELESTIAL_PRESENTATION.moon.radius >= 12, 'Moon presentation must remain visibly enlarged');
assert.ok(CELESTIAL_PRESENTATION.sun.rays?.count >= 8, 'Sun must retain a readable low-cost ray treatment');
assert.ok(CELESTIAL_PRESENTATION.moon.surfaceMarks?.length >= 4, 'Moon must retain procedural surface markings');

const time = new WorldTimeSystem();
assert.deepEqual(
  { day: time.getSnapshot().day, time: time.getSnapshot().displayTime, phase: time.getSnapshot().phase },
  { day: 1, time: '04:30', phase: 'night' }
);
time.update(60);
assert.equal(time.getSnapshot().displayTime, '05:30', 'One real minute must advance one in-game hour at the baseline scale');
assert.equal(time.getSnapshot().phase, 'dawn', 'The opening night must naturally progress into dawn shortly after gameplay begins');

const transitions = [];
const unsubscribe = time.subscribe(event => transitions.push(event));
time.setTime({ day: 1, minuteOfDay: 18 * 60 });
assert.equal(time.getSnapshot().phase, 'dusk');
assert.equal(transitions.at(-1)?.current?.phase, 'dusk', 'Phase changes must be observable without UI coupling');
unsubscribe();

time.setTime({ day: 1, minuteOfDay: 23 * 60 + 59 });
time.update(2);
assert.equal(time.getSnapshot().day, 2, 'World time must roll into the next day');
assert.equal(time.getSnapshot().displayTime, '00:01');

const captured = time.captureState();
const restored = new WorldTimeSystem();
assert.equal(restored.restoreState(captured), true, 'Saved world time must restore');
assert.equal(restored.getSnapshot().day, 2);
assert.equal(restored.getSnapshot().displayTime, '00:01');
const fallback = new WorldTimeSystem();
assert.equal(fallback.restoreState(null), false, 'Missing world-time state must not fabricate a restored clock');
assert.equal(fallback.getSnapshot().displayTime, '04:30', 'The world-time default must remain the new-game pre-dawn narrative start');

const sunrise = celestialDirectionAt(6 * 60);
const noon = celestialDirectionAt(12 * 60);
const sunset = celestialDirectionAt(18 * 60);
const midnight = celestialDirectionAt(0);
const midnightMoon = celestialDirectionAt(0, { moon: true });
assert.ok(Math.abs(sunrise.y) < 0.000001, 'Sun must meet the horizon around 06:00');
assert.ok(noon.y > 0.999, 'Sun must be highest around 12:00');
assert.ok(Math.abs(sunset.y) < 0.000001, 'Sun must meet the opposite horizon around 18:00');
assert.ok(midnight.y < -0.999, 'Sun must be below the world around midnight');
assert.ok(midnightMoon.y > 0.999, 'Moon must be highest around midnight');
assert.ok(
  celestialDirectionAt(9 * 60).dot(celestialDirectionAt(9 * 60, { moon: true })) < -0.999,
  'Moon must remain opposite the sun so the sky acts as a readable clock'
);

function makeSceneSystem() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaeddec);
  scene.fog = new THREE.FogExp2(0xa9c7bc, 0.0043);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000);
  camera.position.set(3, 7, -4);
  return {
    scene,
    camera,
    renderer: { toneMappingExposure: 1.06 },
    lighting: {
      hemi: new THREE.HemisphereLight(0xe7f4f7, 0x42533c, 2.2),
      sun: new THREE.DirectionalLight(0xffe3b4, 2.85),
      skyFill: new THREE.DirectionalLight(0x8fc1d4, 0.48),
      ambient: new THREE.AmbientLight(0xffffff, 0.12)
    }
  };
}

const sceneSystem = makeSceneSystem();
const lighting = new DayNightLightingSystem({ sceneSystem });
lighting.apply({ minuteOfDay: 12 * 60 });
const daylightSun = sceneSystem.lighting.sun.intensity;
const daylightSky = sceneSystem.scene.background.r + sceneSystem.scene.background.g + sceneSystem.scene.background.b;
lighting.apply({ minuteOfDay: 0 });
const midnightSun = sceneSystem.lighting.sun.intensity;
const midnightSky = sceneSystem.scene.background.r + sceneSystem.scene.background.g + sceneSystem.scene.background.b;
assert.ok(daylightSun > midnightSun * 10, 'Sun contribution must fall substantially at night');
assert.ok(daylightSky > midnightSky, 'Sky presentation must become visibly darker at night');
assert.ok(sceneSystem.lighting.hemi.intensity > 0, 'Night must retain playable fill lighting');
assert.ok(sceneSystem.lighting.skyFill.intensity > 0, 'Night must retain cool sky fill rather than becoming pitch black');

assert.equal(undergroundDarknessAtDepth(0), 0, 'surface lighting must remain unchanged');
assert.equal(
  undergroundDarknessAtDepth(UNDERGROUND_LIGHTING.fullDarknessDepth),
  1,
  'deep cave lighting must reach the configured darkness floor'
);
const caveSceneSystem = makeSceneSystem();
const caveLighting = new DayNightLightingSystem({
  sceneSystem: caveSceneSystem,
  focusProvider: target => target.set(0, -12, 0),
  undergroundDepthProvider: () => UNDERGROUND_LIGHTING.fullDarknessDepth + 4
});
caveLighting.apply({ minuteOfDay: 12 * 60 });
assert.ok(
  caveSceneSystem.lighting.sun.intensity < daylightSun * 0.03,
  'direct daylight must be almost absent in deep cave air'
);
assert.ok(
  caveSceneSystem.lighting.hemi.intensity < 0.2,
  'hemisphere daylight must not keep deep caves evenly lit'
);
assert.ok(
  caveSceneSystem.lighting.ambient.intensity < 0.02,
  'deep caves must depend on local light sources rather than global ambient fill'
);

lighting.apply({ minuteOfDay: 9 * 60 });
const expectedLightDirection = celestialDirectionAt(9 * 60);
const actualLightDirection = sceneSystem.lighting.sun.position.clone().sub(sceneSystem.lighting.sun.target.position).normalize();
assert.ok(
  actualLightDirection.dot(expectedLightDirection) > 0.999,
  'Directional sunlight must use the same visible sun orbit while the sun is above the horizon'
);

const celestialScene = makeSceneSystem();
const celestialBodies = new CelestialBodySystem({ sceneSystem: celestialScene });
celestialBodies.apply({ day: 1, minuteOfDay: 12 * 60 });
assert.equal(celestialBodies.sun.root.visible, true, 'Sun must be visible at midday');
assert.equal(celestialBodies.moon.root.visible, false, 'Moon must be below the horizon at midday');
assert.ok(
  nearlyEqual(celestialBodies.sun.root.position.distanceTo(celestialScene.camera.position), CELESTIAL_PRESENTATION.orbitRadius, 0.001),
  'Celestial bodies must stay at a stable sky distance around the moving camera'
);
assert.equal(celestialBodies.sun.bodyMaterial.fog, false, 'Sun must not disappear into world fog');
assert.equal(celestialBodies.sun.bodyMaterial.depthTest, true, 'Terrain and mountains must be able to occlude the low sun');
assert.ok(celestialBodies.sun.rays, 'Sun visual must expose its procedural rays');
const initialRayRotation = celestialBodies.sun.rays.mesh.rotation.z;
const initialRayOpacity = celestialBodies.sun.rays.material.opacity;
celestialBodies.apply({ day: 1, minuteOfDay: 12 * 60 + 30 });
assert.notEqual(celestialBodies.sun.rays.mesh.rotation.z, initialRayRotation, 'Sun rays must rotate gently as shared world time advances');
assert.notEqual(celestialBodies.sun.rays.material.opacity, initialRayOpacity, 'Sun rays must breathe subtly without a separate animation loop');

celestialBodies.apply({ day: 1, minuteOfDay: 0 });
assert.equal(celestialBodies.sun.root.visible, false, 'Sun must be below the horizon at midnight');
assert.equal(celestialBodies.moon.root.visible, true, 'Moon must be visible at midnight');
assert.ok(celestialBodies.moon.bodyMaterial.opacity > 0.99, 'Moon must be fully readable when high in the night sky');
assert.equal(
  celestialBodies.moon.surfaceMarks?.group.children.length,
  CELESTIAL_PRESENTATION.moon.surfaceMarks.length,
  'Moon visual must render its configured crater-like surface markings'
);
assert.ok(celestialBodies.moon.surfaceMarks.material.opacity > 0, 'Moon markings must remain readable when the moon is visible');

celestialBodies.apply({ day: 1, minuteOfDay: 6 * 60 });
assert.equal(celestialBodies.sun.root.visible, true, 'Sun must fade through the horizon at sunrise');
assert.equal(celestialBodies.moon.root.visible, true, 'Moon must fade through the opposite horizon at sunrise');
assert.ok(
  celestialBodies.sun.root.position.clone().sub(celestialScene.camera.position)
    .dot(celestialBodies.moon.root.position.clone().sub(celestialScene.camera.position)) < 0,
  'Sunrise and moonset must occur on opposite horizons'
);
celestialBodies.dispose();
assert.equal(celestialBodies.group.parent, null, 'Celestial presentation must cleanly release scene ownership');

let scheduledFrame = null;
let cancelledFrame = null;
let lightingApplyCount = 0;
let celestialApplyCount = 0;
const runtimeTime = new WorldTimeSystem();
const runtime = new WorldTimeRuntime({
  worldTime: runtimeTime,
  presentations: [
    { apply: () => { lightingApplyCount += 1; } },
    { apply: () => { celestialApplyCount += 1; } }
  ],
  requestFrame: callback => {
    scheduledFrame = callback;
    return 77;
  },
  cancelFrame: id => { cancelledFrame = id; }
});
runtime.start();
assert.equal(lightingApplyCount, 1, 'Runtime start must immediately synchronize lighting');
assert.equal(celestialApplyCount, 1, 'Runtime start must immediately synchronize celestial presentation');
scheduledFrame(1000);
const beforeFrame = runtimeTime.getSnapshot().minuteOfDay;
scheduledFrame(1050);
assert.ok(runtimeTime.getSnapshot().minuteOfDay > beforeFrame, 'Runtime frames must advance shared world time');
assert.equal(lightingApplyCount, celestialApplyCount, 'One world-time frame must fan out to all presentation systems');

runtime.setPaused(true);
const beforePausedFrames = runtimeTime.getSnapshot().minuteOfDay;
scheduledFrame(1100);
scheduledFrame(1150);
assert.equal(
  runtimeTime.getSnapshot().minuteOfDay,
  beforePausedFrames,
  'Paused runtime frames must not advance shared world time'
);
assert.equal(lightingApplyCount, celestialApplyCount, 'Paused runtime frames must keep presentations synchronized');

runtime.setPaused(false);
scheduledFrame(1200);
const beforeResumedFrame = runtimeTime.getSnapshot().minuteOfDay;
scheduledFrame(1250);
assert.ok(
  runtimeTime.getSnapshot().minuteOfDay > beforeResumedFrame,
  'Resuming the runtime must advance from a fresh frame baseline without paused-time catch-up'
);

runtime.stop();
assert.equal(cancelledFrame, 77, 'Runtime stop must release its animation frame');

const main = read('src/main.js');
const sceneSource = read('src/rendering/SceneSystem.js');
const saveController = read('src/persistence/SaveGameController.js');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['gameplay boot creates one shared world-time system', main.includes('const worldTime = new WorldTimeSystem()')],
  ['day/night presentation reuses SceneSystem lighting', main.includes('new DayNightLightingSystem({') && main.includes('sceneSystem: game.sceneSystem')],
  ['day/night presentation reads the shared underground depth authority', main.includes('undergroundDepthProvider: undergroundDepth') && main.includes('getUndergroundDepth?.(position)')],
  ['gameplay boot creates one clock-driven celestial presentation system', main.includes('new CelestialBodySystem({ sceneSystem: game.sceneSystem })')],
  ['world time runtime fans one snapshot into lighting, celestial bodies, and shadows', main.includes('presentations: [dayNightLighting, celestialBodies, celestialShadows]')],
  ['gameplay pause authority controls the shared world-time runtime', main.includes('game.onPauseChange(paused => worldTimeRuntime.setPaused(paused))')],
  ['new game clock starts after beach arrival rather than consuming tutorial time during the intro', main.includes('onComplete: () => {\n          worldTimeRuntime.start();')],
  ['continue restores before the clock resumes', main.indexOf('const restored = saveController.restore()') < main.indexOf('worldTimeRuntime.start();')],
  ['scene exposes existing lights instead of creating a second lighting rig', sceneSource.includes('this.lighting = this.#createLighting()') && sceneSource.includes('return Object.freeze({ hemi, sun, skyFill, ambient })')],
  ['autosave captures world time', saveController.includes('state.worldTime = this.game.worldTime?.captureState?.() ?? null')],
  ['continue restores world time when present', saveController.includes('const restoredWorldTime = this.game.worldTime?.restoreState?.(record.state.worldTime) ?? false')],
  ['legacy saves without world time use the explicit compatibility fallback', saveController.includes('minuteOfDay: WORLD_TIME.legacySaveFallbackMinuteOfDay')],
  ['full check suite includes the day/night regression', packageJson.scripts.check.includes('npm run verify:day-night')]
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
else console.log(`Day/night and celestial-cycle regression checks passed (${checks.length} integration contracts).`);
