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

assert.ok(masculine.includes('TORSO_WIDTH_PROFILE'), 'male profile must use an explicit full-torso width curve rather than weak single-bone scaling');
assert.ok(masculine.includes('[0.90, 1.26]'), 'upper chest and shoulder silhouette must retain a clearly readable width increase');
assert.ok(masculine.includes('[0.24, 0.92]'), 'waist region must retain the deliberate V taper');
assert.ok(masculine.includes('TORSO_DEPTH_PROFILE') && masculine.includes('[0.72, 1.17]'), 'male chest must retain readable front-to-back depth');
assert.ok(masculine.includes('geometry.userData.masculineMaxWidthFactor'), 'masculine sculpt must record the actually applied width for regression diagnostics');
assert.ok(masculine.includes("bodySilhouette = 'readable-masculine-v2'"), 'male silhouette metadata must stay explicit');
assert.ok(masculine.includes("chestProfile = 'sculpted-pectoral-v2'"), 'sculpted chest profile must stay explicit');
assert.ok(masculine.includes('ARM_FORWARD_OFFSET = 0.075'), 'relaxed hands must remain visibly forward of the previous behind-hip position');
assert.ok(masculine.includes('PALM_EXTENSION = 0.11'), 'visible tool socket must reach the centre of the visible palm');
assert.ok(masculine.includes("gripProfile = 'upright-palm-center-v3'"), 'visible hand mount must keep its current calibrated grip profile');
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

console.log('Readable masculine silhouette, visible-palm tool/torch grip, and reduced Sprout relative scale verified.');
