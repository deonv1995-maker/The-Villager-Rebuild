import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const controller = read('src/gameplay/SproutCompanionController.js');
const ranger = read('src/player/RangerController.js');
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
  ['tree mission exposes cutting separately from cyan scanning while preserving presentation-only targeting', controller.includes("this.command?.taskPhase === 'laser'") && controller.includes('cutTarget: cutting') && controller.includes("command.scanning = false") && controller.includes('this.scanTarget = null')],
  ['underground scan is hand-held with a ten-second hold and slow eight-second fade', definitions.includes('undergroundSignalHoldSeconds: 10') && definitions.includes('undergroundSignalFadeSeconds: 8') && controller.includes("command.definition.kind === 'scan-underground'") && controller.includes('sprout-underground-pocket-glow') && controller.includes('#showPocketSignal(position)')],
  ['cave scan raises the held hand and emits exactly three expanding ground-grid pulses', definitions.includes('UNDERGROUND_SCAN_PULSE_COUNT = 3') && definitions.includes('undergroundScanPulseRadius: 18') && definitions.includes('scanHandRaiseOffset') && controller.includes("group.name = 'sprout-ground-grid-scan'") && controller.includes("grid.name = 'sprout-ground-grid-lines'") && controller.includes('this.#applyScanHandRaise(1)') && ranger.includes('setCinematicRightHandOffset') && ranger.includes('#applyCinematicRightHandOffset()')],
  ['manual pocket scans are repeatable and always consider the closest pocket while other geology callers keep hidden-pocket defaults', definitions.includes('undergroundScanRange: 56') && definitions.includes('undergroundSignalSurfaceLift: 0.18') && controller.includes('{ allowSurface: true, includeDiscovered: true }') && tunneling.includes('includeDiscovered = false') && tunneling.includes('if (!includeDiscovered && this.discoveredPocketIds.has(pocket.id)) continue;') && explorationPois.includes('options = {}')],
  ['Sprout is stowed while idle and recharges only when unused', controller.includes('!this.command && !this.compression') && controller.includes('energyRechargePerSecond') && controller.includes('this.#stow()')],
  ['energy tuning is centralized and monetization-agnostic', definitions.includes('energyMax: 100') && definitions.includes('energyRechargePerSecond') && controller.includes('grantEnergy(amount, source =')],
  ['mobile Sprout menu exposes command selections and an energy gauge', menu.includes('SPROUT COMMANDS') && menu.includes('sprout-energy-fill') && menu.includes('dataset.sproutCommand')],
  ['main boots the Sprout command menu beside the companion controller', main.includes('SproutCommandMenuController') && main.includes('game.sproutCommandMenu')],
  ['Sprout energy persists independently of in-flight missions', save.includes('record.state.sproutCompanion') && save.includes('captureState?.() ?? null')],
  ['documentation records the physical mission and repeatable underground scan contracts', docs.includes('2 through 5') && docs.includes('18 m') && docs.includes('three') && docs.includes('ground-grid') && docs.includes('10 seconds') && docs.includes('8-second') && docs.includes('every manual scan') && autonomyDocs.includes('physical mission companion')],
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
