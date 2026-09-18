import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveContextAction } from '../src/ui/ContextActionPolicy.js';

const carried = resolveContextAction({
  carryingLog: true,
  buildPreviewValid: true,
  interactionTarget: { type: 'carried-log-build', actionLabel: 'Place Floor' },
  toolId: 'hammer'
});
assert.equal(carried.source, 'interaction');
assert.equal(carried.available, true);
assert.equal(carried.icon, 'hand');
assert.equal(carried.caption, 'PLACE');

const blockedCarried = resolveContextAction({
  carryingLog: true,
  buildPreviewValid: false,
  interactionTarget: { type: 'carried-log-build', actionLabel: 'Cannot place Floor here' }
});
assert.equal(blockedCarried.available, false, 'Invalid build previews must disable the unified Action button');

const chop = resolveContextAction({
  toolId: 'axe',
  interactionTarget: { type: 'tree', actionLabel: 'Chop tree' }
});
assert.equal(chop.source, 'interaction');
assert.equal(chop.icon, 'axe');
assert.equal(chop.caption, 'CHOP');

const mine = resolveContextAction({
  toolId: 'pickaxe',
  interactionTarget: { type: 'rock', actionLabel: 'Mine rock' }
});
assert.equal(mine.source, 'interaction');
assert.equal(mine.caption, 'MINE');

const demolish = resolveContextAction({
  toolId: 'hammer',
  interactionTarget: { type: 'placed-log', actionLabel: 'Demolish wall' }
});
assert.equal(demolish.source, 'interaction');
assert.equal(demolish.icon, 'hammer');

const shovel = resolveContextAction({
  toolId: 'shovel',
  interactionTarget: { type: 'resource', label: 'Log', actionLabel: 'Pick up Log' },
  externalActions: [{
    id: 'shovel-stump',
    priority: 900,
    available: true,
    icon: 'shovel',
    label: 'Dig out stump',
    caption: 'DIG'
  }]
});
assert.equal(shovel.source, 'external', 'Shovel stump action must beat incidental physical Logs dropped around the same tree');
assert.equal(shovel.externalId, 'shovel-stump');
assert.equal(shovel.icon, 'shovel');
assert.equal(shovel.caption, 'DIG');

const spear = resolveContextAction({
  toolId: 'spear',
  huntTarget: { label: 'Wild Pig' },
  interactionTarget: { type: 'resource', label: 'Stick', actionLabel: 'Pick up Stick' }
});
assert.equal(spear.source, 'attack', 'An equipped weapon target must take priority over incidental ground pickups');
assert.equal(spear.caption, 'THROW');

const pickup = resolveContextAction({
  toolId: null,
  interactionTarget: { type: 'resource', label: 'Grass', actionLabel: 'Pick up Grass', icon: 'hand' }
});
assert.equal(pickup.source, 'interaction');
assert.equal(pickup.caption, 'PICK UP');

const legacyCampfireInput = resolveContextAction({
  campfireAction: { available: true, previewing: true, label: 'Confirm campfire placement' },
  interactionTarget: { type: 'resource', label: 'Stone', actionLabel: 'Pick up Stone' }
});
assert.equal(
  legacyCampfireInput.source,
  'interaction',
  'ContextActionPolicy must not reintroduce a special campfire source; placement is an ordinary external action'
);

const craftedPlacement = resolveContextAction({
  externalActions: [{
    id: 'craft-placement',
    priority: 1125,
    available: true,
    icon: 'campfire',
    label: 'Confirm campfire placement',
    caption: 'PLACE'
  }]
});
assert.equal(craftedPlacement.source, 'external', 'Crafted placement must reuse the one unified Action surface');
assert.equal(craftedPlacement.externalId, 'craft-placement');
assert.equal(craftedPlacement.caption, 'PLACE');

const thatch = resolveContextAction({
  externalActions: [{
    id: 'roof-thatch',
    priority: 40,
    available: true,
    icon: 'hand',
    label: 'Continue roof · thatch next panel with 4 Grass',
    caption: 'ROOF · THATCH'
  }]
});
assert.equal(thatch.source, 'external');
assert.equal(thatch.externalId, 'roof-thatch');
assert.equal(thatch.caption, 'ROOF · THATCH');

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const contextActionSource = fs.readFileSync(new URL('../src/ui/ContextActionPolicy.js', import.meta.url), 'utf8');
const stylesSource = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const inventoryMenuStyles = fs.readFileSync(new URL('../src/inventory-menu.css', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const equipmentRuntimeSource = fs.readFileSync(new URL('../src/gameplay/EquipmentRuntimeController.js', import.meta.url), 'utf8');
const placeableRuntimeSource = fs.readFileSync(new URL('../src/gameplay/PlaceableUtilityRuntimeController.js', import.meta.url), 'utf8');
const thatchControllerSource = fs.readFileSync(new URL('../src/gameplay/RoofThatchController.js', import.meta.url), 'utf8');
const rangerControllerSource = fs.readFileSync(new URL('../src/player/RangerController.js', import.meta.url), 'utf8');

assert.match(mobileHudSource, /class="hud-button action"/, 'Mobile HUD must expose one primary Action button');
assert.doesNotMatch(mobileHudSource, /class="hud-button interact"/, 'Legacy interact round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button attack"/, 'Legacy attack round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button craft"/, 'Legacy campfire round button must be removed');
assert.match(mobileHudSource, /setExternalAction\(id, action = null\)/, 'External construction actions must use the same Action surface');
assert.match(mobileHudSource, /setCraftPlacementAction\(action\)/, 'Crafted world placement must keep a dedicated crafting-control state');
assert.match(mobileHudSource, /CRAFT_PLACEMENT_ACTION_ID = 'craft-placement'/, 'Crafted placement must have a stable unified-action id');
assert.match(mobileHudSource, /this\.setExternalAction\(CRAFT_PLACEMENT_ACTION_ID/, 'Active crafted placement must publish into the unified Action surface');
assert.match(mobileHudSource, /this\.onCraft\?\.\(placement\.recipeId \?\? 'campfire'\)/, 'Unified PLACE must delegate confirmation back to the existing crafting handler');
assert.doesNotMatch(mobileHudSource, /if \(action\.source === 'campfire'\)/, 'Unified Action trigger must not contain a special campfire branch');
assert.doesNotMatch(contextActionSource, /source: 'campfire'/, 'Context action policy must not expose a special campfire source');
assert.match(contextActionSource, /STUMP_ACTION_ID = 'shovel-stump'/, 'Context action policy must reserve the shovel stump action ahead of incidental pickups');
assert.match(equipmentRuntimeSource, /#wrapToolUse\(this\.game\.treeHarvest, 'removeStump', 'shovel'\)/, 'Shovel stump removal must consume standard tool durability');
assert.match(equipmentRuntimeSource, /caption: 'DIG'/, 'Shovel must route through the unified Action button as DIG');
assert.match(placeableRuntimeSource, /caption: 'CRAFT'/, 'Approaching a Crafting Bench must expose CRAFT through the unified Action button');
assert.match(placeableRuntimeSource, /caption: 'PLACE'/, 'Inventory placeables must confirm through the unified Action button');
assert.match(mobileHudSource, /shovel: ui\.shovel/, 'Mobile HUD must render a dedicated shovel icon');
assert.match(assetPathsSource, /shovel: asset\('ui\/cosy\/icon-shovel\.webp'\)/, 'Shovel icon path must remain centralized');
assert.ok(fs.existsSync(new URL('../public/assets/ui/cosy/icon-shovel.webp', import.meta.url)), 'Shovel icon asset must exist in public assets');
assert.match(mobileHudSource, /entry\.kind !== 'tool' && entry\.kind !== 'weapon'/, 'Suitcase item grid must keep equipped tools in the existing toolbelt instead of duplicating them');
assert.match(mobileHudSource, /data-role="build-toggle"/, 'Build menu must expose a dedicated collapse control');
assert.match(mobileHudSource, /data-role="build-toggle-icon"/, 'Collapsed build control must show the selected mode icon');
assert.match(mobileHudSource, /#setBuildTrayCollapsed\(collapsed\)/, 'Build menu collapse state must be owned by MobileHud');
assert.match(mobileHudSource, /aria-expanded/, 'Build menu collapse control must expose expansion state');
for (const mode of ['raw', 'floor', 'frame', 'wall', 'stairs', 'roof', 'drop']) {
  assert.match(mobileHudSource, new RegExp(`data-build="${mode}"`), `Build grid must expose ${mode}`);
  assert.match(assetPathsSource, new RegExp(`${mode}: asset\\('ui/cosy/icon-build-${mode}\\.webp'\\)`), `${mode} must use a dedicated build icon asset`);
  assert.ok(
    fs.existsSync(new URL(`../public/assets/ui/cosy/icon-build-${mode}.webp`, import.meta.url)),
    `${mode} build icon must exist in public assets`
  );
  assert.match(mobileHudSource, new RegExp(`data-build="${mode}"[^>]*[\\s\\S]*?<img src="\\$\\{this\\.buildIcons\\.${mode}\\}"`), `${mode} must render its icon instead of a text label`);
}
assert.doesNotMatch(mobileHudSource, /data-build="raw">RAW/, 'Build modes must not fall back to tall text buttons');
assert.match(thatchControllerSource, /setExternalAction\(ACTION_ID/, 'Roof thatching must route through the unified Action button');
assert.match(
  thatchControllerSource,
  /\? 'ROOF · THATCH' : `NEED/,
  'Affordable panel thatching must identify itself as the continuation of the selected ROOF workflow'
);
assert.doesNotMatch(thatchControllerSource, /roof-thatch-tray/, 'Roof thatching must not add a separate mobile button tray');

assert.match(
  stylesSource,
  /\.log-build-tray\s*\{[\s\S]*?right: max\(8px,[\s\S]*?flex-direction: column/,
  'Build tray must remain anchored to the right-side safe area'
);
assert.match(
  stylesSource,
  /\.build-tray-options\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  'Expanded build choices must render as a compact two-column grid'
);
assert.doesNotMatch(
  stylesSource,
  /\.build-tray-options\s*\{[^}]*overflow-y:/,
  'Build grid must not hide roof or drop behind an internal scroll area'
);
assert.match(
  stylesSource,
  /\.log-build-tray\.collapsed \.build-tray-options\s*\{\s*display: none;/,
  'Collapsed build menu must hide only its mode options while leaving the toggle accessible'
);
assert.match(
  inventoryMenuStyles,
  /\.inventory-quick-access\s*\{[\s\S]*?left: max\(10px,[\s\S]*?top: max\(48px,/,
  'Closed inventory quick access must stay high on the left safe area, clear of the movement thumb zone'
);
assert.match(
  inventoryMenuStyles,
  /\.inventory-menu-toggle\s*\{[\s\S]*?width: 46px;/,
  'Closed inventory must retain one compact suitcase button'
);
assert.match(inventoryMenuStyles, /\.inventory-grid\s*\{[\s\S]*?display: grid;/, 'Opened suitcase must expose a grid rather than a permanent resource stack');
assert.match(stylesSource, /\.hud-button\.action\s*\{/, 'Unified Action button needs a dedicated mobile layout');

assert.doesNotMatch(mobileHudSource, /data-role="joystick"/, 'The visible fixed walking thumb grip must be removed');
assert.doesNotMatch(mobileHudSource, /<button class="hud-button sprint"/, 'Sprint must not remain a permanent standalone button');
assert.doesNotMatch(mobileHudSource, /data-role="sprint-target"/, 'Movement must not render a contextual RUN target');
assert.doesNotMatch(mobileHudSource, />RUN</, 'Movement must not render RUN text');
assert.match(mobileHudSource, /const MOVE_SIDE_RATIO = 0\.5;/, 'Mobile controls must split the screen evenly between movement and look');
assert.match(mobileHudSource, /#bindMovement\(\)/, 'Movement must use the hidden touch-surface controller');
assert.match(mobileHudSource, /event\.clientX >= window\.innerWidth \* MOVE_SIDE_RATIO/, 'Left half of the canvas must own movement touches');
assert.match(mobileHudSource, /SPRINT_TARGET_OFFSET_PX = 145/, 'Hidden sprint activation must stay deliberately separated above the movement thumb');
assert.match(mobileHudSource, /sprintDistance <= SPRINT_TARGET_RADIUS_PX/, 'Sliding the movement thumb into the hidden sprint zone must activate sprint');
assert.match(mobileHudSource, /this\.player\.setSprint\(sprinting\)/, 'Hidden sprint gesture must route through the existing sprint state');
assert.match(mobileHudSource, /this\.player\.beginCameraLook\?\.\(\)/, 'Right-side look must explicitly suspend automatic camera recentering');
assert.match(mobileHudSource, /this\.player\.endCameraLook\?\.\(\)/, 'Releasing right-side look must request smooth automatic recentering');

assert.match(rangerControllerSource, /ANALOG_WALK_MIN_SPEED/, 'Ranger movement must expose a low analog walking speed');
assert.match(rangerControllerSource, /ANALOG_WALK_MAX_SPEED/, 'Ranger movement must expose a high analog walking speed below sprint');
assert.match(rangerControllerSource, /THREE\.MathUtils\.lerp\(ANALOG_WALK_MIN_SPEED, ANALOG_WALK_MAX_SPEED, analogStrength\)/, 'Analog thumb distance must continuously control movement speed');
assert.match(rangerControllerSource, /beginCameraLook\(\)/, 'Ranger controller must expose manual-look ownership');
assert.match(rangerControllerSource, /endCameraLook\(\)/, 'Ranger controller must expose manual-look release');
assert.match(rangerControllerSource, /CAMERA_DEFAULT_PITCH = 0\.12/, 'Automatic camera return must settle into a forward-looking default pitch');
assert.match(rangerControllerSource, /CAMERA_RETURN_DELAY = 1\.25/, 'Camera must pause noticeably before returning from a manual look');
assert.match(rangerControllerSource, /desiredYaw = this\.root\.rotation\.y \+ Math\.PI/, 'Automatic camera heading must follow behind the Ranger');
assert.match(rangerControllerSource, /#dampAngle\(current, target, response, dt\)/, 'Camera heading changes must use angular damping instead of snapping');
assert.match(rangerControllerSource, /CAMERA_FOLLOW_RESPONSE = 0\.78/, 'Automatic follow must deliberately trail Ranger turns');
assert.match(rangerControllerSource, /CAMERA_RETURN_RESPONSE = 0\.5/, 'Manual camera return must remain slower than ordinary follow');
assert.match(rangerControllerSource, /CAMERA_PITCH_RESPONSE = 0\.7/, 'Manual camera pitch recovery must remain relaxed rather than snapping back');
assert.match(rangerControllerSource, /CAMERA_POSITION_RESPONSE = 4\.2/, 'Camera position must use relaxed positional damping instead of tight snapping');

console.log('Unified mobile actions, suitcase HUD, bench crafting, one-button placement, cosy building grid, hidden all-speed movement and relaxed follow camera verified');
