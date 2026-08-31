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

const campfirePreview = resolveContextAction({
  campfireAction: { available: true, previewing: true, label: 'Confirm campfire placement' },
  interactionTarget: { type: 'resource', label: 'Stone', actionLabel: 'Pick up Stone' }
});
assert.equal(campfirePreview.source, 'campfire', 'An active placement preview must keep ownership of the Action button');
assert.equal(campfirePreview.caption, 'PLACE');

const thatch = resolveContextAction({
  externalActions: [{
    id: 'roof-thatch',
    priority: 40,
    available: true,
    icon: 'hand',
    label: 'Thatch roof panel with 4 Grass',
    caption: 'THATCH'
  }]
});
assert.equal(thatch.source, 'external');
assert.equal(thatch.externalId, 'roof-thatch');
assert.equal(thatch.caption, 'THATCH');

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const stylesSource = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const thatchControllerSource = fs.readFileSync(new URL('../src/gameplay/RoofThatchController.js', import.meta.url), 'utf8');
const rangerControllerSource = fs.readFileSync(new URL('../src/player/RangerController.js', import.meta.url), 'utf8');

assert.match(mobileHudSource, /class="hud-button action"/, 'Mobile HUD must expose one primary Action button');
assert.doesNotMatch(mobileHudSource, /class="hud-button interact"/, 'Legacy interact round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button attack"/, 'Legacy attack round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button craft"/, 'Legacy campfire round button must be removed');
assert.match(mobileHudSource, /setExternalAction\(id, action = null\)/, 'External construction actions must use the same Action surface');
assert.match(mobileHudSource, /data-role="build-toggle"/, 'Build menu must expose a dedicated collapse control');
assert.match(mobileHudSource, /#setBuildTrayCollapsed\(collapsed\)/, 'Build menu collapse state must be owned by MobileHud');
assert.match(mobileHudSource, /aria-expanded/, 'Build menu collapse control must expose expansion state');
assert.match(thatchControllerSource, /setExternalAction\(ACTION_ID/, 'Roof thatching must route through the unified Action button');
assert.match(thatchControllerSource, /\? 'THATCH' : `NEED/, 'Affordable roof thatching must identify itself explicitly as THATCH');
assert.doesNotMatch(thatchControllerSource, /roof-thatch-tray/, 'Roof thatching must not add a separate mobile button tray');

assert.match(
  stylesSource,
  /\.log-build-tray\s*\{[\s\S]*?right: max\(8px,[\s\S]*?flex-direction: column/,
  'Build tray must render as a vertical right-side construction menu'
);
assert.match(
  stylesSource,
  /\.log-build-tray\.collapsed \.build-tray-options\s*\{\s*display: none;/,
  'Collapsed build menu must hide only its mode options while leaving the toggle accessible'
);
assert.match(
  stylesSource,
  /\.inventory-strip\s*\{[\s\S]*?left: max\(10px,[\s\S]*?right: auto;[\s\S]*?flex-direction: column/,
  'Inventory must remain a vertical stack on the left side'
);
assert.match(stylesSource, /\.hud-button\.action\s*\{/, 'Unified Action button needs a dedicated mobile layout');

assert.doesNotMatch(mobileHudSource, /data-role="joystick"/, 'The visible fixed walking thumb grip must be removed');
assert.doesNotMatch(mobileHudSource, /<button class="hud-button sprint"/, 'Sprint must not remain a permanent standalone button');
assert.match(mobileHudSource, /data-role="sprint-target"[^>]*hidden/, 'Sprint target must be hidden until a movement touch begins');
assert.match(mobileHudSource, /const MOVE_SIDE_RATIO = 0\.5;/, 'Mobile controls must split the screen evenly between movement and look');
assert.match(mobileHudSource, /#bindMovement\(\)/, 'Movement must use the hidden touch-surface controller');
assert.match(mobileHudSource, /event\.clientX >= window\.innerWidth \* MOVE_SIDE_RATIO/, 'Left half of the canvas must own movement touches');
assert.match(mobileHudSource, /SPRINT_TARGET_OFFSET_PX = 145/, 'Sprint target needs deliberate separation above the movement thumb');
assert.match(mobileHudSource, /sprintDistance <= SPRINT_TARGET_RADIUS_PX/, 'Sliding the movement thumb into the contextual target must activate sprint');
assert.match(mobileHudSource, /this\.player\.setSprint\(sprinting\)/, 'Contextual sprint gesture must route through the existing sprint state');
assert.match(mobileHudSource, /this\.player\.beginCameraLook\?\.\(\)/, 'Right-side look must explicitly suspend automatic camera recentering');
assert.match(mobileHudSource, /this\.player\.endCameraLook\?\.\(\)/, 'Releasing right-side look must request smooth automatic recentering');

assert.match(rangerControllerSource, /ANALOG_WALK_MIN_SPEED/, 'Ranger movement must expose a low analog walking speed');
assert.match(rangerControllerSource, /ANALOG_WALK_MAX_SPEED/, 'Ranger movement must expose a high analog walking speed below sprint');
assert.match(rangerControllerSource, /THREE\.MathUtils\.lerp\(ANALOG_WALK_MIN_SPEED, ANALOG_WALK_MAX_SPEED, analogStrength\)/, 'Analog thumb distance must continuously control movement speed');
assert.match(rangerControllerSource, /beginCameraLook\(\)/, 'Ranger controller must expose manual-look ownership');
assert.match(rangerControllerSource, /endCameraLook\(\)/, 'Ranger controller must expose manual-look release');
assert.match(rangerControllerSource, /CAMERA_RETURN_DELAY = 0\.35/, 'Camera must pause briefly before returning from a manual look');
assert.match(rangerControllerSource, /desiredYaw = this\.root\.rotation\.y \+ Math\.PI/, 'Automatic camera heading must follow behind the Ranger');
assert.match(rangerControllerSource, /#dampAngle\(current, target, response, dt\)/, 'Camera heading changes must use angular damping instead of snapping');
assert.match(rangerControllerSource, /CAMERA_RETURN_RESPONSE = 2\.15/, 'Manual camera return must use a slower premium-feeling response');

console.log('Unified mobile actions, hidden all-speed movement, contextual sprint gesture and smooth follow camera verified');
