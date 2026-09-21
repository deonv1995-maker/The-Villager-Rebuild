import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const controller = read('src/gameplay/SproutCompanionController.js');
const definitions = read('src/data/SproutCompanionDefinitions.js');
const treeHarvest = read('src/world/TreeHarvestSystem.js');
const gatherables = read('src/world/GatherableSystem.js');
const menu = read('src/ui/SproutCommandMenuController.js');
const main = read('src/main.js');
const save = read('src/persistence/SaveGameController.js');
const docs = read('docs/SPROUT_COMPANION.md');
const autonomyDocs = read('docs/SPROUT_AUTONOMY.md');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['Sprout has one command controller and no follow/pathfinding dependency', !controller.includes('PanelTraversalQuery') && !controller.includes('SproutDoorRoutePlanner') && !controller.includes('resolveMove(')],
  ['Sprout is stowed while idle and recharges only when unused', controller.includes('!this.command && !this.compression') && controller.includes('energyRechargePerSecond') && controller.includes('this.#stow()')],
  ['energy tuning is centralized and monetization-agnostic', definitions.includes('energyMax: 100') && definitions.includes('energyRechargePerSecond') && controller.includes('grantEnergy(amount, source =')],
  ['mobile Sprout menu exposes command selections and an energy gauge', menu.includes('SPROUT COMMANDS') && menu.includes('sprout-energy-fill') && menu.includes('data.sproutCommand') === false && menu.includes('dataset.sproutCommand')],
  ['main boots the Sprout command menu beside the companion controller', main.includes('SproutCommandMenuController') && main.includes('game.sproutCommandMenu')],
  ['tree laser uses shared tree authority rather than direct log grants', treeHarvest.includes('findNearestActiveTree') && treeHarvest.includes('harvestTree(treeId') && treeHarvest.includes('#applyChop') && !controller.includes("inventory.add('log'")],
  ['resource scans may ignore capacity while collection still honors it', gatherables.includes('{ requireCapacity = true }') && gatherables.includes('requireCapacity && !this.#canStore')],
  ['Sprout energy persists independently of active commands', save.includes('record.state.sproutCompanion') && save.includes('captureState?.() ?? null')],
  ['documentation records stowed command-driven Sprout architecture', docs.includes('stowed') && docs.includes('passive recharge') && docs.includes('laser') && autonomyDocs.includes('command-driven')],
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
