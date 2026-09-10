import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const hammerMenuSource = fs.readFileSync(new URL('../src/ui/HammerConstructionMenu.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryStyles = fs.readFileSync(new URL('../src/resource-inventory.css', import.meta.url), 'utf8');
const cosyIconStyles = fs.readFileSync(new URL('../src/cosy-icons.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const cosyToolIcons = Object.freeze({
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

const cosyResourceIcons = Object.freeze({
  stick: 'icon-resource-stick.webp',
  stone: 'icon-resource-stone.webp',
  grass: 'icon-resource-grass.webp',
  meat: 'icon-resource-meat.webp',
  log: 'icon-build-raw.webp'
});

const cosyBuildIcons = Object.freeze({
  raw: 'icon-build-raw.webp',
  floor: 'icon-build-floor.webp',
  frame: 'icon-build-frame.webp',
  wall: 'icon-build-wall.webp',
  door: 'icon-build-door.webp',
  window: 'icon-build-window.webp',
  stairs: 'icon-build-stairs.webp',
  roof: 'icon-build-roof.webp',
  drop: 'icon-build-drop.webp'
});

function assertGeneratedWebp(buffer, context) {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF', `${context} must use a valid RIFF WebP container`);
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WEBP', `${context} must use WebP artwork`);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'VP8X', `${context} must retain the generated extended WebP canvas`);
  assert.ok((buffer[20] & 0x10) !== 0, `${context} must retain transparency`);

  const width = buffer.readUIntLE(24, 3) + 1;
  const height = buffer.readUIntLE(27, 3) + 1;
  assert.deepEqual([width, height], [96, 96], `${context} must remain normalized to 96x96`);
}

function assertCosyIcon(id, fileName, context) {
  const iconPath = `ui/cosy/${fileName}`;
  assert.match(
    assetPathsSource,
    new RegExp(`${id}: asset\\('${iconPath.replaceAll('.', '\\.')}'\\)`),
    `${context} ${id} must use the approved cosy icon`
  );
  const fileUrl = new URL(`../public/assets/${iconPath}`, import.meta.url);
  assert.ok(fs.existsSync(fileUrl), `${context} ${id} icon must exist in public assets`);
  assertGeneratedWebp(fs.readFileSync(fileUrl), `${context} ${id}`);
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
  'Cosy icons must keep smooth full-colour presentation without legacy pixel filtering'
);

console.log('Approved generated cosy resource, tool, action and complete semantic build icon set verified');
