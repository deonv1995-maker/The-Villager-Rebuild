import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import {
  attachFelledTreeLogGroundPresentation,
  FELLED_TREE_BARK_COLOR,
  normalizeFelledTreeLogPresentation
} from '../src/world/FelledTreeLogPresentation.js';
import { createPhysicalLogVisual } from '../src/world/PhysicalLogVisual.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(PHYSICAL_LOG.length === 2.9, 'Felled-tree presentation must not change the canonical building Log length');
assert(PHYSICAL_LOG.radius === 0.27, 'Felled-tree presentation must not change the canonical building Log radius');
assert(FELLED_TREE_BARK_COLOR === 0x815a3d, 'Felled logs and their stump must share the harvest bark palette');

const normalized = normalizeFelledTreeLogPresentation({
  kind: 'felled-tree',
  sourceRadius: 0.82,
  segmentIndex: 2
});
assert(normalized?.sourceRadius === 0.82, 'Harvest presentation must preserve a valid source-tree trunk radius');
assert(normalized?.segmentIndex === 2, 'Harvest presentation must preserve the tree segment index');
assert(
  normalizeFelledTreeLogPresentation({ kind: 'other', sourceRadius: 0.82 }) === null,
  'Only explicit felled-tree presentation metadata may activate the harvest shell'
);

const groundParent = new THREE.Group();
groundParent.name = 'world-gatherables';
const constructionParent = new THREE.Group();
constructionParent.name = 'construction-root';
const root = createPhysicalLogVisual('VerifierRawLog');
const canonicalRoll = root.userData.rollGroup;
const shell = attachFelledTreeLogGroundPresentation(root, {
  kind: 'felled-tree',
  sourceRadius: 0.82,
  segmentIndex: 0
}, groundParent);

assert(shell, 'A chopped-tree Log must receive a harvest-only ground presentation');
assert(shell.userData.harvestOnlyPresentation === true, 'Harvest shell must identify itself as presentation-only');
assert(shell.visible === false, 'Detached physical Logs must not expose the harvest shell');
assert(canonicalRoll.visible === true, 'Detached physical Logs must retain the canonical Log presentation');

groundParent.add(root);
assert(shell.visible === true, 'Felled-tree shell must render while the Log is a world gatherable');
assert(canonicalRoll.visible === false, 'Canonical construction Log must be hidden under the ground-only harvest shell');

constructionParent.add(root);
assert(shell.visible === false, 'Harvest shell must disappear when the physical Log leaves the gatherable layer');
assert(canonicalRoll.visible === true, 'Canonical Log must automatically return for carry/building reparenting');

groundParent.add(root);
assert(shell.visible === true, 'Dropping the same harvested Log back into the world must restore its natural ground shell');
assert(canonicalRoll.visible === false, 'Dropped harvested Logs must again hide the canonical placeholder while on the ground');

const [treeSource, physicalLogSource, logVisualSource] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/PhysicalLogVisual.js', 'utf8')
]);

for (const requirement of [
  'attachFelledTreeLogGroundPresentation',
  'sourceRadius: tree.obstacle.radius',
  'segmentIndex: index',
  'FELLED_TREE_BARK_COLOR',
  'tree.regrowRemaining = this.definition.regrowSeconds',
  'tree.stump = this.#createStump(tree)'
]) {
  assert(treeSource.includes(requirement), `Tree harvest presentation/regrowth is missing contract: ${requirement}`);
}

assert(
  !physicalLogSource.includes('FelledTreeLogPresentation'),
  'PhysicalLogSystem must remain independent of felled-tree presentation logic'
);
assert(
  !logVisualSource.includes('FelledTreeLogPresentation'),
  'Canonical construction Log visuals must remain independent of felled-tree presentation logic'
);
assert(
  physicalLogSource.includes('createConstructionLogVisual') &&
  physicalLogSource.includes("takePhysical(playerPosition, 'log')"),
  'Existing construction and physical pickup boundaries must remain intact'
);

console.log('Felled-tree ground presentation scale, palette, regrowth compatibility and construction isolation verified');
