import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { WorldTimeRuntime } from '../src/core/WorldTimeRuntime.js';
import { WorldTimeSystem, worldTimePhaseAt } from '../src/core/WorldTimeSystem.js';
import { WORLD_TIME } from '../src/data/WorldTimeDefinitions.js';
import { DayNightLightingSystem } from '../src/rendering/DayNightLightingSystem.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

assert.equal(WORLD_TIME.startDay, 1, 'New games must begin on Day 1');
assert.equal(WORLD_TIME.startMinuteOfDay, 8 * 60, 'New games must begin at 08:00');
assert.equal(WORLD_TIME.realSecondsPerDay, 24 * 60, 'A complete game day must take 24 real minutes');
assert.equal(worldTimePhaseAt(4 * 60 + 59), 'night');
assert.equal(worldTimePhaseAt(5 * 60), 'dawn');
assert.equal(worldTimePhaseAt(7 * 60), 'day');
assert.equal(worldTimePhaseAt(17 * 60 + 30), 'dusk');
assert.equal(worldTimePhaseAt(20 * 60), 'night');

const time = new WorldTimeSystem();
assert.deepEqual(
  { day: time.getSnapshot().day, time: time.getSnapshot().displayTime, phase: time.getSnapshot().phase },
  { day: 1, time: '08:00', phase: 'day' }
);
time.update(60);
assert.equal(time.getSnapshot().displayTime, '09:00', 'One real minute must advance one in-game hour at the baseline scale');

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
assert.equal(fallback.restoreState(null), false, 'Older compatible saves without time state must keep the new-game default');
assert.equal(fallback.getSnapshot().displayTime, '08:00');

function makeSceneSystem() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaeddec);
  scene.fog = new THREE.FogExp2(0xa9c7bc, 0.0043);
  return {
    scene,
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

let scheduledFrame = null;
let cancelledFrame = null;
let applyCount = 0;
const runtimeTime = new WorldTimeSystem();
const runtime = new WorldTimeRuntime({
  worldTime: runtimeTime,
  lighting: { apply: () => { applyCount += 1; } },
  requestFrame: callback => {
    scheduledFrame = callback;
    return 77;
  },
  cancelFrame: id => { cancelledFrame = id; }
});
runtime.start();
assert.equal(applyCount, 1, 'Runtime start must immediately synchronize lighting');
scheduledFrame(1000);
const beforeFrame = runtimeTime.getSnapshot().minuteOfDay;
scheduledFrame(1050);
assert.ok(runtimeTime.getSnapshot().minuteOfDay > beforeFrame, 'Runtime frames must advance shared world time');
runtime.stop();
assert.equal(cancelledFrame, 77, 'Runtime stop must release its animation frame');

const main = read('src/main.js');
const sceneSource = read('src/rendering/SceneSystem.js');
const saveController = read('src/persistence/SaveGameController.js');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['gameplay boot creates one shared world-time system', main.includes('const worldTime = new WorldTimeSystem()')],
  ['day/night presentation reuses SceneSystem lighting', main.includes('new DayNightLightingSystem({ sceneSystem: game.sceneSystem })')],
  ['world time runtime is owned by gameplay boot', main.includes('new WorldTimeRuntime({ worldTime, lighting: dayNightLighting })')],
  ['new game clock starts after beach arrival rather than consuming tutorial time during the intro', main.includes('onComplete: () => {\n          worldTimeRuntime.start();')],
  ['continue restores before the clock resumes', main.indexOf('const restored = saveController.restore()') < main.indexOf('worldTimeRuntime.start();')],
  ['scene exposes existing lights instead of creating a second lighting rig', sceneSource.includes('this.lighting = this.#createLighting()') && sceneSource.includes('return Object.freeze({ hemi, sun, skyFill, ambient })')],
  ['autosave captures world time', saveController.includes('state.worldTime = this.game.worldTime?.captureState?.() ?? null')],
  ['continue restores world time when present', saveController.includes('this.game.worldTime?.restoreState?.(record.state.worldTime)')],
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
else console.log(`Day/night cycle regression checks passed (${checks.length} integration contracts).`);
