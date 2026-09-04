import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOG_BUILD_MODES } from '../src/data/PhysicalLogDefinitions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const appSource = read('src/core/GameApp.js');
const logSystemSource = read('src/world/PhysicalLogSystem.js');
const logVisualSource = read('src/world/PhysicalLogVisual.js');
const floorSupportSource = read('src/world/FloorSupportVisual.js');
const carryPoseSource = read('src/player/RangerLogCarryPose.js');
const treeHarvestSource = read('src/world/TreeHarvestSystem.js');
const feedbackSource = read('src/world/HarvestHitFeedback.js');
const hudSource = read('src/ui/MobileHud.js');
const stylesSource = read('src/styles.css');
const definitionsSource = read('src/data/PhysicalLogDefinitions.js');
const roofTopologySource = read('src/world/RoofTopology.js');
const roofRulesSource = read('src/world/RoofMemberRules.js');
const contextActionSource = read('src/ui/ContextActionPolicy.js');

for (const requirement of [
  'class TreeHarvestSystem',
  'getTarget(playerPosition)',
  'chop(playerPosition)',
  'takePhysical(playerPosition',
  "resourceId: 'log'",
  'hitFeedback.trigger',
  'treeRenderRegistry?.suppressTree',
  'this.collision?.removeObstacle',
  'this.gatherables.spawn',
  'dropCount: this.logDropCount'
]) {
  assert(treeHarvestSource.includes(requirement), `Tree harvesting is missing contract: ${requirement}`);
}

for (const requirement of [
  'class PhysicalLogSystem',
  'getDemolitionTarget(playerPosition)',
  'demolish(playerPosition',
  'this.gatherables.spawn',
  'this.floorSupports.remove',
  "this.gatherables.returnPhysical(item, { x: point.x, z: point.z, yaw })",
  'SHOW_CARRIED_LOG_VISUAL = false',
  'RangerLogCarryPose',
  'this.#resolvePlacement',
  'this.#showPreview',
  'this.#applyTransform',
  'this.#registerCollision',
  'this.#activeBuilt',
  'this.#nearestFloorCorner',
  'this.#nearestFramePair',
  'this.#upperStoreyFloorCandidates',
  'this.#roofCandidates',
  'this.#roofRegions',
  'this.#roofAxisCandidate',
  'this.#roofSlotOccupied'
]) {
  assert(logSystemSource.includes(requirement), `Physical log construction is missing contract: ${requirement}`);
}

for (const mode of LOG_BUILD_MODES) {
  assert(definitionsSource.includes(`'${mode}'`), `Physical log build definitions must expose ${mode}`);
}
assert(
  definitionsSource.includes("LOG_BUILD_MODES = Object.freeze(['raw', 'floor', 'frame', 'wall', 'stairs', 'roof'])"),
  'Player-facing construction modes must use the dedicated stairs + roof workflow without a separate angle tray option'
);
assert(
  definitionsSource.includes('LOG_CONSTRUCTION_MODES') && definitionsSource.includes("'angle'"),
  'Legacy/internal ANGLE mode must remain available for roof rafters and persisted construction data'
);

for (const requirement of [
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  'connectedPairComponents',
  'closedLoop',
  'searchRadius',
  'frameLimit',
  'pairLimit',
  'occupiedBeamKeys',
  'sourceBeamKeys'
]) {
  assert(roofTopologySource.includes(requirement), `Roof topology is missing construction contract: ${requirement}`);
}
assert(
  roofTopologySource.includes('if (beamKeys && !beamKeys.has(rawKey)) continue;'),
  'Roof topology must be unlocked by placed RAW frame-pair beams rather than FRAME posts alone'
);

for (const requirement of [
  'roofMemberCandidates',
  'orderedRoofBuildCandidates',
  'roofMemberOccupied',
  'roofRaftersComplete',
  'roofRegionComplete'
]) {
  assert(roofRulesSource.includes(requirement), `Shared roof member authority is missing contract: ${requirement}`);
}
assert(roofRulesSource.includes('roofRegionKey: region.key'), 'Shared roof member authority must retain stable region identity');
assert(roofRulesSource.includes("roofRole,\n    snapKind"), 'Shared roof member authority must expose structural roles to placement and completion');

for (const requirement of [
  'PHYSICAL_LOG.length',
  'LogRollVisual',
  'createPhysicalLogVisual',
  'createSplitHalfLogVisual',
  "mode === 'roof'",
  'createConstructionLogVisual'
]) {
  assert(logVisualSource.includes(requirement), `Physical log visual is missing construction contract: ${requirement}`);
}

for (const requirement of [
  "root.name = 'construction-floor-foundations'",
  'FOUNDATION_MERGE_RADIUS',
  'this.terrain.setConstructionFloors?.',
  "fill.name = 'automatic-floor-fill'",
  "createPhysicalLogVisual('AutomaticFloorSupport')",
  'this.terrain.baseHeightAt?.(x, z)'
]) {
  assert(floorSupportSource.includes(requirement), `Shared automatic floor foundation is missing contract: ${requirement}`);
}
assert(!floorSupportSource.includes('FoundationTerrainSystem'), 'Rebuild floor adaptation must not restore the archived terrain-mutation system');

for (const requirement of [
  'class RangerLogCarryPose',
  "this.#poseArm('l'",
  "this.#poseArm('r'",
  'this.player.model.updateMatrixWorld(true)'
]) {
  assert(carryPoseSource.includes(requirement), `Shoulder carry posture is missing contract: ${requirement}`);
}

for (const requirement of ['class HarvestHitFeedback', 'RingGeometry', 'hitVelocity', 'duration: 0.28']) {
  assert(feedbackSource.includes(requirement), `Harvest hit feedback is missing contract: ${requirement}`);
}

for (const forbidden of ["inventory.add('log'", "inventory.get('log'", "inventory.has('log'"]) {
  assert(!appSource.includes(forbidden), `GameApp must not route physical logs through inventory: ${forbidden}`);
}
assert(appSource.includes("toolId === 'axe'"), 'Tree chopping must be enabled by the equipped axe instead of tutorial state');
assert(appSource.includes('this.physicalLogs?.pickup(this.playerPosition)'), 'Log interaction must lift the physical log');
assert(
  /this\.physicalLogs\.update\(\s*this\.playerPosition,\s*this\.playerFacing,\s*this\.#currentConstructionAim\(\)/.test(appSource),
  'Carried log preview must follow Ranger movement/facing and receive optional first-person reticle aim'
);
assert(
  /this\.physicalLogs\.build\(\s*null,\s*this\.playerPosition,\s*this\.playerFacing,\s*constructionAim/.test(appSource),
  'The main interaction action must confirm the selected log preview with the same construction aim'
);

assert(hudSource.includes('data-role="log-build"'), 'Holding a log must expose the log build tray');
for (const mode of [...LOG_BUILD_MODES, 'drop']) {
  assert(hudSource.includes(`data-build="${mode}"`), `Log build tray must expose ${mode}`);
}
assert(hudSource.includes('class="hud-button action"'), 'Mobile HUD must expose one unified equipped-tool/world Action button');
assert(contextActionSource.includes("axe: Object.freeze(new Set(['tree']))"), 'Unified Action policy must route Axe + tree targets through the existing interaction path');
assert(contextActionSource.includes("pickaxe: Object.freeze(new Set(['rock']))"), 'Unified Action policy must route Pickaxe + rock targets through the existing interaction path');
assert(contextActionSource.includes("hammer: Object.freeze(new Set(['placed-log', 'campfire']))"), 'Unified Action policy must route Hammer demolition targets through the existing interaction path');
assert(hudSource.includes('this.attackButton = this.actionButton'), 'Legacy attackButton references must remain a compatibility alias for the unified Action button');
assert(hudSource.includes('this.attackIcon = this.actionIcon'), 'Legacy attackIcon references must remain a compatibility alias for the unified Action icon');
assert(hudSource.includes('this.attackIcon.src = this.toolIcons[equippedTool]'), 'Unified Action button must display the resolved tool/action icon through the compatibility alias');
assert(
  stylesSource.includes('.log-build-tray {') &&
  stylesSource.includes('right: max(8px') &&
  stylesSource.includes('width: 108px'),
  'Log build tray must remain a compact right-side mobile palette'
);
assert(
  stylesSource.includes('.build-option-grid {') && stylesSource.includes('grid-template-columns: repeat(2, 1fr)'),
  'Log build options must remain a compact two-column grid'
);

console.log('Tree harvest, physical Log carrying/construction, unified mobile Action, roof support and hit feedback contracts verified');
