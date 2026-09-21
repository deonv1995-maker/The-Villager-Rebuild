import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const controller = read('src/gameplay/SproutCompanionController.js');
const definitions = read('src/data/SproutCompanionDefinitions.js');
const treeHarvest = read('src/world/TreeHarvestSystem.js');
const gatherables = read('src/world/GatherableSystem.js');
const tunneling = read('src/world/UndergroundTunnelingSystem.js');
const explorationPois = read('src/world/ExplorationPoiSystem.js');
const menu = read('src/ui/SproutCommandMenuController.js');
const main = read('src/main.js');
const save = read('src/persistence/SaveGameController.js');
const docs = read('docs/SPROUT_COMPANION.md');
const autonomyDocs = read('docs/SPROUT_AUTONOMY.md');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['Sprout remains command-driven without restoring permanent follow/pathfinding', !controller.includes('PanelTraversalQuery') && !controller.includes('SproutDoorRoutePlanner') && !controller.includes('resolveMove(')],
  ['normal missions use the Ranger hand mount plus grow/launch and return/shrink stages', controller.includes('#mountMiniToHand()') && controller.includes("['Throw', 'Interact', 'Idle_B']") && controller.includes('#updateReturn(command, dt)') && definitions.includes('miniScaleFactor')],
  ['world deployment clears inherited Ranger-hand pitch and roll', controller.includes('this.root.rotation.set(0, Math.atan2(this.playerFacing.x, this.playerFacing.z), 0)') && controller.includes('this.root.rotation.x = 0') && controller.includes('this.root.rotation.z = 0')],
  ['Sprout hand-off poses preserve first-person mode and use a temporary camera-relative Mini Sprout mount', controller.includes('preserveCameraMode: true') && controller.includes('this.player.isFirstPerson?.() && this.player.camera') && controller.includes('this.player.camera.add(this.root)') && definitions.includes('firstPersonMiniOffset')],
  ['stick, grass, stone and mushroom commands are physical gather missions capped at two through five', definitions.includes('gatherMissionMin: 2') && definitions.includes('gatherMissionMax: 5') && definitions.includes("kind: 'gather-resource'") && controller.includes('#updateGatherResource(command, dt)')],
  ['physical pickups still use GatherableSystem reservation and shared InventorySystem', controller.includes('reserveLooseResource?.') && controller.includes('takeReservedLooseResource?.') && controller.includes('this.inventory.add(') && gatherables.includes('{ requireCapacity = true }')],
  ['tree mission preserves the established radius and repeatedly uses shared tree harvest authority', definitions.includes('treeHarvestRange: 18') && controller.includes('command.origin') && controller.includes("command.taskPhase = 'acquire-tree'") && treeHarvest.includes('harvestTree(treeId') && !controller.includes("inventory.add('log'")],
  ['underground scan is hand-held and leaves a five-second faint pocket glow', definitions.includes('undergroundSignalSeconds: 5') && controller.includes("command.definition.kind === 'scan-underground'") && controller.includes('sprout-underground-pocket-glow') && controller.includes('#showPocketSignal(position)')],
  ['surface pocket scans explicitly bypass the legacy underground-only gate without changing its default', definitions.includes('undergroundScanRange: 56') && definitions.includes('undergroundSignalSurfaceLift: 0.18') && controller.includes('{ allowSurface: true }') && tunneling.includes('{ allowSurface = false }') && tunneling.includes('if (!allowSurface && (naturalSurfaceY - y < minimumUndergroundDepth || !this.#columnHasActivity(x, z)))') && explorationPois.includes('options = {}')],
  ['Sprout is stowed while idle and recharges only when unused', controller.includes('!this.command && !this.compression') && controller.includes('energyRechargePerSecond') && controller.includes('this.#stow()')],
  ['energy tuning is centralized and monetization-agnostic', definitions.includes('energyMax: 100') && definitions.includes('energyRechargePerSecond') && controller.includes('grantEnergy(amount, source =')],
  ['mobile Sprout menu exposes command selections and an energy gauge', menu.includes('SPROUT COMMANDS') && menu.includes('sprout-energy-fill') && menu.includes('dataset.sproutCommand')],
  ['main boots the Sprout command menu beside the companion controller', main.includes('SproutCommandMenuController') && main.includes('game.sproutCommandMenu')],
  ['Sprout energy persists independently of in-flight missions', save.includes('record.state.sproutCompanion') && save.includes('captureState?.() ?? null')],
  ['documentation records the physical mission and underground scan contracts', docs.includes('2 through 5') && docs.includes('18 m') && docs.includes('5 seconds') && autonomyDocs.includes('physical mission companion')],
  ['full repository check still includes Sprout regression', packageJson.scripts.check.includes('npm run verify:sprout-companion')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log('PASS ' + label);
  else {
    failed += 1;
    console.error('FAIL ' + label);
  }
}
if (failed > 0) process.exitCode = 1;
else console.log('Sprout companion regression checks passed (' + checks.length + ' contracts).');

await import('./verify-sprout-behavior.mjs');
