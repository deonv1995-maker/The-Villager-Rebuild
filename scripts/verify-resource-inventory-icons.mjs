import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryStyles = fs.readFileSync(new URL('../src/resource-inventory.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const resourceId of ['stick', 'stone', 'grass', 'meat']) {
  assert.match(
    assetPathsSource,
    new RegExp(`${resourceId}: asset\\('ui/mobile/icon-resource-${resourceId}\\.svg'\\)`),
    `${resourceId} must use a dedicated resource icon asset`
  );
  assert.ok(
    fs.existsSync(new URL(`../public/assets/ui/mobile/icon-resource-${resourceId}.svg`, import.meta.url)),
    `${resourceId} resource icon must exist in public assets`
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

console.log('Icon-only mobile resource inventory verified');
