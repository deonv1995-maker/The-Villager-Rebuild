import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CraftingSystem } from '../src/gameplay/CraftingSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { ToolbeltSystem } from '../src/gameplay/ToolbeltSystem.js';
import { VisibleHandTorchRuntimeController } from '../src/gameplay/VisibleHandTorchRuntimeController.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const masculine = read('src/player/MasculinePrismaHumanoidPresentation.js');
const appearance = read('src/player/RangerAppearancePresentation.js');
const sproutRuntime = read('src/gameplay/SproutVisualRuntimeController.js');
const main = read('src/main.js');

assert.ok(masculine.includes('TORSO_SCULPT') && masculine.includes('chestWidth: 0.13'), 'male profile must retain the broader chest sculpt');
assert.ok(masculine.includes('shoulderWidth: 0.11'), 'male profile must retain broader shoulder geometry');
assert.ok(masculine.includes('waistWidth: -0.03'), 'male profile must retain the subtle waist taper');
assert.ok(masculine.includes('geometry.userData.masculineVertexCount'), 'masculine sculpt must record affected geometry for regression diagnostics');
assert.ok(masculine.includes("bodySilhouette = 'broad-masculine-v1'"), 'male silhouette metadata must stay explicit');
assert.ok(masculine.includes("chestProfile = 'emphasized-pectoral-v1'"), 'emphasized chest profile must stay explicit');
assert.ok(masculine.includes('PALM_EXTENSION = 0.085'), 'visible tool socket must advance from wrist into palm');
assert.ok(masculine.includes("gripProfile = 'upright-palm-center-v2'"), 'visible hand mount must keep its calibrated grip profile');
assert.ok(appearance.includes('MasculinePrismaHumanoidPresentation as RangerAppearancePresentation'), 'stable Ranger appearance seam must resolve to the masculine Prisma profile');
assert.ok(sproutRuntime.includes('SPROUT_RELATIVE_PLAYER_SCALE = 0.88'), 'Sprout should remain modestly smaller relative to the player');
assert.ok(sproutRuntime.includes('effectivePresentationScale'), 'Sprout runtime must record effective relative scale for diagnostics');
assert.ok(main.includes("VisibleHandTorchRuntimeController as TorchRuntimeController"), 'game boot must use the visible-hand torch adapter without changing the stable runtime name');

const inventory = new InventorySystem();
const crafting = new CraftingSystem({ inventory });
const toolbelt = new ToolbeltSystem({ inventory, crafting });
inventory.add('stick', 1);
inventory.add('grass', 2);
assert.ok(crafting.craft('torch'));
assert.equal(toolbelt.select('torch').equipped, true);

const scene = new THREE.Scene();
const playerRoot = new THREE.Group();
const legacyHand = new THREE.Group();
legacyHand.name = 'legacy-kaykit-hand';
playerRoot.add(legacyHand);
const visiblePalm = new THREE.Group();
visiblePalm.name = 'prisma-right-hand-tool-mount';
playerRoot.add(visiblePalm);

const game = {
  inventory,
  crafting,
  toolbelt,
  sceneSystem: { scene, renderer: { shadowMap: { needsUpdate: false } } },
  toolPresentation: {
    appearancePresentation: {
      getRightHandToolMount: () => visiblePalm
    }
  },
  player: {
    root: playerRoot,
    mountRightHandObject(object) {
      legacyHand.add(object);
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
  setStatus() {}
};

const torch = new VisibleHandTorchRuntimeController({ game, now: () => 1000 });
assert.equal(torch.visualRoot.parent, visiblePalm, 'handheld torch must transfer from hidden KayKit hand to visible Prisma palm');
assert.equal(torch.visibleHandMounted, true, 'torch runtime must record visible-hand ownership');
assert.equal(torch.handMounted, true, 'torch remains hand-mounted for the base presentation contract');
assert.equal(torch.visualRoot.userData.gripProfile, 'visible-palm-torch-v2', 'torch must use the dedicated upright visible-palm grip');
assert.ok(torch.visualRoot.position.y < 0, 'torch grip origin should pass through the palm instead of floating beside it');
torch.dispose();

console.log('Character silhouette, visible-palm tool/torch grip, and reduced Sprout relative scale verified.');
