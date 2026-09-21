import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SPROUT_COMPANION } from '../src/data/SproutCompanionDefinitions.js';
import { PLAYER_TRAVERSAL_TUNING } from '../src/data/PlayerTraversalTuning.js';
import { SproutCompanionController } from '../src/gameplay/SproutCompanionController.js';
import { SproutRocketShoesPresentation } from '../src/gameplay/SproutRocketShoesPresentation.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

assert.ok(PLAYER_TRAVERSAL_TUNING.flight.holdDelaySeconds > 0, 'flight should require a deliberate held second jump');
assert.ok(PLAYER_TRAVERSAL_TUNING.flight.ascentSpeed > 0, 'flight should provide positive ascent');
assert.equal(
  PLAYER_TRAVERSAL_TUNING.flight.directionalSpeedMultiplier,
  2.5,
  'rocket boots should move directionally at 2.5x established running speed'
);
assert.ok(SPROUT_COMPANION.flightEnergyPerSecond > 0, 'Sprout flight must consume shared Sprout energy');
assert.ok(SPROUT_COMPANION.flightMinimumEnergy > 0, 'flight should not start on an empty battery');
assert.ok(
  SPROUT_COMPANION.flightTransformSeconds > 0 && SPROUT_COMPANION.flightTransformSeconds <= 0.2,
  'Sprout-to-shoe transformation should stay fast and responsive'
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

const presentation = new SproutRocketShoesPresentation({
  player: presentationPlayer,
  transformSeconds: SPROUT_COMPANION.flightTransformSeconds
});
const leftShoe = leftFoot.getObjectByName('sprout-rocket-shoe-left');
const rightShoe = rightFoot.getObjectByName('sprout-rocket-shoe-right');
assert.ok(leftShoe, 'left rocket shoe should mount to the left foot');
assert.ok(rightShoe, 'right rocket shoe should mount to the right foot');
assert.equal(leftShoe.userData.sproutTransformed, true, 'left shoe should identify as transformed Sprout presentation');
assert.equal(rightShoe.userData.sproutTransformed, true, 'right shoe should identify as transformed Sprout presentation');
assert.ok(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-face-screen')
    && leftFoot.getObjectByName('sprout-rocket-shoe-left-eye')
    && leftFoot.getObjectByName('sprout-rocket-shoe-left-leaf-fin')
    && leftFoot.getObjectByName('sprout-rocket-shoe-left-orange-band')
    && leftFoot.getObjectByName('sprout-rocket-shoe-left-hover-ring'),
  'transformed shoes should retain Sprout face, leaf, orange-band and hover-ring motifs'
);
const leftAssembly = leftFoot.getObjectByName('sprout-rocket-shoe-left-assembly');
const initialScale = leftAssembly.scale.x;
assert.ok(initialScale < 0.3, 'Sprout shoe should begin collapsed before snapping open');
assert.equal(presentation.isTransformComplete(), false, 'transformation should begin incomplete');
presentation.update(SPROUT_COMPANION.flightTransformSeconds * 0.45, 0.75);
assert.ok(leftAssembly.scale.x > initialScale && leftAssembly.scale.x < 1, 'shoe shell should visibly unfold during transformation');
presentation.update(SPROUT_COMPANION.flightTransformSeconds, 0.75);
assert.equal(presentation.isTransformComplete(), true, 'fast Sprout transformation should complete within configured timing');
assert.ok(Math.abs(leftAssembly.scale.x - 1) < 1e-6, 'shoe shell should finish at full transformed scale');
assert.ok(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-transform-core')?.material.opacity < 0.01,
  'transformation core should dissolve when Sprout finishes reconfiguring'
);
assert.ok(
  leftFoot.getObjectByName('sprout-rocket-shoe-left-flame')?.material.opacity > 0,
  'rocket-shoe thrusters should ignite at the end of transformation'
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
ranger.update(0.05);
assert.ok(ranger.root.position.y > flyingY, 'active rocket shoes should continue lifting the Ranger');

ranger.setMove(0, 1);
const beforeBoostedMove = ranger.root.position.clone();
ranger.update(0.1);
const boostedHorizontalDistance = Math.hypot(
  ranger.root.position.x - beforeBoostedMove.x,
  ranger.root.position.z - beforeBoostedMove.z
);
assert.ok(
  Math.abs(boostedHorizontalDistance - (6 * PLAYER_TRAVERSAL_TUNING.flight.directionalSpeedMultiplier * 0.1)) < 1e-9,
  'active rocket boots should move directionally at 2.5x the established 6-unit running speed'
);
ranger.setMove(0, 0);
ranger.setJumpHeld(false);
assert.equal(ranger.isFlying(), false, 'releasing the held second jump should end flight immediately');

globalThis.window = originalWindow;

const mobileHud = read('src/ui/MobileHud.js');
assert.ok(
  mobileHud.includes('this.player.setJumpHeld?.(true)')
    && mobileHud.includes("jump.addEventListener('pointerup', releaseJump)")
    && mobileHud.includes("jump.addEventListener('pointercancel', releaseJump)"),
  'mobile jump input should expose both press and release for hold-to-fly'
);

const main = read('src/main.js');
assert.ok(
  main.includes('game.player.setFlightAssistProvider?.(sproutCompanion);'),
  'boot wiring should connect the player traversal boundary to Sprout energy/presentation'
);

console.log('Sprout rocket-shoe flight regression checks passed.');
