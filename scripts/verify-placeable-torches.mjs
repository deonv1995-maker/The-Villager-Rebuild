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
const mountedTorchAxis = entry => new THREE.Vector3(0, 1, 0).applyQuaternion(entry.root.quaternion);
const mountOutwardNormal = entry => new THREE.Vector3(Math.sin(entry.yaw), 0, Math.cos(entry.yaw));

assert.ok(TORCH.placement.maxDistance > 0, 'Torch placement must use a bounded interaction range');
assert.ok(TORCH.placement.maxActiveLights >= 4, 'Placed torches need a useful local lighting budget');
assert.ok(TORCH.placement.maxActiveLights <= 8, 'Placed torch point-light budget must remain mobile bounded');
assert.ok(
  TORCH.placement.outwardTiltDegrees >= 25 && TORCH.placement.outwardTiltDegrees <= 50,
  'Mounted torches must keep a readable outward/upward lean instead of standing flat in the mount plane'
);
assert.ok(
  TORCH.placement.wallVisualOutwardOffset > 0,
  'Wall-mounted torch presentation needs positive clearance in front of the wall surface'
);
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

const inventoryBeforeLongRun = inventory.get('torch');
torch.apply({ day: 1, minuteOfDay: 20 * 60 });
torch.apply({ day: 3, minuteOfDay: 5 * 60 });
assert.equal(
  inventory.get('torch'),
  inventoryBeforeLongRun,
  'Unplaced torches must remain available indefinitely'
);

const postTarget = torch.getPlacementTarget();
assert.equal(postTarget?.kind, 'post', 'A nearby forward vertical frame must resolve as a post torch mount');
assert.equal(postTarget?.id, 'physical-post:3');
const inventoryBeforePost = inventory.get('torch');
const postTorch = torch.place(postTarget);
assert.ok(postTorch, 'Resolved post target must accept a torch');
assert.equal(inventory.get('torch'), inventoryBeforePost - 1, 'Mounting transfers exactly one torch out of inventory');
assert.equal(
  Object.hasOwn(postTorch, 'remainingGameMinutes'),
  false,
  'Mounted torches must not carry a finite fuel value'
);
assert.equal(torch.placedTorches[0].light.castShadow, false, 'Placed ambient torches must not allocate point-light shadow maps');
assert.equal(torch.placedTorches[0].light.visible, true, 'A nearby placed torch must emit ambient light');
const postEntry = torch.placedTorches[0];
const postAxis = mountedTorchAxis(postEntry);
const postOutwardNormal = mountOutwardNormal(postEntry);
assert.ok(postAxis.y > 0.7, 'Mounted post torches must still point predominantly upward');
assert.ok(
  postAxis.dot(postOutwardNormal) > 0.5,
  'Mounted post torches must lean toward the resolved outward side of the mount'
);

const nextTarget = torch.getPlacementTarget();
assert.equal(nextTarget?.kind, 'wall', 'An occupied post mount must be skipped in favor of the next aimed wall');
assert.equal(nextTarget?.id, 'physical-wall:4');
const wallTorch = torch.place(nextTarget);
assert.ok(wallTorch, 'Wall target must accept a torch');
assert.equal(torch.getPlacementTarget(), null, 'One wall/post mount cannot stack duplicate torches');
const wallEntry = torch.placedTorches[1];
const wallAxis = mountedTorchAxis(wallEntry);
const wallOutwardNormal = mountOutwardNormal(wallEntry);
assert.ok(wallAxis.y > 0.7, 'Wall-mounted torches must remain angled upward');
assert.ok(
  wallAxis.dot(wallOutwardNormal) > 0.5,
  'Wall-mounted torches must angle out from the wall instead of leaning into it'
);
const wallPresentationClearance =
  (wallEntry.root.position.x - wallTorch.position.x) * wallOutwardNormal.x +
  (wallEntry.root.position.z - wallTorch.position.z) * wallOutwardNormal.z;
assert.ok(
  nearlyEqual(wallPresentationClearance, TORCH.placement.wallVisualOutwardOffset, 0.001),
  'Wall-mounted torch visuals must be pulled forward by the configured anti-clipping clearance'
);

nowMs += 100;
const placedCountBeforeTimeJump = torch.placedTorches.length;
torch.apply({ day: 12, minuteOfDay: 4 * 60 });
assert.equal(
  torch.placedTorches.length,
  placedCountBeforeTimeJump,
  'Placed torches must remain mounted across arbitrarily long world-time jumps'
);
assert.ok(
  torch.placedTorches.every(entry => entry.root.parent === scene),
  'Persistent placed torch visuals must stay in the world'
);
assert.ok(
  torch.placedTorches.every(entry => entry.light.parent === scene),
  'Persistent placed torch lights must stay in the world'
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
assert.ok(
  saved.placedTorches.every(entry => !Object.hasOwn(entry, 'remainingGameMinutes')),
  'New placed-torch saves must not contain obsolete fuel values'
);
const legacySaved = {
  ...saved,
  placedTorches: saved.placedTorches.map(entry => ({ ...entry, remainingGameMinutes: 0.01 }))
};
assert.equal(
  torch.restoreState(legacySaved),
  true,
  'Legacy placed torches must restore even when their old saved fuel was nearly empty'
);
assert.equal(torch.placedTorches.length, saved.placedTorches.length);
assert.equal(inventory.get('torch'), savedInventoryQuantity, 'Restore must not consume inventory again for already-placed torches');
const restoredWallEntry = torch.placedTorches.find(entry => entry.mountKind === 'wall');
assert.ok(restoredWallEntry, 'Restored torch state must retain the wall-mounted entry');
assert.ok(
  mountedTorchAxis(restoredWallEntry).dot(mountOutwardNormal(restoredWallEntry)) > 0.5,
  'Restored wall torches must reconstruct the same outward mounting angle'
);
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
  ['torch save state stays in the dedicated torch persistence boundary', saveSource.includes('state.torch = this.game.torchRuntime?.captureState?.() ?? null') && saveSource.includes('this.game.torchRuntime?.restoreState?.(record.state.torch)')],
  ['placed torch runtime has no burnout status path', !read('src/gameplay/TorchRuntimeController.js').includes('TORCH BURNED OUT')]
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
