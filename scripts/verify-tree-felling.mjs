import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  TREE_FELLING_PRESENTATION,
  TreeFellingPresentation
} from '../src/world/TreeFellingPresentation.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let now = 0;
const group = new THREE.Group();
const terrain = { heightAt: () => 0 };
const geometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 6);
const material = new THREE.MeshStandardMaterial();
const source = new THREE.InstancedMesh(geometry, material, 1);
const sourceMatrix = new THREE.Matrix4().makeTranslation(4, 2, 3);
source.setMatrixAt(0, sourceMatrix);
source.instanceMatrix.needsUpdate = true;

const tree = {
  treeId: 7,
  obstacle: { x: 4, z: 3, radius: 0.7 },
  collisionTemplate: { x: 4, z: 3, radius: 0.7 },
  renderState: [{ mesh: source, index: 0, matrix: sourceMatrix.clone() }]
};

const presentation = new TreeFellingPresentation({
  group,
  terrain,
  now: () => now
});
const state = presentation.begin(tree, new THREE.Vector3(2, 0, 3));
assert(state?.pivot?.name === 'falling-tree-7', 'Final tree hit must create one dedicated falling-tree presentation');
assert(state.pivot.children.length === 1, 'Felling presentation must reuse the harvested tree render parts when available');
assert(state.pivot.children[0].castShadow === true, 'Temporary falling tree should cast a readable shadow');
assert(presentation.has(7), 'Felling presentation must remain active while the tree is falling');

now = TREE_FELLING_PRESENTATION.fallSeconds * 500;
assert(presentation.update().length === 0, 'Logs must not become eligible halfway through the fall');
assert(presentation.has(7), 'Falling tree must remain visible before impact');

now = (TREE_FELLING_PRESENTATION.fallSeconds + TREE_FELLING_PRESENTATION.settleSeconds) * 1000 + 1;
const completed = presentation.update();
assert(completed.length === 1 && completed[0] === 7, 'Felling completion must occur only after fall plus settle time');
assert(!presentation.has(7), 'Felling presentation must clean itself up after the settle handoff');

const [treeSource, companionSource, docs] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/gameplay/SproutCompanionController.js', 'utf8'),
  readFile('docs/SPROUT_COMPANION.md', 'utf8')
]);

for (const requirement of [
  "import { TreeFellingPresentation } from './TreeFellingPresentation.js'",
  'tree.felling = true',
  'this.fellingPresentation.begin(tree, playerPosition)',
  'this.#advanceFelling()',
  'this.#completeFelling(tree, { spawnDrops: true })',
  'if (spawnDrops) this.#spawnDrops(tree)',
  '.filter(tree => !tree.active && !tree.felling)',
  'if (tree.felling) {',
  'this.#completeFelling(tree, { spawnDrops: false })'
]) {
  assert(treeSource.includes(requirement), `Tree felling lifecycle is missing contract: ${requirement}`);
}

const finalHitIndex = treeSource.indexOf('tree.felling = true');
const beginFallIndex = treeSource.indexOf('this.fellingPresentation.begin(tree, playerPosition)', finalHitIndex);
const completeMethodIndex = treeSource.indexOf('#completeFelling(tree, { spawnDrops = true }', beginFallIndex);
const spawnDropIndex = treeSource.indexOf('if (spawnDrops) this.#spawnDrops(tree)', completeMethodIndex);
assert(finalHitIndex >= 0 && beginFallIndex > finalHitIndex, 'Final axe hit must enter felling before the visual begins');
assert(spawnDropIndex > completeMethodIndex, 'Configured Logs must be created by felling completion, not the final axe hit');
assert(!treeSource.slice(finalHitIndex, completeMethodIndex).includes('this.#spawnDrops(tree)'), 'Final axe hit must not spawn collectible Logs before tree impact');

assert(companionSource.includes("reserved.resourceId === 'log'"), 'Sprout must retain the longer Log compression presentation');
assert(companionSource.includes('this.allowedResources.has(resourceId)'), 'Sprout collection must stay data-gated rather than harvesting trees directly');
assert(docs.includes('fall settles -> configured Log results become collectible'), 'Companion documentation must preserve the visible tree-to-timber handoff');
assert(docs.includes('without spawning replacement Logs'), 'Save/Continue documentation must preserve no-duplicate timber authority');

geometry.dispose();
material.dispose();
console.log('Visible tree felling, deferred Log creation, save-safe settle restore and Sprout timber handoff verified');
