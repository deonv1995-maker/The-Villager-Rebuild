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
const candidate = read('src/player/HeroMPresentation.js');
const sproutRuntime = read('src/gameplay/SproutVisualRuntimeController.js');
const main = read('src/main.js');

assert.ok(masculine.includes('TORSO_WIDTH_PROFILE'), 'male profile must use an explicit full-torso width curve');
assert.ok(masculine.includes('[0.82, 1.13]'), 'upper chest must keep a readable but natural width increase');
assert.ok(masculine.includes('[0.20, 0.97]'), 'waist region must retain a mild natural taper without pinching');
assert.ok(masculine.includes('TORSO_DEPTH_PROFILE') && masculine.includes('[0.82, 1.08]'), 'male chest must retain controlled front-to-back depth');
assert.ok(masculine.includes('torsoCenterX') && masculine.includes('torsoCenterZ'), 'torso sculpt must scale around its measured center instead of the mesh origin');
assert.ok(masculine.includes('geometry.userData.masculineTorsoCenter'), 'centered sculpt diagnostics must be recorded');
assert.ok(!masculine.includes('sculptIntegratedArms'), 'arm geometry must stay in its authored native bind space');
assert.ok(!masculine.includes('UPPER_ARM_RADIUS_FACTOR'), 'presentation tuning must not inflate upper arms around reconstructed bind anchors');
assert.ok(!masculine.includes('FOREARM_RADIUS_FACTOR'), 'presentation tuning must not inflate forearms around reconstructed bind anchors');
assert.ok(masculine.includes("masculineArmProfile = 'native-authored-limbs-v2'"), 'native arm-geometry ownership must stay explicit');
assert.ok(masculine.includes('restoreNativeBindLocalPosition'), 'shoulder tuning must reconstruct the captured native bind');
assert.ok(!masculine.includes('SHOULDER_SPREAD'), 'shoulder joints must not be translated laterally away from the authored mesh');
assert.ok(!masculine.includes('ARM_FORWARD_OFFSET'), 'arm continuity pass must not translate shoulder joints forward');
assert.ok(masculine.includes("shoulderOffsetMode = 'native-bind-continuity-v2'"), 'native shoulder-centre continuity must remain explicit');
assert.ok(masculine.includes("visualRevision = 'prisma-rigged-humanoid-v7'"), 'arm-stretch regression fix must expose its visual revision');
assert.ok(masculine.includes("bodySilhouette = 'integrated-masculine-v3'"), 'male silhouette metadata must stay explicit');
assert.ok(masculine.includes("chestProfile = 'natural-pectoral-v3'"), 'natural chest profile must stay explicit');
assert.ok(masculine.includes("armSilhouette = 'native-authored-continuity-v5'"), 'native arm profile must stay explicit');
assert.ok(masculine.includes('PALM_EXTENSION = 0.11'), 'visible tool socket must reach the centre of the visible palm');
assert.ok(masculine.includes("gripProfile = 'upright-palm-center-v3'"), 'visible hand mount must keep its current calibrated grip profile');
assert.ok(appearance.includes('HeroMPresentation as RangerAppearancePresentation'), 'stable Ranger appearance seam must resolve to the selected Hero M presentation');
assert.ok(appearance.includes('MasculinePrismaHumanoidPresentation as RangerAppearancePresentationFallback'), 'proven Prisma body must remain the presentation fallback');
assert.ok(candidate.includes("animationAuthority = 'kaykit-medium-rig'"), 'Hero M must preserve KayKit animation authority');
assert.ok(candidate.includes("actualModelSource = 'user-supplied-hero-m-v1'"), 'selected Hero M source metadata must stay explicit');
assert.ok(candidate.includes("styleProfile = 'playful-low-poly-hero-v1'"), 'Hero M playful visual style must stay explicit');
assert.ok(candidate.includes("presentationFallback = 'prisma-rigged-humanoid'"), 'Hero M must keep explicit Prisma fallback ownership');
assert.ok(candidate.includes("toolAnchor = 'hero-m-outer-hand-grip-v1'"), 'Hero M must retain its geometry-calibrated visible-hand tool seam');
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
assert.equal(torch.visualRoot.parent, visiblePalm, 'handheld torch must transfer from hidden KayKit hand to visible presentation palm');
assert.equal(torch.visibleHandMounted, true, 'torch runtime must record visible-hand ownership');
assert.equal(torch.handMounted, true, 'torch remains hand-mounted for the base presentation contract');
assert.equal(torch.visualRoot.userData.gripProfile, 'visible-palm-back-tip-torch-v3', 'torch must use the dedicated back-tip visible-palm grip');
assert.ok(Math.abs(torch.visualRoot.position.y - 0.27) < 1e-9, 'torch handle back tip must sit at the visible palm origin');
torch.dispose();

console.log('Hero M selected presentation seam, Prisma fallback, visible-hand tool/torch grip, and reduced Sprout relative scale verified.');
