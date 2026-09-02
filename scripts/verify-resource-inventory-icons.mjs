import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryStyles = fs.readFileSync(new URL('../src/resource-inventory.css', import.meta.url), 'utf8');
const hudStyles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const resourceId of ['stick', 'stone', 'grass', 'meat']) {
  assert.match(
    assetPathsSource,
    new RegExp(`${resourceId}: asset\\('ui/fantasy/icon-resource-${resourceId}\\.png'\\)`),
    `${resourceId} must use its selected fantasy resource icon asset`
  );
  assert.ok(
    fs.existsSync(new URL(`../public/assets/ui/fantasy/icon-resource-${resourceId}.png`, import.meta.url)),
    `${resourceId} resource icon must exist in public assets`
  );
}

for (const iconId of ['axe', 'hammer', 'pickaxe', 'sword', 'campfire']) {
  assert.match(
    assetPathsSource,
    new RegExp(`${iconId}: asset\\('ui/fantasy/icon-${iconId}\\.png'\\)`),
    `${iconId} must use its selected fantasy icon asset`
  );
  assert.ok(
    fs.existsSync(new URL(`../public/assets/ui/fantasy/icon-${iconId}.png`, import.meta.url)),
    `${iconId} fantasy icon must exist in public assets`
  );
}

assert.match(mobileHudSource, /this\.resourceIcons = ui\.resources;/, 'Mobile HUD must use the shared resource icon map');
assert.match(mobileHudSource, /row\.dataset\.resource = entry\.id;/, 'Inventory rows must expose their resource id');
assert.match(mobileHudSource, /icon\.className = 'inventory-resource-icon';/, 'Inventory resources must render as images');
assert.match(mobileHudSource, /icon\.src = this\.resourceIcons\[entry\.id\]/, 'Inventory images must resolve through AssetPaths');
assert.doesNotMatch(mobileHudSource, /label\.textContent = entry\.label;/, 'Inventory must not render resource names as visible text');
assert.match(mobileHudSource, /row\.setAttribute\('aria-label'/, 'Icon-only inventory must retain accessible resource labels');

assert.match(indexSource, /resource-inventory\.css/, 'The resource inventory stylesheet must be loaded');
assert.match(inventoryStyles, /\.inventory-strip\s*\{[\s\S]*?width: 52px;/, 'Icon inventory should use a compact mobile footprint');
assert.match(inventoryStyles, /\.inventory-resource-icon\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/, 'Resource icons must have a consistent readable size');
assert.match(inventoryStyles, /\.inventory-row strong\s*\{[\s\S]*?position: absolute;/, 'Resource quantities must remain visible as compact badges');
assert.match(hudStyles, /img\[src\*="\/ui\/fantasy\/"\][\s\S]*?image-rendering: pixelated;[\s\S]*?filter: none;/, 'Fantasy icons must retain crisp pixels and original colour');

console.log('Curated fantasy tool and resource icons verified');
