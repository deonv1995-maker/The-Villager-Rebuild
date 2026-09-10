import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const hammerMenuSource = fs.readFileSync(new URL('../src/ui/HammerConstructionMenu.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryStyles = fs.readFileSync(new URL('../src/resource-inventory.css', import.meta.url), 'utf8');
const cosyIconStyles = fs.readFileSync(new URL('../src/cosy-icons.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const cosyToolIcons = Object.freeze({
  hand: 'icon-hand.svg',
  axe: 'icon-axe.svg',
  hammer: 'icon-hammer.svg',
  pickaxe: 'icon-pickaxe.svg',
  shovel: 'icon-shovel.svg',
  sword: 'icon-sword.svg',
  campfire: 'icon-campfire.svg',
  jump: 'icon-jump.svg',
  spear: 'icon-spear.svg'
});

const cosyResourceIcons = Object.freeze({
  stick: 'icon-resource-stick.svg',
  stone: 'icon-resource-stone.svg',
  grass: 'icon-resource-grass.svg',
  meat: 'icon-resource-meat.svg',
  log: 'icon-build-raw.svg'
});

const cosyBuildIcons = Object.freeze({
  raw: 'icon-build-raw.svg',
  floor: 'icon-build-floor.svg',
  frame: 'icon-build-frame.svg',
  wall: 'icon-build-wall.svg',
  door: 'icon-build-door.svg',
  window: 'icon-build-window.svg',
  stairs: 'icon-build-stairs.svg',
  roof: 'icon-build-roof.svg',
  drop: 'icon-build-drop.svg'
});

function assertCosyIcon(id, fileName, context) {
  const iconPath = `ui/cosy/${fileName}`;
  assert.match(
    assetPathsSource,
    new RegExp(`${id}: asset\\('${iconPath.replaceAll('.', '\\.')}'\\)`),
    `${context} ${id} must use the approved cosy icon`
  );
  const fileUrl = new URL(`../public/assets/${iconPath}`, import.meta.url);
  assert.ok(fs.existsSync(fileUrl), `${context} ${id} icon must exist in public assets`);
  const source = fs.readFileSync(fileUrl, 'utf8');
  assert.match(source, /<svg[^>]*viewBox="0 0 96 96"/, `${context} ${id} must be a normalized 96x96 SVG`);
  assert.doesNotMatch(source, /<text\b/i, `${context} ${id} must remain language-independent artwork`);
}

for (const [id, fileName] of Object.entries(cosyToolIcons)) {
  assertCosyIcon(id, fileName, 'Tool/action');
}
for (const [id, fileName] of Object.entries(cosyResourceIcons)) {
  assertCosyIcon(id, fileName, 'Resource');
}
for (const [id, fileName] of Object.entries(cosyBuildIcons)) {
  assertCosyIcon(id, fileName, 'Build');
}

assert.match(
  assetPathsSource,
  /angle: asset\('ui\/mobile\/icon-build-angle\.svg'\)/,
  'Legacy/internal angled-log icon must remain separate from the player-facing Stairs icon'
);
const runtimeAssetPaths = assetPathsSource.split('export const ASSET_PATHS = Object.freeze({')[1] ?? '';
assert.doesNotMatch(runtimeAssetPaths, /ui\/survival\//, 'Player-facing runtime paths must not fall back to the older survival icon family');
assert.match(
  mobileHudSource,
  /data-build="stairs"[^>]*aria-label="Split-log stairs"/,
  'Mobile HUD must retain the Stairs button'
);
assert.match(
  mobileHudSource,
  /data-build="stairs"[\s\S]*?<img src="\$\{this\.buildIcons\.stairs\}"/,
  'Stairs must retain its dedicated cosy icon'
);
assert.doesNotMatch(
  mobileHudSource,
  /data-build="angle"/,
  'Mobile HUD must not expose the legacy/internal angled-log mode'
);
assert.match(hammerMenuSource, /door: ui\.build\.door,/, 'Hammer menu Door must resolve through the shared build icon map');
assert.match(hammerMenuSource, /window: ui\.build\.window,/, 'Hammer menu Window must resolve through the shared build icon map');

assert.match(mobileHudSource, /this\.resourceIcons = ui\.resources;/, 'Mobile HUD must use the shared resource icon map');
assert.match(mobileHudSource, /row\.dataset\.resource = entry\.id;/, 'Inventory rows must expose their resource id');
assert.match(mobileHudSource, /icon\.className = 'inventory-resource-icon';/, 'Inventory resources must render as images');
assert.match(mobileHudSource, /icon\.src = this\.resourceIcons\[entry\.id\]/, 'Inventory images must resolve through AssetPaths');
assert.doesNotMatch(mobileHudSource, /label\.textContent = entry\.label;/, 'Inventory must not render resource names as visible text');
assert.match(mobileHudSource, /row\.setAttribute\('aria-label'/, 'Icon-only inventory must retain accessible resource labels');

assert.match(indexSource, /resource-inventory\.css/, 'The resource inventory stylesheet must be loaded');
assert.match(indexSource, /cosy-icons\.css/, 'The cosy icon stylesheet must be loaded');
assert.doesNotMatch(indexSource, /survival-icons\.css/, 'The retired survival icon stylesheet must not be loaded');
assert.match(inventoryStyles, /\.inventory-strip\s*\{[\s\S]*?width: 52px;/, 'Icon inventory should use a compact mobile footprint');
assert.match(inventoryStyles, /\.inventory-resource-icon\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/, 'Resource icons must have a consistent readable size');
assert.match(inventoryStyles, /\.inventory-row strong\s*\{[\s\S]*?position: absolute;/, 'Resource quantities must remain visible as compact badges');
assert.match(
  cosyIconStyles,
  /src\*="\/ui\/cosy\/"[\s\S]*?image-rendering: auto;[\s\S]*?filter: none;/,
  'Cosy icons must keep smooth full-colour vector presentation without legacy pixel filtering'
);

console.log('Approved cosy resource, tool, action and complete semantic build icon set verified');
