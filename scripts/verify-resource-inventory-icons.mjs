import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryStyles = fs.readFileSync(new URL('../src/resource-inventory.css', import.meta.url), 'utf8');
const survivalIconStyles = fs.readFileSync(new URL('../src/survival-icons.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const survivalToolIcons = Object.freeze({
  hand: 'icon-hand.webp',
  axe: 'icon-axe.webp',
  hammer: 'icon-hammer.webp',
  pickaxe: 'icon-pickaxe.webp',
  shovel: 'icon-shovel.webp',
  sword: 'icon-sword.webp',
  campfire: 'icon-campfire.webp',
  jump: 'icon-jump.webp',
  spear: 'icon-spear.webp'
});

const survivalResourceIcons = Object.freeze({
  stick: 'icon-resource-stick.webp',
  stone: 'icon-resource-stone.webp',
  grass: 'icon-resource-grass.webp',
  meat: 'icon-resource-meat.webp'
});

const survivalBuildIcons = Object.freeze({
  raw: 'icon-build-raw.webp',
  floor: 'icon-build-floor.webp',
  frame: 'icon-build-frame.webp',
  wall: 'icon-build-wall.webp',
  stairs: 'icon-build-stairs.webp',
  roof: 'icon-build-roof.webp',
  drop: 'icon-build-drop.webp'
});

function assertSurvivalIcon(id, fileName, context) {
  const iconPath = `ui/survival/${fileName}`;
  assert.match(
    assetPathsSource,
    new RegExp(`${id}: asset\\('${iconPath.replaceAll('.', '\\.')}'\\)`),
    `${context} ${id} must use the approved survival icon`
  );
  assert.ok(
    fs.existsSync(new URL(`../public/assets/${iconPath}`, import.meta.url)),
    `${context} ${id} icon must exist in public assets`
  );
}

for (const [id, fileName] of Object.entries(survivalToolIcons)) {
  assertSurvivalIcon(id, fileName, 'Tool/action');
}
for (const [id, fileName] of Object.entries(survivalResourceIcons)) {
  assertSurvivalIcon(id, fileName, 'Resource');
}
for (const [id, fileName] of Object.entries(survivalBuildIcons)) {
  assertSurvivalIcon(id, fileName, 'Build');
}

assert.match(
  assetPathsSource,
  /angle: asset\('ui\/mobile\/icon-build-angle\.svg'\)/,
  'Legacy/internal angled-log icon must remain separate from the player-facing Stairs icon'
);
assert.match(
  mobileHudSource,
  /data-build="stairs"[^>]+aria-label="Split-log stairs"[^>]+this\.buildIcons\.stairs/,
  'Mobile HUD must expose the player-facing split-log Stairs build mode'
);
assert.doesNotMatch(
  mobileHudSource,
  /data-build="angle"/,
  'Mobile HUD must not expose the legacy/internal angled-log mode'
);

assert.match(mobileHudSource, /this\.resourceIcons = ui\.resources;/, 'Mobile HUD must use the shared resource icon map');
assert.match(mobileHudSource, /row\.dataset\.resource = entry\.id;/, 'Inventory rows must expose their resource id');
assert.match(mobileHudSource, /icon\.className = 'inventory-resource-icon';/, 'Inventory resources must render as images');
assert.match(mobileHudSource, /icon\.src = this\.resourceIcons\[entry\.id\]/, 'Inventory images must resolve through AssetPaths');
assert.doesNotMatch(mobileHudSource, /label\.textContent = entry\.label;/, 'Inventory must not render resource names as visible text');
assert.match(mobileHudSource, /row\.setAttribute\('aria-label'/, 'Icon-only inventory must retain accessible resource labels');

assert.match(indexSource, /resource-inventory\.css/, 'The resource inventory stylesheet must be loaded');
assert.match(indexSource, /survival-icons\.css/, 'The survival icon stylesheet must be loaded');
assert.match(inventoryStyles, /\.inventory-strip\s*\{[\s\S]*?width: 52px;/, 'Icon inventory should use a compact mobile footprint');
assert.match(inventoryStyles, /\.inventory-resource-icon\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/, 'Resource icons must have a consistent readable size');
assert.match(inventoryStyles, /\.inventory-row strong\s*\{[\s\S]*?position: absolute;/, 'Resource quantities must remain visible as compact badges');
assert.match(
  survivalIconStyles,
  /src\*="\/ui\/survival\/"[\s\S]*?image-rendering: auto;[\s\S]*?filter: none;/,
  'Survival icons must keep their painted full-colour presentation instead of fantasy pixel filtering'
);

console.log('Approved rustic survival icon set verified');
