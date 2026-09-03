import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORLD_RESOURCE_DISTRIBUTION } from '../src/data/WorldResourceDistribution.js';
import { ResourceRenewalSystem } from '../src/world/ResourceRenewalSystem.js';

const makeDummy = () => ({
  position: { set() {} },
  rotation: { set() {} },
  scale: {
    value: [1, 1, 1],
    set(x, y, z) {
      this.value = [x, y, z];
    }
  },
  matrix: null,
  updateMatrix() {
    this.matrix = { scale: [...this.scale.value] };
  }
});

const makeWorld = () => {
  const writtenMatrices = [];
  const mesh = {
    instanceMatrix: { needsUpdate: false },
    setMatrixAt(index, matrix) {
      writtenMatrices[index] = { scale: [...matrix.scale] };
    }
  };
  const entry = {
    index: 0,
    mesh,
    x: 4,
    y: 0.01,
    z: 6,
    baseYaw: 0.4,
    baseLeanX: 0.03,
    baseLeanZ: -0.02,
    scaleX: 0.82,
    scaleY: 1.14,
    scaleZ: 0.91,
    bendX: 0,
    bendZ: 0,
    compression: 0,
    constructionHidden: false
  };
  const patch = {
    id: 'grass-patch-0',
    active: true,
    entries: [entry]
  };
  const items = [0, 1, 2].map(index => ({
    id: `ambient-stick-${index}`,
    resourceId: 'stick',
    active: true
  }));
  const spawned = [];
  const gatherables = {
    grassPatches: [patch],
    grassDummy: makeDummy(),
    grassField: { active: new Set() },
    items,
    spawn(resourceId, options) {
      spawned.push({ resourceId, ...options });
      items.push({ id: `spawn-${items.length}`, resourceId, active: true });
    }
  };
  const treeHarvest = {
    trees: [{
      active: true,
      obstacle: { x: 5, z: 7, radius: 0.55 }
    }]
  };
  return { gatherables, treeHarvest, patch, entry, mesh, spawned, writtenMatrices };
};

const depleteGrass = world => {
  world.patch.active = false;
  world.entry.grassHarvested = true;
  world.entry.scaleX = 0;
  world.entry.scaleY = 0;
  world.entry.scaleZ = 0;
};

const advance = (renewal, seconds, playerPosition = { x: 5, z: 7 }) => {
  let remaining = seconds;
  while (remaining > 0.000001) {
    const step = Math.min(0.25, remaining);
    renewal.update(step, playerPosition);
    remaining -= step;
  }
};

const grassConfig = WORLD_RESOURCE_DISTRIBUTION.renewal.grass;
const stickConfig = WORLD_RESOURCE_DISTRIBUTION.renewal.stick;
assert.equal(grassConfig.regrowSeconds, 120, 'grass should regrow after two active-play minutes');
assert.equal(stickConfig.minDropIntervalSeconds, 45, 'tree stick drops should stay infrequent');
assert.equal(stickConfig.maxDropIntervalSeconds, 90, 'tree stick drops should stay infrequent');

const world = makeWorld();
const renewal = new ResourceRenewalSystem({
  gatherables: world.gatherables,
  treeHarvest: world.treeHarvest
});

depleteGrass(world);
advance(renewal, grassConfig.regrowSeconds - 0.25);
assert.equal(world.patch.active, false, 'grass must remain depleted until the configured regrowth time completes');
advance(renewal, 0.25);
assert.equal(world.patch.active, true, 'grass patch should become harvestable again after regrowth');
assert.deepEqual(
  [world.entry.scaleX, world.entry.scaleY, world.entry.scaleZ],
  [0.82, 1.14, 0.91],
  'regrowth should restore the original authored grass scale rather than inventing a new tuft'
);
assert.equal(world.entry.grassHarvested, false, 'regrown grass must leave harvested state');
assert.equal(world.mesh.instanceMatrix.needsUpdate, true, 'regrowth must dirty the shared instanced grass mesh');

// Capture and restore an in-progress grass timer the same way save/continue does.
depleteGrass(world);
advance(renewal, 10);
const savedState = renewal.captureState();
const savedPatch = savedState.grassPatches.find(entry => entry.patchId === world.patch.id);
assert.ok(savedPatch, 'depleted grass should expose renewal persistence state');
assert.ok(
  savedPatch.remainingSeconds <= grassConfig.regrowSeconds - 9.9 &&
  savedPatch.remainingSeconds >= grassConfig.regrowSeconds - 10.1,
  'grass persistence should preserve remaining active-play regrowth time'
);

const restoredWorld = makeWorld();
const restoredRenewal = new ResourceRenewalSystem({
  gatherables: restoredWorld.gatherables,
  treeHarvest: restoredWorld.treeHarvest
});
depleteGrass(restoredWorld);
restoredRenewal.restoreState(savedState);
advance(restoredRenewal, savedPatch.remainingSeconds - 0.25);
assert.equal(restoredWorld.patch.active, false, 'continued grass should not skip its saved remaining regrowth time');
advance(restoredRenewal, 0.25);
assert.equal(restoredWorld.patch.active, true, 'continued grass should regrow when the saved timer completes');

const legacyWorld = makeWorld();
const legacyRenewal = new ResourceRenewalSystem({
  gatherables: legacyWorld.gatherables,
  treeHarvest: legacyWorld.treeHarvest
});
depleteGrass(legacyWorld);
legacyRenewal.restoreState(undefined);
const legacyState = legacyRenewal.captureState();
assert.equal(
  legacyState.grassPatches[0]?.remainingSeconds,
  grassConfig.regrowSeconds,
  'older saves with permanently harvested grass should migrate onto a fresh regrowth timer'
);

// Deplete one loose stick. The tree layer may replenish it, but never above the original world population.
const stickWorld = makeWorld();
const stickRenewal = new ResourceRenewalSystem({
  gatherables: stickWorld.gatherables,
  treeHarvest: stickWorld.treeHarvest
});
stickWorld.gatherables.items[0].active = false;
const dueState = stickRenewal.captureState();
dueState.stickDrops = {
  remainingSeconds: 0,
  randomState: stickConfig.seed >>> 0
};
stickRenewal.restoreState(dueState);
stickRenewal.update(0.05, { x: 5, z: 7 });
assert.equal(stickWorld.spawned.length, 1, 'a living nearby tree should eventually shed one replacement stick');
assert.equal(stickWorld.spawned[0].resourceId, 'stick', 'tree renewal must use the existing stick gatherable resource');
const dropDistance = Math.hypot(stickWorld.spawned[0].x - 5, stickWorld.spawned[0].z - 7);
assert.ok(dropDistance >= 0.8, 'shed stick should land outside the tree trunk');
assert.ok(dropDistance <= stickConfig.maxDropDistance + 0.000001, 'shed stick should remain visibly associated with its source tree');

const fullCount = stickWorld.gatherables.items.filter(item => item.active && item.resourceId === 'stick').length;
assert.equal(fullCount, 3, 'one shed stick should restore the original loose-stick population');
const fullState = stickRenewal.captureState();
fullState.stickDrops.remainingSeconds = 0;
stickRenewal.restoreState(fullState);
stickRenewal.update(0.05, { x: 5, z: 7 });
assert.equal(stickWorld.spawned.length, 1, 'tree shedding must not inflate world sticks above the original population ceiling');

stickWorld.gatherables.items[1].active = false;
stickWorld.treeHarvest.trees[0].active = false;
const noLivingTreeState = stickRenewal.captureState();
noLivingTreeState.stickDrops.remainingSeconds = 0;
stickRenewal.restoreState(noLivingTreeState);
stickRenewal.update(0.05, { x: 5, z: 7 });
assert.equal(stickWorld.spawned.length, 1, 'chopped/regrowing trees must not shed ambient sticks');

const gameAppSource = await readFile('src/core/GameApp.js', 'utf8');
for (const requirement of [
  "import { ResourceRenewalSystem } from '../world/ResourceRenewalSystem.js'",
  'this.resourceRenewal = new ResourceRenewalSystem({',
  'this.resourceRenewal?.update(dt, this.playerPosition)'
]) {
  assert.ok(gameAppSource.includes(requirement), `GameApp must own the renewable-resource runtime: ${requirement}`);
}

const saveControllerSource = await readFile('src/persistence/SaveGameController.js', 'utf8');
assert.ok(
  saveControllerSource.includes('this.game.resourceRenewal?.restoreState?.(record.state.resourceRenewal)'),
  'Continue must restore grass and stick renewal progress'
);
assert.ok(
  saveControllerSource.includes('state.resourceRenewal = this.game.resourceRenewal?.captureState?.() ?? null'),
  'autosave must capture grass and stick renewal progress'
);

console.log('Renewable grass regrowth, bounded tree stick shedding, save persistence and runtime wiring verified');
