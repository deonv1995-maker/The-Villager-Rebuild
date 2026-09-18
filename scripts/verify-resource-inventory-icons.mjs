import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileHudSource = fs.readFileSync(new URL('../src/ui/MobileHud.js', import.meta.url), 'utf8');
const hammerMenuSource = fs.readFileSync(new URL('../src/ui/HammerConstructionMenu.js', import.meta.url), 'utf8');
const assetPathsSource = fs.readFileSync(new URL('../src/data/AssetPaths.js', import.meta.url), 'utf8');
const inventoryMenuStyles = fs.readFileSync(new URL('../src/inventory-menu.css', import.meta.url), 'utf8');
const cosyIconStyles = fs.readFileSync(new URL('../src/cosy-icons.css', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const cosyToolIcons = Object.freeze({
  hand: 'icon-hand.webp',
  axe: 'icon-axe.webp',
  hammer: 'icon-hammer.webp',
  pickaxe: 'icon-pickaxe.webp',
  shovel: 'icon-shovel.webp',
  sword: 'icon-sword.webp',
  torch: 'icon-torch.webp',
  campfire: 'icon-campfire.webp',
  jump: 'icon-jump.webp',
  spear: 'icon-spear.webp'
});

const cosyResourceIcons = Object.freeze({
  stick: 'icon-resource-stick.webp',
  stone: 'icon-resource-stone.webp',
  grass: 'icon-resource-grass.webp',
  meat: 'icon-resource-meat.webp',
  cooked_meat: 'icon-resource-meat.webp',
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
for (const [id, fileName] of Object.entries({
  suitcase: 'icon-suitcase.svg',
  craftingBench: 'icon-crafting-bench.svg',
  chest: 'icon-storage-chest.svg',
  barrel: 'icon-food-barrel.svg'
})) {
  assert.match(
    assetPathsSource,
    new RegExp(`${id}: asset\\('ui/mobile/${fileName.replaceAll('.', '\\.')}'+\\)`),
    `${id} must resolve through shared mobile assets`
  );
  assert.ok(fs.existsSync(new URL(`../public/assets/ui/mobile/${fileName}`, import.meta.url)), `${id} SVG must exist`);
}
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
assert.match(mobileHudSource, /this\.itemIcons = Object\.freeze\(\{ \.\.\.this\.resourceIcons, \.\.\.this\.toolIcons \}\);/, 'Suitcase inventory must resolve resources and placeables through one icon map');
assert.match(mobileHudSource, /card\.dataset\.resource = entry\.id;/, 'Inventory cards must expose their item id');
assert.match(mobileHudSource, /icon\.className = 'inventory-resource-icon';/, 'Inventory items must render as images');
assert.match(mobileHudSource, /icon\.src = this\.itemIcons\[entry\.id\]/, 'Inventory images must resolve through AssetPaths');
assert.match(mobileHudSource, /label\.textContent = entry\.label;/, 'Suitcase grid must expose collected item names alongside icons');
assert.match(mobileHudSource, /card\.setAttribute\('aria-label'/, 'Inventory grid must retain accessible item labels');
assert.match(mobileHudSource, /data-role="inventory-toggle"/, 'One suitcase toggle must replace the always-visible inventory strip');
assert.match(mobileHudSource, /data-inventory-tab="craft"/, 'Crafting must share the suitcase panel');
assert.doesNotMatch(mobileHudSource, /class="craft-menu-toggle"/, 'Standalone craft toggle must stay retired');

assert.match(indexSource, /inventory-menu\.css/, 'The suitcase inventory stylesheet must be loaded');
assert.match(indexSource, /cosy-icons\.css/, 'The cosy icon stylesheet must be loaded');
assert.doesNotMatch(indexSource, /survival-icons\.css/, 'The retired survival icon stylesheet must not be loaded');
assert.match(inventoryMenuStyles, /\.inventory-menu-toggle\s*\{[\s\S]*?width: 46px;[\s\S]*?height: 46px;/, 'Suitcase toggle must keep a compact mobile footprint');
assert.match(
  inventoryMenuStyles,
  /\.inventory-grid\s*\{[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(82px, 96px\)\);[\s\S]*?justify-content: start;/,
  'Suitcase contents must use a compact non-stretching inventory grid'
);
assert.match(inventoryMenuStyles, /\.inventory-card\s*\{[\s\S]*?min-height: 82px;/, 'Suitcase item blocks must stay compact enough to expose more inventory at once');
assert.match(inventoryMenuStyles, /\.inventory-card \.inventory-resource-icon\s*\{[\s\S]*?width: 38px;[\s\S]*?height: 38px;/, 'Inventory item icons must remain readable inside the opened suitcase');
assert.match(
  inventoryMenuStyles,
  /\.inventory-menu \.craft-menu-list\[hidden\]\s*\{\s*display: none;\s*\}/,
  'Inactive Craft tab must not leak crafting recipes into the Items view'
);
assert.match(
  cosyIconStyles,
  /src\*="\/ui\/cosy\/"[\s\S]*?image-rendering: auto;[\s\S]*?filter: none;/,
  'Cosy icons must keep smooth full-colour presentation without legacy pixel filtering'
);
assert.match(cosyIconStyles, /\.tool-slot\.locked\s*\{[\s\S]*?opacity: 0\.62;/, 'Locked generated tools must remain readable on mobile');
for (const toolId of ['spear', 'pickaxe', 'sword']) {
  assert.match(cosyIconStyles, new RegExp(`data-tool=\"${toolId}\"`), `${toolId} must receive slender-tool mobile normalization`);
}
assert.match(cosyIconStyles, /transform: scale\(1\.12\);/, 'Slender cosy tool silhouettes must be enlarged without replacing their approved assets');

console.log('Approved cosy gameplay icons plus suitcase resource/placeable inventory presentation verified');
