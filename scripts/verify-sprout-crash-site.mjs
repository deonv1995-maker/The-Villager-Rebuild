import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const main = read('src/main.js');
const definitions = read('src/data/SproutArrivalDefinitions.js');
const controller = read('src/gameplay/SproutArrivalController.js');
const crashSite = read('src/world/SproutCrashSiteSystem.js');
const saveController = read('src/persistence/SaveGameController.js');
const mobileHud = read('src/ui/MobileHud.js');
const css = read('src/sprout.css');
const docs = read('docs/SPROUT_COMPANION.md');

const mainArrivalIndex = main.indexOf('onComplete: () => {');
const sproutBeginIndex = main.indexOf('sproutArrival.beginAfterArrival()', mainArrivalIndex);
const saveStartIndex = main.indexOf('saveController.start({ saveImmediately: true })', mainArrivalIndex);

const checks = [
  ['gameplay boots one Sprout arrival controller before SaveGameController', main.includes('new SproutArrivalController({') && main.indexOf('new SproutArrivalController({') < main.indexOf('new SaveGameController({ game, store: saveStore })')],
  ['fresh-game Sprout impact begins only after the beach arrival completes', mainArrivalIndex >= 0 && sproutBeginIndex > mainArrivalIndex],
  ['fresh-game Sprout story exists before the first post-arrival save checkpoint', sproutBeginIndex >= 0 && saveStartIndex > sproutBeginIndex],
  ['Sprout arrival has one centrally tuned phase/config source', definitions.includes("IMPACTING: 'impacting'") && definitions.includes("INVESTIGATE: 'investigate'") && definitions.includes("DIALOGUE: 'dialogue'") && definitions.includes("ALLIED: 'allied'") && definitions.includes('impactDurationSeconds') && definitions.includes('rescueRadius')],
  ['crash site resolves from live spawn/island geometry instead of one hard-coded world coordinate', crashSite.includes('this.island.getSpawnPoint?.()') && crashSite.includes('centerX - spawn.x') && crashSite.includes('this.island.isPlayable?.') && crashSite.includes('this.collision.isCircleClear')],
  ['gameplay continuation shows a descending blue object and a persistent crash-site beacon', crashSite.includes("incoming.name = 'sprout-gameplay-incoming-object'") && crashSite.includes("this.smoke.name = 'sprout-blue-impact-smoke'") && crashSite.includes('updateImpact(progress)')],
  ['physical crash site contains pod, fallen tree and swappable Sprout placeholder presentation', crashSite.includes("pod.name = 'sprout-crashed-pod-core'") && crashSite.includes("root.name = 'sprout-rescue-fallen-tree'") && crashSite.includes("root.name = 'sprout-placeholder-companion'")],
  ['fallen rescue tree blocks traversal until the rescue completes', crashSite.includes("type: 'sprout-crash-tree'") && crashSite.includes('this.collision.removeObstacle(this.treeCollider)') && crashSite.includes('completeRescue()')],
  ['investigation objective gives distance feedback and exposes a bounded FREE action', controller.includes('Investigate the blue crash site') && controller.includes('SPROUT_ARRIVAL.rescueRadius') && controller.includes("caption: 'FREE'") && controller.includes("setExternalAction('sprout-rescue'")],
  ['desktop E can trigger the same rescue action as mobile', controller.includes("event.code === 'KeyE'") && controller.includes('this.#beginRescue()')],
  ['rescue/dialogue uses Ranger cinematic ownership rather than a second player controller', controller.includes('this.player.beginCinematic(this)') && controller.includes('this.player.endCinematic(this)') && controller.includes("playCinematicAnimation(['Interact', 'Working', 'Idle_B']")],
  ['Sprout boot/allegiance dialogue is mobile safe-area aware', definitions.includes("speaker: 'SPROUT'") && controller.includes("panel.className = 'sprout-dialogue'") && css.includes('safe-area-inset-bottom') && css.includes('@media (orientation: landscape)')],
  ['story slice does not create a second inventory or award resources', !controller.includes('inventory.add') && !controller.includes('inventory.consume') && !crashSite.includes('inventory.add') && !crashSite.includes('inventory.consume')],
  ['existing HUD external-action boundary is reused instead of adding another gameplay button system', mobileHud.includes('setExternalAction(id, action = null)') && controller.includes("setExternalAction('sprout-rescue'")],
  ['Sprout story state is captured and restored through the shared save controller', saveController.includes('state.sproutArrival = this.game.sproutArrival?.captureState?.() ?? null') && saveController.includes('this.game.sproutArrival?.restoreState?.(record.state.sproutArrival)')],
  ['Sprout story restore occurs after shared Ranger restore so dialogue cinematic ownership cannot block teleport restore', saveController.indexOf('restoreGameState(this.game, record.state)') < saveController.indexOf('this.game.sproutArrival?.restoreState?.(record.state.sproutArrival)')],
  ['pre-Sprout saves are deliberately skipped rather than replaying the opening in an established world', controller.includes('PHASE.LEGACY_SKIPPED') && controller.includes('legacySkipped: true')],
  ['story milestones request explicit save checkpoints', controller.includes("saveNow?.('sprout-impact')") && controller.includes("saveNow?.('sprout-rescue')") && controller.includes("saveNow?.('sprout-allied')")],
  ['documentation keeps production Sprout art and physical tree felling as later slices while companion retrieval is now active', docs.includes('production Sprout 3D asset') && docs.includes('tree-felling animation/state') && docs.includes('Once allied, Sprout follows the Ranger')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failed > 0) process.exitCode = 1;
else console.log(`Sprout crash-site regression checks passed (${checks.length} contracts).`);
