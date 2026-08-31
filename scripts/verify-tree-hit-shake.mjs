import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [treeSource, shakeSource] = await Promise.all([
  readFile('src/world/TreeHarvestSystem.js', 'utf8'),
  readFile('src/world/TreeHitShakeSystem.js', 'utf8')
]);

for (const requirement of [
  "import { TreeHitShakeSystem } from './TreeHitShakeSystem.js'",
  'this.treeShake = new TreeHitShakeSystem',
  'this.treeShake.update()',
  'this.treeShake.hit(tree.treeId, playerPosition, tree.obstacle)',
  'this.treeShake.clear(tree.treeId)'
]) {
  assert.ok(treeSource.includes(requirement), `Tree harvesting is missing shake integration: ${requirement}`);
}

for (const requirement of [
  'class TreeHitShakeSystem',
  'getTreeRenderHandles(treeId)',
  'handle.mesh.getMatrixAt(handle.index, baseMatrix)',
  'Math.sin(progress * Math.PI * 5)',
  'setFromAxisAngle(state.axis, angle)',
  'handle.mesh.setMatrixAt(handle.index, this.tempMatrix)',
  'entry.handle.mesh.setMatrixAt(entry.handle.index, entry.baseMatrix)'
]) {
  assert.ok(shakeSource.includes(requirement), `Tree shake presentation is missing contract: ${requirement}`);
}

assert.ok(shakeSource.includes('const SHAKE_DURATION = 0.34'), 'Tree hit shake must remain brief and readable');
assert.ok(shakeSource.includes('const SHAKE_AMPLITUDE = 0.095'), 'Tree shake amplitude must remain visible without destabilizing instanced trees');
assert.ok(!shakeSource.includes('geometry.dispose'), 'Tree hit shaking must not rebuild or dispose shared instanced-tree geometry');

console.log('Instanced tree hit shake contracts verified');
