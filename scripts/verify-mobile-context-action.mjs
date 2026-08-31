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
    caption: '4 GRASS'
  }]
});
assert.equal(thatch.source, 'external');
assert.equal(thatch.externalId, 'roof-thatch');
assert.equal(thatch.caption, '4 GRASS');

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const stylesSource = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const thatchControllerSource = fs.readFileSync(new URL('../src/gameplay/RoofThatchController.js', import.meta.url), 'utf8');

assert.match(mobileHudSource, /class="hud-button action"/, 'Mobile HUD must expose one primary Action button');
assert.doesNotMatch(mobileHudSource, /class="hud-button interact"/, 'Legacy interact round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button attack"/, 'Legacy attack round button must be removed');
assert.doesNotMatch(mobileHudSource, /class="hud-button craft"/, 'Legacy campfire round button must be removed');
assert.match(mobileHudSource, /setExternalAction\(id, action = null\)/, 'External construction actions must use the same Action surface');
assert.match(thatchControllerSource, /setExternalAction\(ACTION_ID/, 'Roof thatching must route through the unified Action button');
assert.doesNotMatch(thatchControllerSource, /roof-thatch-tray/, 'Roof thatching must not add a separate mobile button tray');

assert.match(stylesSource, /\.log-build-tray\s*\{[\s\S]*?top: max\(4px, calc\(env\(safe-area-inset-top\) \+ 2px\)\)/, 'Build tray must sit at the top safe area');
assert.match(stylesSource, /\.inventory-strip\s*\{[\s\S]*?flex-direction: column/, 'Inventory must render as a vertical stack');
assert.match(stylesSource, /\.mobile-hud\.log-carrying \.inventory-strip\s*\{[\s\S]*?top: max\(51px/, 'Inventory must stack below the top construction bar while building');
assert.match(stylesSource, /\.hud-button\.action\s*\{/, 'Unified Action button needs a dedicated mobile layout');

console.log('Unified mobile Action routing, top construction bar and stacked inventory verified');
