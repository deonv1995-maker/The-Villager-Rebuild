import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SPROUT_COMPANION } from '../src/data/SproutCompanionDefinitions.js';
import { PLAYER_TRAVERSAL_TUNING } from '../src/data/PlayerTraversalTuning.js';
import { SproutCompanionController } from '../src/gameplay/SproutCompanionController.js';
import { SproutRocketShoesPresentation } from '../src/gameplay/SproutRocketShoesPresentation.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const rocketPresentationSource = read('src/gameplay/SproutRocketShoesPresentation.js');
assert.ok(
  rocketPresentationSource.includes("SPROUT_VISUAL_COLORS as COLORS")
    && !rocketPresentationSource.includes('shell: 0xe7e1cf'),
  'transformed rocket shoes should reuse Sprout production colours instead of duplicating a second palette'
);

assert.ok(PLAYER_TRAVERSAL_TUNING.flight.holdDelaySeconds > 0, 'flight should require a deliberate held second jump');
assert.ok(PLAYER_TRAVERSAL_TUNING.flight.ascentSpeed > 0, 'flight should provide positive ascent');
assert.equal(
  PLAYER_TRAVERSAL_TUNING.flight.horizontalSpeedMultiplier,
  2.5,
  'active rocket shoes should move at exactly 2.5x the centralized running speed'
);
assert.ok(PLAYER_TRAVERSAL_TUNING.movement.runSpeed > 0, 'running speed must remain centrally defined');
assert.equal(PLAYER_TRAVERSAL_TUNING.flight.lockTapCount, 3, 'three jump presses should latch flight mode');
assert.ok(
  PLAYER_TRAVERSAL_TUNING.flight.lockTapWindowSeconds > PLAYER_TRAVERSAL_TUNING.flight.holdDelaySeconds,
  'triple-tap lock window should comfortably include the second-jump hold threshold'
);
assert.ok(PLAYER_TRAVERSAL_TUNING.flight.descendSpeed > 0, 'locked flight needs an explicit descent speed');
assert.ok(PLAYER_TRAVERSAL_TUNING.flight.turnRateRadiansPerSecond > 0, 'locked flight needs a tunable turn rate');
assert.ok(SPROUT_COMPANION.flightEnergyPerSecond > 0, 'Sprout flight must consume shared Sprout energy');
assert.ok(SPROUT_COMPANION.flightMinimumEnergy > 0, 'flight should not start on an empty battery');
assert.ok(
  SPROUT_COMPANION.flightTransformSeconds > 0 && SPROUT_COMPANION.flightTransformSeconds <= 0.2,
  'Sprout-to-shoe transformation should remain a fast sub-200ms presentation'
);
assert.ok(
  SPROUT_COMPANION.flightThrusterIgnitionRatio > 0.5 && SPROUT_COMPANION.flightThrusterIgnitionRatio < 1,
  'thrusters should ignite near the end of the transformation instead of before the shoes form'
);

const playerRoot = new THREE.Group();
const leftFoot = new THREE.Group();
const rightFoot = new THREE.Group();
playerRoot.add(leftFoot, rightFoot);
const presentationPlayer = {
  root: playerRoot,
  mountFootObject(side, object) {
    const anchor = side === 'left' ? leftFoot : rightFoot;
    anchor.add(object);
    object.position.set(0, -0.025, 0.08);
    object.quaternion.identity();
    return true;
  }
};

const presentation = new SproutRocketShoesPresentation({ player: presentationPlayer });
assert.ok(leftFoot.getObjectByName('sprout-rocket-shoe-left'), 'left rocket shoe should mount to the left foot');
assert.ok(rightFoot.getObjectByName('sprout-rocket-shoe-right'), 'right rocket shoe should mount to the right foot');
assert.equal(
  leftFoot.getObjectByName('sprout-rocket-shoe-left')?.userData.visualIdentity,
  'sprout-production-shell',
  'formed equipment should explicitly retain Sprout production-visual identity'
);
for (const name of [
  'sprout-rocket-shoe-left-transform-shell',
  'sprout-rocket-shoe-left-transform-green-panel',
  'sprout-rocket-shoe-left-transform-orange-band',
  'sprout-rocket-shoe-left-transform-eye',
  'sprout-rocket-shoe-left-green-side-panel',
  'sprout-rocket-shoe-left-expression-eye',
  'sprout-rocket-shoe-left-leaf-fin',
  'sprout-rocket-shoe-left-antigrav-ring'
]) {
  assert.ok(leftFoot.getObjectByName(name), `transformed shoe should retain Sprout motif: ${name}`);
}

presentation.update(0.05, 0.75);
assert.ok(
  presentation.getTransformProgress() > 0 && presentation.getTransformProgress() < 1,
  'rocket shoes should visibly pass through a fast intermediate transformation state'
);
assert.equal(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-transform-pod')?.visible,
  true,
  'compact Sprout-like pod should remain visible during the early transformation'
);
assert.equal(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-flame')?.visible,
  false,
  'thruster flame should wait until the shoe has mostly formed'
);

for (let frame = 0; frame < 4; frame += 1) presentation.update(0.05, 0.75);
assert.equal(presentation.getTransformProgress(), 1, 'fast transformation should complete within its tuned duration');
assert.equal(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-transform-pod')?.visible,
  false,
  'temporary Sprout pod should collapse into the completed shoe'
);
assert.equal(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-flame')?.visible,
  true,
  'thrusters should ignite once the transformed shoe has formed'
);
assert.ok(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-flame')?.scale.y > 0,
  'rocket-shoe flame should animate after transformation'
);
presentation.dispose();
assert.equal(leftFoot.children.length, 0, 'left rocket shoe should detach when flight ends');
assert.equal(rightFoot.children.length, 0, 'right rocket shoe should detach when flight ends');

const scene = new THREE.Scene();
const sproutRoot = new THREE.Group();
scene.add(sproutRoot);
const statusMessages = [];
const controllerPlayerRoot = new THREE.Group();
const controllerLeftFoot = new THREE.Group();
const controllerRightFoot = new THREE.Group();
controllerPlayerRoot.add(controllerLeftFoot, controllerRightFoot);
scene.add(controllerPlayerRoot);
const controllerPlayer = {
  root: controllerPlayerRoot,
  cinematicDriver: null,
  getPosition: out => out.copy(controllerPlayerRoot.position),
  getFacingDirection: out => out.set(0, 0, 1),
  mountFootObject(side, object) {
    (side === 'left' ? controllerLeftFoot : controllerRightFoot).add(object);
    object.position.set(0, -0.025, 0.08);
    object.quaternion.identity();
    return true;
  }
};
const game = {
  player: controllerPlayer,
  island: {},
  gatherables: {},
  inventory: {},
  treeHarvest: {},
  sceneSystem: { scene },
  hud: { setInventory() {} },
  setStatus: message => statusMessages.push(message),
  isPaused: () => false,
  sproutArrival: {
    isAllied: () => true,
    claimCompanionPresentation: () => sproutRoot
  }
};

const controller = new SproutCompanionController({ game });
const startingEnergy = controller.getEnergyState().energy;
assert.equal(controller.beginFlight(), true, 'allied Sprout with energy should enter rocket-shoe flight');
assert.equal(controller.isFlightActive(), true, 'flight state should become active');
assert.equal(controller.getCommandState().activeCommandId, 'flight', 'Sprout HUD state should expose rocket-shoe flight');
assert.ok(
  controller.getCommandState().commands.every(command => !command.enabled),
  'normal Sprout commands should stay disabled while Sprout is the rocket shoes'
);
for (let frame = 0; frame < 10; frame += 1) controller.update(0.05);
assert.ok(
  Math.abs(
    controller.getEnergyState().energy
      - (startingEnergy - SPROUT_COMPANION.flightEnergyPerSecond * 0.5)
  ) < 1e-9,
  'flight should continuously drain the existing Sprout energy meter'
);
assert.equal(controller.getEnergyState().recharging, false, 'Sprout must not recharge while powering flight');
assert.equal(controller.endFlight('test-release'), true, 'releasing flight should disengage the rocket shoes');
assert.equal(controller.isFlightActive(), false, 'flight should be inactive after release');
assert.equal(controllerLeftFoot.children.length, 0, 'left rocket shoe should be removed after release');
assert.equal(controllerRightFoot.children.length, 0, 'right rocket shoe should be removed after release');

controller.restoreState({ energy: SPROUT_COMPANION.flightMinimumEnergy });
assert.equal(controller.beginFlight(), true, 'minimum usable energy should still allow a final flight burst');
for (let frame = 0; frame < 3; frame += 1) controller.update(0.05);
assert.equal(controller.getEnergyState().energy, 0, 'flight drain should clamp energy at zero');
assert.equal(controller.isFlightActive(), false, 'flight should force itself off when Sprout energy is exhausted');
assert.ok(
  statusMessages.some(message => message.includes('ENERGY DEPLETED')),
  'energy depletion should give explicit flight shutdown feedback'
);

controller.restoreState({ energy: SPROUT_COMPANION.flightMinimumEnergy * 0.5 });
assert.equal(controller.beginFlight(), false, 'flight should reject a battery below the activation floor');

const originalWindow = globalThis.window;
const listeners = new Map();
globalThis.window = {
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  }
};
const { RangerController } = await import('../src/player/RangerController.js');
const terrain = {
  getSpawnPoint: () => ({ x: 0, z: 0 }),
  heightAt: () => 0
};
const ranger = new RangerController({
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  terrain,
  collision: null
});
ranger.model = new THREE.Group();
ranger.assetMode = 'kaykit';

let flightActive = false;
let flightStarts = 0;
ranger.setFlightAssistProvider({
  beginFlight() {
    flightStarts += 1;
    flightActive = true;
    return true;
  },
  endFlight() {
    const wasActive = flightActive;
    flightActive = false;
    return wasActive;
  },
  isFlightActive() {
    return flightActive;
  }
});

ranger.setJumpHeld(true);
assert.equal(ranger.jump(), true, 'first jump should still launch normally');
ranger.setJumpHeld(false);
ranger.setJumpHeld(true);
assert.equal(ranger.jump(), true, 'second jump should still perform the normal double jump');
ranger.update(PLAYER_TRAVERSAL_TUNING.flight.holdDelaySeconds * 0.45);
assert.equal(flightStarts, 0, 'a short second-jump tap should not activate flight');
ranger.update(PLAYER_TRAVERSAL_TUNING.flight.holdDelaySeconds);
assert.equal(flightStarts, 1, 'holding the second jump should activate Sprout flight once');
assert.equal(ranger.isFlying(), true, 'Ranger should report active Sprout flight');
const flyingY = ranger.root.position.y;
ranger.setMove(0, 1);
const flightMoveStart = ranger.root.position.clone();
ranger.update(0.05);
assert.ok(ranger.root.position.y > flyingY, 'active rocket shoes should continue lifting the Ranger');
const flightHorizontalDistance = Math.hypot(
  ranger.root.position.x - flightMoveStart.x,
  ranger.root.position.z - flightMoveStart.z
);
const expectedFlightDistance = PLAYER_TRAVERSAL_TUNING.movement.runSpeed
  * PLAYER_TRAVERSAL_TUNING.flight.horizontalSpeedMultiplier
  * 0.05;
assert.ok(
  Math.abs(flightHorizontalDistance - expectedFlightDistance) < 1e-9,
  'full directional input during flight should travel at 2.5x running speed'
);
ranger.setMove(0, 0);
ranger.setJumpHeld(false);
assert.equal(ranger.isFlying(), true, 'releasing boost should keep the transformed rocket boots active while airborne');
assert.equal(ranger.isFlightLocked(), false, 'ordinary held-double-jump flight should remain manual until the third press');

ranger.root.position.y = 20;
ranger.jumpVelocity = 0;
ranger.update(PLAYER_TRAVERSAL_TUNING.flight.lockTapWindowSeconds + 0.05);
ranger.setJumpHeld(true);
assert.equal(ranger.jump(), true, 'pressing jump again while boots are active should re-engage boost');
ranger.jumpVelocity = 0;
const reboostY = ranger.root.position.y;
ranger.update(0.05);
assert.ok(ranger.root.position.y > reboostY, 're-engaged jump hold should resume upward rocket boost');
ranger.setJumpHeld(false);
assert.equal(ranger.isFlying(), true, 'releasing a re-engaged boost should still keep the boots deployed');

let lockedFlightActive = false;
let lockedFlightStarts = 0;
const lockedRanger = new RangerController({
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  terrain,
  collision: null
});
lockedRanger.model = new THREE.Group();
lockedRanger.assetMode = 'kaykit';
lockedRanger.setFlightAssistProvider({
  beginFlight() {
    lockedFlightStarts += 1;
    lockedFlightActive = true;
    return true;
  },
  endFlight() {
    const wasActive = lockedFlightActive;
    lockedFlightActive = false;
    return wasActive;
  },
  isFlightActive() {
    return lockedFlightActive;
  }
});

lockedRanger.setJumpHeld(true);
assert.equal(lockedRanger.jump(), true, 'triple-tap sequence should begin with the normal first jump');
lockedRanger.setJumpHeld(false);
lockedRanger.setJumpHeld(true);
assert.equal(lockedRanger.jump(), true, 'triple-tap sequence should retain the normal second jump');
lockedRanger.setJumpHeld(false);
lockedRanger.setJumpHeld(true);
assert.equal(lockedRanger.jump(), true, 'third jump press should be consumed as the flight-lock gesture');
assert.equal(lockedFlightStarts, 1, 'third jump press should deploy Sprout flight immediately');
assert.equal(lockedRanger.isFlightLocked(), true, 'third jump press should latch hands-free flight');
lockedRanger.setJumpHeld(false);
assert.equal(lockedRanger.isFlying(), true, 'releasing the third press should leave the Ranger in flight');

const initialLockedYaw = lockedRanger.yaw;
lockedRanger.jumpVelocity = 0;
lockedRanger.setFlightControl(1, 1);
const climbY = lockedRanger.root.position.y;
lockedRanger.update(0.1);
assert.ok(lockedRanger.root.position.y > climbY, 'upward right-side flight input should climb');
assert.notEqual(lockedRanger.yaw, initialLockedYaw, 'horizontal right-side flight input should turn the Ranger');

lockedRanger.root.position.y = 10;
lockedRanger.jumpVelocity = 0;
lockedRanger.setFlightControl(0, -1);
const descendY = lockedRanger.root.position.y;
lockedRanger.update(0.1);
assert.ok(lockedRanger.root.position.y < descendY, 'downward right-side flight input should descend');

lockedRanger.root.position.y = 10;
lockedRanger.jumpVelocity = 2;
lockedRanger.setFlightControl(0, 0);
lockedRanger.update(0.1);
assert.ok(
  Math.abs(lockedRanger.jumpVelocity) < 2,
  'neutral locked-flight vertical input should damp toward a hover instead of applying gravity'
);

globalThis.window = originalWindow;

const mobileHud = read('src/ui/MobileHud.js');
assert.ok(
  mobileHud.includes('this.player.setJumpHeld?.(true)')
    && mobileHud.includes("jump.addEventListener('pointerup', releaseJump)")
    && mobileHud.includes("jump.addEventListener('pointercancel', releaseJump)"),
  'mobile jump input should expose both press and release for boost control'
);
assert.ok(
  mobileHud.includes('this.player.isFlightLocked?.()')
    && mobileHud.includes('this.player.setFlightControl?.(turn, vertical)')
    && mobileHud.includes('data-role="flight-control-guide"')
    && mobileHud.includes('onFlightModeChange'),
  'locked flight should repurpose the right-side touch surface for turn and up/down control'
);

const mobileStyles = read('src/styles.css');
assert.ok(
  mobileStyles.includes('.flight-control-guide')
    && mobileStyles.includes('.hud-button.jump.flight-locked'),
  'locked flight should expose a visible right-side steering guide and active jump state'
);

const main = read('src/main.js');
assert.ok(
  main.includes('game.player.setFlightAssistProvider?.(sproutCompanion);'),
  'boot wiring should connect the player traversal boundary to Sprout energy/presentation'
);

console.log('Sprout rocket-shoe flight regression checks passed.');
