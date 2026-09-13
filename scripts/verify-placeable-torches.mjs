import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { TORCH } from '../src/data/TorchDefinitions.js';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { TorchRuntimeController } from '../src/gameplay/TorchRuntimeController.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const nearlyEqual = (left, right, epsilon = 0.11) => Math.abs(left - right) <= epsilon;

assert.ok(TORCH.placement.maxDistance > 0, 'Torch placement must use a bounded interaction range');
assert.ok(TORCH.placement.maxActiveLights >= 4, 'Placed torches need a useful local lighting budget');
assert.ok(TORCH.placement.maxActiveLights <= 8, 'Placed torch point-light budget must remain mobile bounded');
assert.equal(TORCH.placement.light.decay, 2, 'Placed torch ambient light must keep natural inverse-square decay');
assert.ok(
  TORCH.placement.light.intensity < TORCH.light.intensity,
  'Fixed ambient torches should be softer than the navigation light carried beside the Ranger'
);
assert.ok(
  TORCH.placement.light.distance < TORCH.light.distance,
  'Fixed ambient torches should have a tighter local reach than the handheld navigation torch'
);

const inventory = new InventorySystem();
const crafting = new CraftingSystem({ inventory });
const toolbelt = new ToolbeltSystem({ inventory, crafting });
inventory.add('torch', 14);
assert.equal(toolbelt.select('torch').equipped, true);

const scene = new THREE.Scene();
const playerRoot = new THREE.Group();
const postRoot = new THREE.Group();
postRoot.position.set(0, 1.45, 2);
const wallRoot = new THREE.Group();
wallRoot.position.set(0.85, 1.35, 2.25);
wallRoot.quaternion.identity();

let nowMs = 1000;
const statuses = [];
const game = {
  inventory,
  crafting,
  toolbelt,
  sceneSystem: {
    scene,
    renderer: { shadowMap: { needsUpdate: false } },
    camera: new THREE.PerspectiveCamera()
  },
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
  physicalLogs: {
    builtLogs: [
      {
        id: 3,
        mode: 'frame',
        root: postRoot,
        active: true,
        baseY: 0,
        topY: 2.9
      },
      {
        id: 4,
        mode: 'wall',
        root: wallRoot,
        active: true,
        yaw: 0,
        baseY: 1.08,
        topY: 1.62
      }
    ]
  },
  setStatus(message) {
    statuses.push(message);
  }
};

const torch = new TorchRuntimeController({ game, now: () => nowMs });
game.torchRuntime = torch;
toolbelt.fuel = torch;

torch.apply({ day: 1, minuteOfDay: 20 * 60 });
torch.apply({ day: 1, minuteOfDay: 20 * 60 + 60 });
assert.ok(nearlyEqual(torch.snapshot().remainingGameMinutes, TORCH.burnDurationGameMinutes - 60));

const postTarget = torch.getPlacementTarget();
assert.equal(postTarget?.kind, 'post', 'A nearby forward vertical frame must resolve as a post torch mount');
assert.equal(postTarget?.id, 'physical-post:3');
const inventoryBeforePost = inventory.get('torch');
const postTorch = torch.place(postTarget);
assert.ok(postTorch, 'Resolved post target must accept a torch');
assert.equal(inventory.get('torch'), inventoryBeforePost - 1, 'Mounting transfers exactly one torch out of inventory');
assert.ok(
  nearlyEqual(postTorch.remainingGameMinutes, TORCH.burnDurationGameMinutes - 60),
  'Mounting transfers the active torch unit with its remaining fuel'
);
assert.ok(nearlyEqual(torch.snapshot().remainingGameMinutes, TORCH.burnDurationGameMinutes));
assert.equal(torch.placedTorches[0].light.castShadow, false, 'Placed ambient torches must not allocate point-light shadow maps');
assert.equal(torch.placedTorches[0].light.visible, true, 'A nearby placed torch must emit ambient light');

const nextTarget = torch.getPlacementTarget();
assert.equal(nextTarget?.kind, 'wall', 'An occupied post mount must be skipped in favor of the next aimed wall');
assert.equal(nextTarget?.id, 'physical-wall:4');
const wallTorch = torch.place(nextTarget);
assert.ok(wallTorch, 'Wall target must accept a torch');
assert.equal(torch.getPlacementTarget(), null, 'One wall/post mount cannot stack duplicate torches');

nowMs += 100;
torch.apply({ day: 1, minuteOfDay: 20 * 60 + 90 });
assert.ok(
  nearlyEqual(torch.placedTorches[0].remainingGameMinutes, TORCH.burnDurationGameMinutes - 90),
  'Placed torch fuel must continue burning after the player mounts it'
);
assert.ok(
  nearlyEqual(torch.placedTorches[1].remainingGameMinutes, TORCH.burnDurationGameMinutes - 30),
  'A later placed torch must keep its own independent burn state'
);

for (let index = 0; index < 8; index += 1) {
  const placed = torch.place({
    kind: 'post',
    id: `test-budget-post-${index}`,
    label: 'post',
    position: { x: index * 0.2 - 0.7, y: 1.4, z: 2.2 + index * 0.05 },
    yaw: 0
  });
  assert.ok(placed, `Budget fixture torch ${index} must place`);
}
const activePlacedLights = torch.placedTorches.filter(entry => entry.light.visible).length;
assert.equal(
  activePlacedLights,
  TORCH.placement.maxActiveLights,
  'Only the nearest configured number of fixed point lights may stay active'
);
assert.ok(
  torch.placedTorches.length > activePlacedLights,
  'Visual placed torches may outnumber the mobile point-light budget'
);

const saved = torch.captureState();
const savedInventoryQuantity = inventory.get('torch');
assert.equal(saved.placedTorches.length, torch.placedTorches.length);
assert.ok(saved.placedTorches.every(entry => entry.remainingGameMinutes > 0));
assert.equal(torch.restoreState(saved), true, 'Placed torches must restore through the existing torch save section');
assert.equal(torch.placedTorches.length, saved.placedTorches.length);
assert.equal(inventory.get('torch'), savedInventoryQuantity, 'Restore must not consume inventory again for already-placed torches');
torch.apply({ day: 1, minuteOfDay: 20 * 60 + 90 });
assert.equal(
  torch.placedTorches.filter(entry => entry.light.visible).length,
  TORCH.placement.maxActiveLights,
  'Restored stronghold lighting must retain the same bounded active-light budget'
);
assert.ok(statuses.some(message => message.includes('TORCH MOUNTED')));

torch.dispose();
assert.equal(torch.placedTorches.length, 0, 'Torch runtime disposal must release all fixed torch entries');

const resolverSource = read('src/gameplay/TorchPlacementTargetResolver.js');
const equipmentSource = read('src/gameplay/EquipmentRuntimeController.js');
const mobileHudSource = read('src/ui/MobileHud.js');
const saveSource = read('src/persistence/SaveGameController.js');

const checks = [
  ['semantic panel walls are used as canonical wall mount sources', resolverSource.includes('registry.wallPlacementWorld(structure, wall.key)')],
  ['legacy vertical frame logs remain valid post mounts', resolverSource.includes("built.mode === 'frame'")],
  ['door/window openings are not treated as flat wall mounting surfaces', resolverSource.includes("(wall.variant ?? 'solid') !== 'solid'")],
  ['occupied mount ids are excluded from placement targeting', resolverSource.includes('occupiedMountIds.has(target.id)')],
  ['torch placement reuses the external contextual action channel', equipmentSource.includes("TORCH_PLACEMENT_ACTION_ID = 'torch-place'") && equipmentSource.includes("caption: 'PLACE'")],
  ['all actual tool slots expose quantity badges', mobileHudSource.includes("count.hidden = entry.id === 'hand'")],
  ['the hand pseudo-slot remains the only slot without a quantity badge', !mobileHudSource.includes("count.hidden = entry.id !== 'spear'")],
  ['torch save state stays in the dedicated torch persistence boundary', saveSource.includes('state.torch = this.game.torchRuntime?.captureState?.() ?? null') && saveSource.includes('this.game.torchRuntime?.restoreState?.(record.state.torch)')]
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
else console.log(`Placeable torch regression checks passed (${checks.length} integration contracts).`);
