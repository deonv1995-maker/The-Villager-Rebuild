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
  ['Sprout remains one command controller without restoring permanent follow/pathfinding',
    !controller.includes('PanelTraversalQuery')
      && !controller.includes('SproutDoorRoutePlanner')
      && controller.includes("this.collision = game.island.collision ?? null")],
  ['mission locomotion reuses shared world collision only while an active command is deployed',
    controller.includes('this.collision?.resolveMove')
      && controller.includes('#moveToward(target, speed, dt)')
      && controller.includes('airborne: true')
      && controller.includes("command.phase === 'deploy'")],
  ['Sprout is stowed while idle and recharges only when unused',
    controller.includes('!this.command && !this.compression')
      && controller.includes('energyRechargePerSecond')
      && controller.includes('this.#stow()')],
  ['deployment and retrieval use one Ranger-held mini-Sprout cinematic boundary',
    definitions.includes('deploymentSeconds: 1.05')
      && definitions.includes('retrievalSeconds: 0.82')
      && definitions.includes('miniScale: 0.22')
      && controller.includes("this.player.playCinematicAnimation?.(['Throw', 'Interact']")
      && controller.includes("this.player.playCinematicAnimation?.(['Interact', 'Throw']")
      && controller.includes('this.player.getRightHandWorldPosition?.(out)')],
  ['basic resources are collected physically in bounded two-to-five item missions',
    definitions.includes('resourceCollectionRange: 18')
      && definitions.includes('resourceBatchMin: 2')
      && definitions.includes('resourceBatchMax: 5')
      && definitions.includes("kind: 'collect-batch'")
      && controller.includes('#updateBatchCollection(command, dt)')
      && controller.includes('command.collectedCount >= command.targetCount')],
  ['loose Log collection uses the same physical approach and authoritative reservation path',
    definitions.includes('collectionRadius: 18')
      && controller.includes('#updateLooseCollection(command, dt)')
      && controller.includes('this.#beginCompression(live)')
      && gatherables.includes('reserveLooseResource')
      && gatherables.includes('takeReservedLooseResource')],
  ['tree mission preserves the established 18 metre origin, shared tree authority and loops until no trees remain',
    definitions.includes('treeHarvestRange: 18')
      && controller.includes('this.treeHarvest.findNearestActiveTree?.(')
      && controller.includes('command.origin')
      && controller.includes('this.treeHarvest.harvestTree?.(command.treeId, this.root.position)')
      && controller.includes("command.phase = 'acquire'")
      && treeHarvest.includes('findNearestActiveTree')
      && treeHarvest.includes('harvestTree(treeId')],
  ['underground scan is Ranger-held, leaves geology authoritative and exposes a five-second rendering cue',
    definitions.includes('undergroundSignalLingerSeconds: 5')
      && controller.includes("command.phase === 'hand-scan'")
      && controller.includes('getUndiscoveredPocketSignal?.(')
      && controller.includes('this.pocketSignalCue = {')
      && controller.includes('cue.remaining / SPROUT_COMPANION.undergroundSignalLingerSeconds')],
  ['energy tuning is centralized and monetization-agnostic',
    definitions.includes('energyMax: 100')
      && definitions.includes('energyRechargePerSecond')
      && controller.includes("grantEnergy(amount, source = 'gameplay')")],
  ['mobile Sprout menu exposes command selections and an energy gauge',
    menu.includes('SPROUT COMMANDS')
      && menu.includes('sprout-energy-fill')
      && menu.includes('data.sproutCommand') === false
      && menu.includes('dataset.sproutCommand')],
  ['main boots the Sprout command menu beside the companion controller',
    main.includes('SproutCommandMenuController') && main.includes('game.sproutCommandMenu')],
  ['resource discovery queries may ignore capacity while collection still honors it',
    gatherables.includes('{ requireCapacity = true }') && gatherables.includes('requireCapacity && !this.#canStore')],
  ['Sprout energy persists independently of active commands',
    save.includes('record.state.sproutCompanion') && save.includes('captureState?.() ?? null')],
  ['documentation records stowed mission deployment, physical collection and five-second cave signal',
    docs.includes('2–5')
      && docs.includes('18 m')
      && docs.includes('five seconds')
      && autonomyDocs.includes('mission-only')
      && autonomyDocs.includes('shared world collision')],
  ['full repository check still includes Sprout regression',
    packageJson.scripts.check.includes('npm run verify:sprout-companion')]
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
