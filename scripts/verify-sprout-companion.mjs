import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const main = read('src/main.js');
const definitions = read('src/data/SproutCompanionDefinitions.js');
const companion = read('src/gameplay/SproutCompanionController.js');
const capacityController = read('src/gameplay/InventoryCapacityController.js');
const gainFeedback = read('src/gameplay/InventoryGainFeedbackController.js');
const arrival = read('src/gameplay/SproutArrivalController.js');
const gatherables = read('src/world/GatherableSystem.js');
const inventoryCss = read('src/resource-inventory.css');
const docs = read('docs/SPROUT_COMPANION.md');
const feedbackDocs = read('docs/SPROUT_COLLECTION_FEEDBACK.md');
const packageJson = JSON.parse(read('package.json'));

const arrivalIndex = main.indexOf('new SproutArrivalController({');
const companionIndex = main.indexOf('new SproutCompanionController({ game })');
const feedbackIndex = main.indexOf('new InventoryGainFeedbackController({ game })');
const restoreIndex = main.indexOf('const restored = saveController.restore();');
const resumeFeedbackStartIndex = main.indexOf('inventoryGainFeedback.start();', restoreIndex);
const freshBranchIndex = main.indexOf('} else {', restoreIndex);
const freshFeedbackStartIndex = main.indexOf('inventoryGainFeedback.start();', freshBranchIndex);
const takeIndex = companion.indexOf('takeReservedLooseResource?.(state.id, this.ownerToken)');
const awardIndex = companion.indexOf('this.inventory.add(pickup.resourceId, pickup.quantity)');

const checks = [
  ['main creates one Sprout companion runtime after the arrival/story authority', main.includes("import { SproutCompanionController }") && arrivalIndex >= 0 && companionIndex > arrivalIndex],
  ['companion activation is gated by the ALLIED story checkpoint', companion.includes('this.arrival.isAllied?.()') && arrival.includes('isAllied()') && arrival.includes('return this.phase === PHASE.ALLIED')],
  ['the crash-site Sprout presentation transfers instead of spawning a duplicate companion actor', arrival.includes('this.crashSite.scene.attach(sprout)') && arrival.includes('this.crashSite.sprout = null') && arrival.includes("sprout.name = 'sprout-companion-placeholder'")],
  ['companion tuning keeps collection bounded and catch-up explicit', definitions.includes('collectionRadius:') && definitions.includes('catchUpDistance:') && definitions.includes('hardCatchUpDistance:') && definitions.includes("collectibleResourceIds: Object.freeze(['stick', 'stone', 'grass', 'log'])")],
  ['Sprout follow formation keeps clearer Ranger separation without changing collection range', definitions.includes('followDistance: 2.05') && definitions.includes('followSideOffset: 0.95') && definitions.includes('collectionRadius: 6.25')],
  ['Sprout ordinary movement reuses the shared world collision authority', companion.includes('this.collision.resolveMove(from, desired') && companion.includes('SPROUT_COMPANION.collisionRadius')],
  ['catch-up wins over active collection intent', companion.includes('this.#cancelCollectionIntent();') && companion.includes('SPROUT_COMPANION.catchUpDistance') && companion.includes('SPROUT_COMPANION.hardCatchUpDistance')],
  ['GatherableSystem exposes one transactional loose-pickup reservation boundary', gatherables.includes('findNearestLooseResource(position, maxDistance, filter = null)') && gatherables.includes('reserveLooseResource(id, owner)') && gatherables.includes('releaseLooseResource(id, owner)') && gatherables.includes('takeReservedLooseResource(id, owner)')],
  ['player targeting ignores pickups temporarily reserved by Sprout', gatherables.includes('if (!item.active || item.reservedBy) continue;')],
  ['Sprout scans only real loose item records rather than harvesting grass patches or intact nodes', companion.includes('findNearestLooseResource?.(') && !companion.includes('.gather(') && !companion.includes('harvestGrassPatch') && !companion.includes('treeHarvest') && !companion.includes('rockHarvest')],
  ['visible compression uses a blue beam/halo presentation', companion.includes("beam.name = 'sprout-compression-beam'") && companion.includes("halo.name = 'sprout-compression-halo'") && companion.includes('state.visual.scale.copy(state.startScale).multiplyScalar(scale)')],
  ['inventory award happens only after authoritative reserved pickup commit', takeIndex >= 0 && awardIndex > takeIndex],
  ['companion refreshes HUD from the existing authoritative inventory snapshot', companion.includes('this.game.hud?.setInventory(this.inventory.snapshot())')],
  ['companion creates no second inventory authority', !companion.includes('new InventorySystem') && !companion.includes('this.inventory = new')],
  ['capacity mode derives from Sprout allegiance without becoming a second inventory', capacityController.includes('this.game.sproutArrival?.isAllied?.()') && capacityController.includes('this.inventory.setStorageMode(mode)') && !capacityController.includes('new InventorySystem')],
  ['shared inventory gain feedback is a presentation wrapper around authoritative resource additions', gainFeedback.includes("RESOURCE_DEFINITIONS[itemId]?.storage === 'inventory'") && gainFeedback.includes('this.originalAdd(itemId, amount)') && gainFeedback.includes('this.#queue(itemId, amount)') && !gainFeedback.includes('new InventorySystem')],
  ['gain feedback waits for the rendered inventory row and displays an explicit +N pulse', gainFeedback.includes('globalThis.requestAnimationFrame(flush)') && gainFeedback.includes('row.dataset.gain = `+${amount}`') && gainFeedback.includes("row.classList.add('inventory-gain-pulse')") && inventoryCss.includes('.inventory-row.inventory-gain-pulse::after') && inventoryCss.includes('content: attr(data-gain)')],
  ['Sprout storage feedback reuses the blue/cyan companion visual language', inventoryCss.includes('.inventory-strip[data-storage-mode="sprout"] .inventory-row.inventory-gain-pulse::after') && inventoryCss.includes('#9ce8f4')],
  ['Continue starts gain feedback only after restore so saved inventory does not look newly collected', feedbackIndex > companionIndex && resumeFeedbackStartIndex > restoreIndex && freshFeedbackStartIndex > freshBranchIndex],
  ['collection feedback documentation preserves shared inventory, Sprout compression and future upgrade boundaries', feedbackDocs.includes('presentation only') && feedbackDocs.includes('One shared `InventorySystem` remains authoritative') && feedbackDocs.includes('No storage-upgrade progression')],
  ['documentation records reservation/commit, shared inventory, Ranger harvesting and live compressed storage boundaries', docs.includes('reservation/commit') && docs.includes('one authoritative shared inventory') && docs.includes('Ranger performs the harvesting') && docs.includes('96 compressed units')],
  ['documentation keeps production art and falling-tree damage as later milestones while physical felling and capacity are active', docs.includes('production Sprout 3D asset') && docs.includes('falling-tree damage/collision') && docs.includes('visible authored-tree fall') && docs.includes('24 bulk units')],
  ['full repository check includes the Sprout companion regression', packageJson.scripts.check.includes('npm run verify:sprout-companion')]
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
else console.log(`Sprout companion regression checks passed (${checks.length} contracts).`);
