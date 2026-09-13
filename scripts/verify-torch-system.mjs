import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { WorldTimeRuntime } from '../src/core/WorldTimeRuntime.js';
import { WorldTimeSystem } from '../src/core/WorldTimeSystem.js';
import { ASSET_PATHS } from '../src/data/AssetPaths.js';
import { CRAFTING_RECIPES } from '../src/data/CraftingDefinitions.js';
import { TORCH } from '../src/data/TorchDefinitions.js';
import { TOOL_DEFINITIONS, TOOL_ORDER } from '../src/data/ToolDefinitions.js';
import { WORLD_DAY_MINUTES, WORLD_TIME } from '../src/data/WorldTimeDefinitions.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { TorchRuntimeController } from '../src/gameplay/TorchRuntimeController.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const nearlyEqual = (left, right, epsilon = 0.11) => Math.abs(left - right) <= epsilon;

const nightMinutes = (WORLD_DAY_MINUTES - WORLD_TIME.phases.nightStart) + WORLD_TIME.phases.dawnStart;
assert.equal(nightMinutes, 9 * 60, 'The current night phase must remain nine in-game hours');
assert.equal(TORCH.burnDurationGameMinutes, nightMinutes / 2, 'One torch must last half of the configured night');
assert.equal(TORCH.burnDurationGameMinutes, 270, 'Baseline torch life must be 4.5 in-game hours');
assert.equal(TOOL_DEFINITIONS.torch.role, 'light');
assert.equal(TOOL_DEFINITIONS.torch.icon, 'torch', 'Torch must use its dedicated UI icon semantic');
assert.ok(
  ASSET_PATHS.ui.mobile.torch.endsWith('/ui/cosy/icon-torch.webp'),
  'Torch must resolve through the central cosy WebP asset registry'
);
assert.equal(TOOL_ORDER.at(-1), 'torch', 'Torch must be a normal toolbelt slot');
assert.ok(TORCH.light.flicker.intensityVariance > 0, 'Burning torch light must have visible intensity flutter');
assert.ok(TORCH.light.intensity <= 60, 'Torch base intensity must remain in the softer fire-light range');
assert.ok(
  TORCH.light.flicker.intensityVariance <= 0.1,
  'Torch emitted-light flicker must stay subtle rather than harsh'
);
assert.ok(TORCH.light.follow.response > 0, 'Torch light must retain damped hand-follow response');
assert.ok(TORCH.light.shadow.radius >= 1, 'Torch local shadows must retain a softened edge radius');
assert.ok(TORCH.light.shadow.mapSize <= 256, 'Portable point-light shadows must stay within the mobile shadow budget');
assert.ok(TORCH.light.shadow.refreshHz <= 10, 'Portable shadow refresh must remain bounded for mobile');
assert.deepEqual(
  CRAFTING_RECIPES.torch.ingredients,
  [{ itemId: 'stick', quantity: 1 }, { itemId: 'grass', quantity: 2 }],
  'Torch recipe must stay primitive and craftable from early gathered resources'
);

const inventory = new InventorySystem();
const crafting = new CraftingSystem({ inventory });
const toolbelt = new ToolbeltSystem({ inventory, crafting });
inventory.add('stick', 2);
inventory.add('grass', 4);
assert.ok(crafting.craft('torch'));
assert.ok(crafting.craft('torch'));
assert.equal(inventory.get('torch'), 2);
assert.equal(toolbelt.select('torch').equipped, true);

const scene = new THREE.Scene();
const playerRoot = new THREE.Group();
playerRoot.position.set(3, 2, -4);
const rangerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 1.5, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x889966 })
);
rangerMesh.name = 'test-ranger-body';
rangerMesh.castShadow = false;
playerRoot.add(rangerMesh);
const rendererShadowMap = { needsUpdate: false };
let shadowClock = 1000;
const statuses = [];
const game = {
  inventory,
  crafting,
  toolbelt,
  sceneSystem: { scene, renderer: { shadowMap: rendererShadowMap } },
  player: {
    root: playerRoot,
    mountRightHandObject(object) {
      playerRoot.add(object);
      return true;
    },
    getPosition(target) {
      return target.copy(playerRoot.position);
    },
    getFacingDirection(target) {
      return target.set(0, 0, 1);
    },
    isFirstPerson() {
      return false;
    }
  },
  setStatus(message) {
    statuses.push(message);
  }
};

const torch = new TorchRuntimeController({ game, now: () => shadowClock });
toolbelt.fuel = torch;
torch.apply({ day: 1, minuteOfDay: 20 * 60 });
assert.equal(torch.light.visible, true, 'Equipped torch must emit light');
assert.equal(torch.light.isPointLight, true, 'Burning torch must radiate in all directions from one point light');
assert.equal(torch.light.castShadow, true, 'Burning torch must own a bounded local shadow map');
assert.equal(torch.light.shadow.mapSize.width, TORCH.light.shadow.mapSize);
assert.equal(torch.light.shadow.mapSize.height, TORCH.light.shadow.mapSize);
assert.equal(torch.light.shadow.camera.near, TORCH.light.shadow.near);
assert.equal(torch.light.shadow.camera.far, TORCH.light.shadow.far);
assert.equal(torch.light.shadow.radius, TORCH.light.shadow.radius);
assert.equal(torch.light.position.x, 3, 'Torch light X must come from the handheld flame anchor');
assert.ok(
  nearlyEqual(torch.light.position.y, 2 + TORCH.visual.handleLength * 0.6, 0.0001),
  'Torch light Y must come from the handheld flame anchor rather than Ranger centre'
);
assert.equal(torch.light.position.z, -4, 'Torch light Z must come from the handheld flame anchor');
assert.equal(rangerMesh.castShadow, true, 'Ranger must become a torch-shadow caster while the torch burns');
assert.equal(rendererShadowMap.needsUpdate, true, 'Torch activation must request a local shadow refresh');

const initialLightX = torch.light.position.x;
playerRoot.position.x += 0.6;
shadowClock += 16;
torch.apply({ day: 1, minuteOfDay: 20 * 60 });
const currentFlamePosition = new THREE.Vector3();
torch.flameAnchor.getWorldPosition(currentFlamePosition);
assert.ok(
  torch.light.position.x > initialLightX && torch.light.position.x < currentFlamePosition.x,
  'Torch light movement must damp hand-bob displacement instead of snapping to the flame anchor'
);

const firstIntensity = torch.light.intensity;
const firstFlameScale = torch.flame.scale.y;
shadowClock += 120;
torch.apply({ day: 1, minuteOfDay: 20 * 60 });
assert.notEqual(torch.light.intensity, firstIntensity, 'Torch intensity must flutter over time');
assert.notEqual(torch.flame.scale.y, firstFlameScale, 'Visible flame must flutter with the light');
assert.ok(
  Math.abs(torch.light.intensity - TORCH.light.intensity) <= TORCH.light.intensity * TORCH.light.flicker.intensityVariance + 0.001,
  'Torch flicker must stay inside its centralized intensity variance'
);

torch.apply({ day: 1, minuteOfDay: 22 * 60 + 15 });
assert.ok(nearlyEqual(torch.snapshot().remainingGameMinutes, 135));
assert.ok(nearlyEqual(torch.snapshot().percent, 50));
assert.equal(inventory.get('torch'), 2, 'Partial burn must not consume the held torch early');
const torchSlotHalf = toolbelt.snapshot().find(entry => entry.id === 'torch');
assert.equal(torchSlotHalf.meterKind, 'fuel');
assert.ok(nearlyEqual(torchSlotHalf.durability, 50), 'Existing belt meter must display torch fuel percentage');

toolbelt.select('hand');
torch.apply({ day: 1, minuteOfDay: 23 * 60 + 15 });
assert.ok(nearlyEqual(torch.snapshot().remainingGameMinutes, 135), 'Torch fuel must pause while not held');
assert.equal(torch.light.visible, false, 'Unequipped torch must stop lighting the world');
assert.equal(rangerMesh.castShadow, false, 'Ranger torch-shadow casting must restore when the torch is put away');

toolbelt.select('torch');
torch.apply({ day: 2, minuteOfDay: 1 * 60 + 30 });
assert.equal(inventory.get('torch'), 1, 'Finishing a torch must consume exactly one inventory unit');
assert.ok(nearlyEqual(torch.snapshot().remainingGameMinutes, TORCH.burnDurationGameMinutes));
assert.equal(toolbelt.getEquippedToolId(), 'torch', 'A spare torch must automatically continue the held light');

torch.apply({ day: 2, minuteOfDay: 6 * 60 });
assert.equal(inventory.get('torch'), 0, 'Second full burn must consume the spare torch');
assert.equal(toolbelt.getEquippedToolId(), null, 'Toolbelt must fall back to hand when the final torch burns out');
assert.equal(torch.light.visible, false);
assert.equal(rangerMesh.castShadow, false);
assert.ok(statuses.at(-1)?.includes('TORCH BURNED OUT'));

inventory.add('torch', 1);
toolbelt.select('torch');
assert.equal(torch.restoreState({ remainingGameMinutes: 90 }), true);
torch.apply({ day: 2, minuteOfDay: 6 * 60 });
assert.ok(nearlyEqual(torch.captureState().remainingGameMinutes, 90), 'Restore sync must not burn offline/background time');
torch.apply({ day: 2, minuteOfDay: 6 * 60 + 30 });
assert.ok(nearlyEqual(torch.captureState().remainingGameMinutes, 60), 'Restored partial torch must resume from saved fuel');
torch.dispose();
assert.equal(torch.light.parent, null, 'Torch runtime must release its scene light cleanly');
assert.equal(rangerMesh.castShadow, false, 'Torch disposal must restore the Ranger shadow policy');

let scheduledFrame = null;
let presentationCount = 0;
let consumerCount = 0;
const runtime = new WorldTimeRuntime({
  worldTime: new WorldTimeSystem(),
  presentations: [{ apply: () => { presentationCount += 1; } }],
  consumers: [{ apply: () => { consumerCount += 1; } }],
  requestFrame: callback => {
    scheduledFrame = callback;
    return 5;
  },
  cancelFrame: () => {}
});
runtime.start();
assert.equal(presentationCount, 1);
assert.equal(consumerCount, 1, 'Gameplay consumers must receive the same initial world-time snapshot');
scheduledFrame(1000);
scheduledFrame(1050);
assert.equal(consumerCount, presentationCount, 'Gameplay consumers and visual presentations must stay on one clock');
runtime.stop();

const main = read('src/main.js');
const saveController = read('src/persistence/SaveGameController.js');
const rangerTools = read('src/player/RangerToolPresentation.js');
const torchRuntimeSource = read('src/gameplay/TorchRuntimeController.js');
const celestialShadowSource = read('src/rendering/CelestialShadowSystem.js');
const mobileHud = read('src/ui/MobileHud.js');
const torchCss = read('src/torch.css');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['gameplay boot creates the dedicated torch runtime', main.includes('new TorchRuntimeController({ game })')],
  ['torch uses shared world-time consumer fanout', main.includes('consumers: [torchRuntime]')],
  ['toolbelt fuel authority is the torch runtime', main.includes('game.toolbelt.fuel = torchRuntime')],
  ['torch state is captured by autosave', saveController.includes('state.torch = this.game.torchRuntime?.captureState?.() ?? null')],
  ['torch state restores after inventory/equipment', saveController.includes('this.game.torchRuntime?.restoreState?.(record.state.torch)')],
  ['generic Ranger tool visual does not compete with torch presentation', rangerTools.includes("toolId === 'spear' || toolId === 'torch'")],
  ['torch runtime does not create a second animation loop', !torchRuntimeSource.includes('requestAnimationFrame')],
  ['torch light is a flame-anchored omnidirectional point source', torchRuntimeSource.includes('new THREE.PointLight') && torchRuntimeSource.includes('this.flameAnchor.getWorldPosition(this.position)')],
  ['torch light follows the hand through one damped presentation response', torchRuntimeSource.includes('this.#syncLightPosition(deltaSeconds)') && torchRuntimeSource.includes('Math.exp(-followDefinition.response * deltaSeconds)')],
  ['torch emitted-light flicker is low-pass filtered before intensity/reach output', torchRuntimeSource.includes('this.smoothedFlicker = THREE.MathUtils.lerp') && torchRuntimeSource.includes('flickerDefinition.smoothingResponse')],
  ['torch uses bounded shadow refresh rather than per-frame shadow ownership', torchRuntimeSource.includes('this.definition.light.shadow.refreshHz') && torchRuntimeSource.includes('shadowMap.needsUpdate = true')],
  ['forest tree batches remain centralized shadow casters', celestialShadowSource.includes('return { cast: staticTreeBatch, receive: staticTreeBatch }')],
  ['mobile HUD exposes the dedicated torch artwork', mobileHud.includes('torch: ui.torch')],
  ['eight-slot mobile belt has a narrow-screen layout contract', torchCss.includes('@media (max-width: 420px)') && torchCss.includes('10.6vw')],
  ['full check suite includes torch regression', packageJson.scripts.check.includes('npm run verify:torch')]
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
else console.log(`Crafted torch regression checks passed (${checks.length} integration contracts).`);
