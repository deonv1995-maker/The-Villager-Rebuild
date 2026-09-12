import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const main = read('src/main.js');
const definitions = read('src/data/SproutArrivalDefinitions.js');
const controller = read('src/gameplay/SproutArrivalController.js');
const crashSite = read('src/world/SproutCrashSiteSystem.js');
const island = read('src/world/TestIslandSystem.js');
const grass = read('src/world/GrassFieldSystem.js');
const groundCover = read('src/world/GroundCoverPresentationSystem.js');
const titleCelestial = read('src/startup/TitleCelestialEvent.js');
const saveController = read('src/persistence/SaveGameController.js');
const persistence = read('src/persistence/GameStatePersistence.js');
const mobileHud = read('src/ui/MobileHud.js');
const css = read('src/sprout.css');
const docs = read('docs/SPROUT_CRASH_SCENE.md');

const mainArrivalIndex = main.indexOf('onComplete: () => {');
const sproutBeginIndex = main.indexOf('sproutArrival.beginAfterArrival()', mainArrivalIndex);
const saveStartIndex = main.indexOf('saveController.start({ saveImmediately: true })', mainArrivalIndex);

const checks = [
  ['gameplay boots one Sprout arrival controller before SaveGameController', main.includes('new SproutArrivalController({') && main.indexOf('new SproutArrivalController({') < main.indexOf('new SaveGameController({ game, store: saveStore })')],
  ['fresh-game Sprout impact begins only after the beach arrival completes', mainArrivalIndex >= 0 && sproutBeginIndex > mainArrivalIndex],
  ['fresh-game Sprout story exists before the first post-arrival save checkpoint', sproutBeginIndex >= 0 && saveStartIndex > sproutBeginIndex],
  ['Sprout arrival has one centrally tuned phase/config source', definitions.includes("IMPACTING: 'impacting'") && definitions.includes("INVESTIGATE: 'investigate'") && definitions.includes("DIALOGUE: 'dialogue'") && definitions.includes("ALLIED: 'allied'") && definitions.includes('impactDurationSeconds') && definitions.includes('rescueRadius')],
  ['title and gameplay share one authored incoming approach direction', definitions.includes('approachDirection: Object.freeze({ x: -3, z: 1 })') && definitions.includes('titleHorizontalDistance') && titleCelestial.includes('SPROUT_ARRIVAL.incoming') && titleCelestial.includes('incoming.approachDirection.x') && crashSite.includes('#getApproachDirection()') && crashSite.includes('SPROUT_ARRIVAL.incoming.approachDirection')],
  ['crash site resolves from live spawn/island geometry instead of one hard-coded world coordinate', crashSite.includes('this.island.getSpawnPoint?.()') && crashSite.includes('centerX - spawn.x') && crashSite.includes('this.island.isPlayable?.') && crashSite.includes('this.collision.isCircleClear')],
  ['gameplay continuation shows the same-direction descending blue object with a plasma trail and persistent beacon', crashSite.includes("this.incoming.name = 'sprout-gameplay-incoming-object'") && crashSite.includes("this.incomingTrail.name = 'sprout-gameplay-plasma-tail'") && crashSite.includes("this.smoke.name = 'sprout-blue-impact-smoke'") && crashSite.includes('updateImpact(progress)')],
  ['impact accelerates hard into the final contact instead of easing gracefully to rest', crashSite.includes('Math.pow(t, 2.65)') && crashSite.includes("this.impactShockwave.name = 'sprout-impact-shockwave'") && crashSite.includes('shockT * 5.8')],
  ['impact tree uses the same authored forest-tree asset family as normal island trees', crashSite.includes('GLTFLoader') && crashSite.includes('ASSET_PATHS.forest.treeBroad') && crashSite.includes("tree.name = 'sprout-impact-live-forest-tree'")],
  ['impact converts the tree obstruction into a pile built from the standard RawLog visual', crashSite.includes("createPhysicalLogVisual('RawLog')") && crashSite.includes('CRASH_LOG_TRAPPED') && crashSite.includes("log.name = `sprout-rescue-log-${index}`")],
  ['Ranger rescue moves the individual impact logs instead of sliding one fake tree prop', crashSite.includes('this.rescueLogs.forEach((log, index) =>') && crashSite.includes('CRASH_LOG_CLEARED') && crashSite.includes('updateRescue(progress)')],
  ['impact-log pile blocks traversal until rescue completes', crashSite.includes("type: 'sprout-crash-log-pile'") && crashSite.includes('this.collision.removeObstacle(this.treeCollider)') && crashSite.includes('completeRescue()')],
  ['alliance hands the cleared logs into the existing Gatherable system for Sprout compression', crashSite.includes('if (allied && this.freed && !this.logsReleased)') && crashSite.includes("this.gatherables.spawn('log'") && crashSite.includes('#releaseLogsToGatherables()')],
  ['crash-log handoff checks restored dynamic logs before spawning so Continue cannot duplicate the showcase pile', crashSite.includes("String(item.id).startsWith('spawn-')") && crashSite.includes('existing.length < CRASH_LOG_COUNT') && persistence.includes(".filter(item => /^spawn-\\d+$/.test(String(item.id)))") && persistence.includes('gatherables.spawn(saved.resourceId')],
  ['crater has a sloped bowl floor-to-rim profile instead of only a flat soil ring', crashSite.includes('#createCraterBowlGeometry') && crashSite.includes("floor.name = 'sprout-impact-crater-scorch'") && crashSite.includes("innerWall.name = 'sprout-impact-crater-inner-wall'") && crashSite.includes('sprout-impact-crater-raised-rim-')],
  ['fresh impact ejecta is asymmetric and preserves directional scours', crashSite.includes('const baseAngle = Math.atan2(direction.y, direction.x)') && crashSite.includes('sprout-impact-ejecta-') && crashSite.includes('sprout-impact-ejecta-scour-')],
  ['crash footprint clears reactive grass, ferns and static ground cover without changing terrain collision authority', definitions.includes('presentationClearRadius') && island.includes('setPresentationExclusion(id, exclusion)') && island.includes('this.grass.setPresentationExclusions?.(exclusions)') && island.includes('this.ferns.setPresentationExclusions?.(exclusions)') && island.includes('this.groundCover.setPresentationExclusions?.(exclusions)') && grass.includes('presentationHidden') && groundCover.includes('presentationHidden') && crashSite.includes('#setCrashPresentationExclusion(true)')],
  ['wrecked scout pod is visibly ruptured rather than an intact layered ship', crashSite.includes("wreck.name = 'sprout-wrecked-scout-pod'") && crashSite.includes("breach.name = 'sprout-crashed-pod-hull-breach'") && crashSite.includes("exposedCore.name = 'sprout-crashed-pod-exposed-core'") && crashSite.includes('sprout-crashed-pod-canopy-crack-') && crashSite.includes('sprout-crashed-pod-engine-')],
  ['detached scout-pod debris is scattered across the crash footprint instead of parented only to the hull', crashSite.includes('SCATTERED_DEBRIS') && crashSite.includes('sprout-scattered-pod-debris-') && crashSite.includes('this.root.add(debris)')],
  ['dialogue explicitly cues the post-rescue log-compression showcase', definitions.includes('Watch what I can do with those logs.') && definitions.includes('You moved those logs off me.')],
  ['investigation objective gives distance feedback and exposes a bounded FREE action', controller.includes('Investigate the blue crash site') && controller.includes('SPROUT_ARRIVAL.rescueRadius') && controller.includes("caption: 'FREE'") && controller.includes("setExternalAction('sprout-rescue'")],
  ['desktop E can trigger the same rescue action as mobile', controller.includes("event.code === 'KeyE'") && controller.includes('this.#beginRescue()')],
  ['rescue/dialogue uses Ranger cinematic ownership rather than a second player controller', controller.includes('this.player.beginCinematic(this)') && controller.includes('this.player.endCinematic(this)') && controller.includes("playCinematicAnimation(['Interact', 'Working', 'Idle_B']")],
  ['Sprout boot/allegiance dialogue is mobile safe-area aware', definitions.includes("speaker: 'SPROUT'") && controller.includes("panel.className = 'sprout-dialogue'") && css.includes('safe-area-inset-bottom') && css.includes('@media (orientation: landscape)')],
  ['story slice does not create a second inventory or award resources directly', !controller.includes('inventory.add') && !controller.includes('inventory.consume') && !crashSite.includes('inventory.add') && !crashSite.includes('inventory.consume')],
  ['existing HUD external-action boundary is reused instead of adding another gameplay button system', mobileHud.includes('setExternalAction(id, action = null)') && controller.includes("setExternalAction('sprout-rescue'")],
  ['Sprout story state is captured and restored through the shared save controller', saveController.includes('state.sproutArrival = this.game.sproutArrival?.captureState?.() ?? null') && saveController.includes('this.game.sproutArrival?.restoreState?.(record.state.sproutArrival)')],
  ['Sprout story restore occurs after shared Ranger/gatherable restore so restored demo logs exist before crash-state reconstruction', saveController.indexOf('restoreGameState(this.game, record.state)') < saveController.indexOf('this.game.sproutArrival?.restoreState?.(record.state.sproutArrival)')],
  ['pre-Sprout saves are deliberately skipped rather than replaying the opening in an established world', controller.includes('PHASE.LEGACY_SKIPPED') && controller.includes('legacySkipped: true')],
  ['story milestones request explicit save checkpoints', controller.includes("saveNow?.('sprout-impact')") && controller.includes("saveNow?.('sprout-rescue')") && controller.includes("saveNow?.('sprout-allied')")],
  ['crash-scene documentation preserves tree, log, inventory and terrain authority boundaries', docs.includes('same forest tree asset family') && docs.includes('GatherableSystem') && docs.includes('single shared InventorySystem') && docs.includes('no duplicate log authority') && docs.includes('does not create a competing terrain deformation system')]
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