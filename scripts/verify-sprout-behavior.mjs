import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SproutCompanionController } from '../src/gameplay/SproutCompanionController.js';
import { SPROUT_COMPANION as tuning } from '../src/data/SproutCompanionDefinitions.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { createSproutVisual, disposeSproutVisual } from '../src/rendering/SproutVisualAsset.js';

function fixture() {
  const scene = new THREE.Scene();
  const terrain = {
    heightAt: () => 0,
    isPlayable: () => true,
    explorationPois: {
      getUndiscoveredPocketSignal: () => ({
        pocketId: 'test-pocket',
        distance: 12,
        strength: 0.8,
        position: new THREE.Vector3(5, -6, -4)
      })
    }
  };
  const gatherables = new GatherableSystem({ scene, terrain });
  gatherables.items = [];
  gatherables.group.clear();
  gatherables.grassPatches = [];
  const inventory = new InventorySystem();
  inventory.enableSproutCompression();
  gatherables.setInventoryCapacitySource(inventory);

  const position = new THREE.Vector3();
  const facing = new THREE.Vector3(0, 0, 1);
  const playerRoot = new THREE.Group();
  const hand = new THREE.Group();
  hand.position.set(0.35, 1.25, 0.18);
  playerRoot.add(hand);
  scene.add(playerRoot);

  const root = createSproutVisual();
  scene.add(root);
  const statuses = [];
  let cinematicDriver = null;
  let harvestCalls = 0;
  const trees = [
    { id: 7, position: new THREE.Vector3(0, 0, -6), hits: 0, active: true },
    { id: 8, position: new THREE.Vector3(4, 0, -9), hits: 0, active: true }
  ];
  const treeHarvest = {
    findNearestActiveTree(origin, range) {
      let best = null;
      let bestDistance = Infinity;
      for (const tree of trees) {
        if (!tree.active) continue;
        const distance = origin.distanceTo(tree.position);
        if (distance > range || distance >= bestDistance) continue;
        bestDistance = distance;
        best = { treeId: tree.id, label: 'Tree', position: tree.position.clone() };
      }
      return best;
    },
    harvestTree(treeId) {
      const tree = trees.find(entry => entry.id === treeId && entry.active);
      if (!tree) return null;
      harvestCalls += 1;
      tree.hits += 1;
      if (tree.hits < 3) {
        return { chopped: false, remainingHits: 3 - tree.hits, position: tree.position.clone() };
      }
      tree.active = false;
      for (let index = 0; index < 3; index += 1) {
        gatherables.spawn('log', {
          x: tree.position.x + index * 0.28,
          z: tree.position.z + index * 0.18,
          quantity: 1
        });
      }
      return {
        chopped: true,
        remainingHits: 0,
        position: tree.position.clone(),
        dropResourceId: 'log',
        dropCount: 3
      };
    }
  };

  const player = {
    cinematicDriver: null,
    getPosition: out => out.copy(position),
    getFacingDirection: out => out.copy(facing),
    beginCinematic(driver) {
      if (cinematicDriver) return false;
      cinematicDriver = driver;
      this.cinematicDriver = driver;
      return true;
    },
    endCinematic(driver) {
      if (cinematicDriver !== driver) return false;
      cinematicDriver = null;
      this.cinematicDriver = null;
      return true;
    },
    playCinematicAnimation(preferences) {
      return { name: Array.isArray(preferences) ? preferences[0] : preferences, duration: 0.6 };
    },
    mountRightHandObject(object) {
      hand.add(object);
      object.position.set(0, 0, 0);
      object.quaternion.identity();
      return true;
    }
  };

  const game = {
    player,
    island: terrain,
    gatherables,
    inventory,
    treeHarvest,
    sceneSystem: { scene },
    hud: { setInventory() {} },
    setStatus: message => statuses.push(message),
    isPaused: () => false,
    sproutArrival: {
      isAllied: () => true,
      claimCompanionPresentation: () => root
    }
  };
  const controller = new SproutCompanionController({ game });
  const tick = (frames = 1) => {
    for (let index = 0; index < frames; index += 1) controller.update(0.05);
  };
  const add = (resourceId, x, z) => {
    gatherables.spawn(resourceId, { x, z, quantity: 1 });
    return gatherables.items[gatherables.items.length - 1];
  };

  return {
    controller,
    tick,
    add,
    root,
    hand,
    scene,
    inventory,
    gatherables,
    statuses,
    trees,
    get harvestCalls() { return harvestCalls; }
  };
}

{
  const f = fixture();
  f.tick();
  assert.equal(f.root.visible, false, 'Allied Sprout stays stowed while no command is active');
  const start = f.controller.getEnergyState().energy;
  f.controller.restoreState({ energy: 50 });
  f.tick(20);
  assert.ok(f.controller.getEnergyState().energy > 50, 'Stowed Sprout passively recharges');
  assert.ok(f.controller.getEnergyState().energy < start, 'Recharge remains gradual rather than instant');
}

{
  const f = fixture();
  for (let index = 0; index < 8; index += 1) f.add('stick', index * 0.9, -5 - index * 0.35);
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('find-stick'), true);
  f.tick(2);
  assert.equal(f.root.visible, true, 'Gather command begins with visible Mini Sprout deployment');
  assert.equal(f.root.parent, f.hand, 'Mini Sprout is mounted in the Ranger hand before launch');

  for (let frame = 0; frame < 600 && f.controller.getCommandState().activeCommandId; frame += 1) f.tick();
  const gathered = f.inventory.get('stick');
  assert.ok(
    gathered >= tuning.gatherMissionMin && gathered <= tuning.gatherMissionMax,
    'Resource mission physically gathers between two and five matching items'
  );
  assert.equal(f.root.visible, false, 'Gather mission returns, shrinks and stows Sprout');
  assert.ok(
    f.controller.getEnergyState().energy <= before - tuning.commands['find-stick'].energyCost - gathered * tuning.collectionEnergyPerPickup,
    'Gather mission spends deployment scan energy plus per-pickup compression energy'
  );
}

{
  const f = fixture();
  f.add('log', 7, -3);
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('collect-logs'), true);
  f.tick(Math.ceil((tuning.deployHandSeconds + tuning.deployGrowSeconds + 0.2) / 0.05));
  assert.ok(f.root.position.distanceTo(new THREE.Vector3(0, tuning.hoverHeight, 0)) > 0.4, 'Sprout leaves the Ranger before collecting a loose Log');
  for (let frame = 0; frame < 320 && f.controller.getCommandState().activeCommandId; frame += 1) f.tick();
  assert.equal(f.inventory.get('log'), 1, 'Collect Logs stores a legitimate world Log through shared inventory');
  assert.ok(
    f.controller.getEnergyState().energy <= before - tuning.collectionEnergyPerPickup,
    'Loose Log compression spends the existing pickup energy cost'
  );
  assert.equal(f.root.visible, false, 'Loose Log collection uses the same retrieval/stow lifecycle');
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('harvest-tree'), true);
  for (let frame = 0; frame < 900 && f.controller.getCommandState().activeCommandId; frame += 1) f.tick();

  assert.equal(f.trees.filter(tree => tree.active).length, 0, 'Tree mission clears every active tree in the established harvest radius');
  assert.equal(f.harvestCalls, 6, 'Both trees use the shared three-hit TreeHarvestSystem authority');
  assert.equal(f.inventory.get('log'), 6, 'Sprout physically collects all authoritative Log drops from both trees');
  assert.ok(
    f.controller.getEnergyState().energy <= before - tuning.laserEnergyPerPulse * 6 - tuning.collectionEnergyPerPickup * 6,
    'Area harvesting retains laser and Log compression energy costs'
  );
  assert.equal(f.root.visible, false, 'Area harvest returns and stows Sprout after no trees remain');
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('scan-underground'), true);
  f.tick(Math.ceil((tuning.scanRaiseSeconds + 0.2) / 0.05));
  const presentation = f.controller.getPresentationState();
  assert.equal(presentation.scanning, true, 'Mini Sprout performs the scan while held');
  assert.equal(presentation.scanTerrainProjection, false);
  assert.equal(f.root.parent, f.hand, 'Underground scan keeps Mini Sprout in the Ranger hand');
  assert.ok(f.scene.getObjectByName('sprout-underground-pocket-glow'), 'Closest underground pocket receives a faint world-space glow');
  assert.equal(f.controller.getEnergyState().energy, before - tuning.commands['scan-underground'].energyCost);

  f.tick(Math.ceil((tuning.undergroundSignalSeconds + 0.2) / 0.05));
  assert.equal(f.scene.getObjectByName('sprout-underground-pocket-glow'), undefined, 'Underground glow fades completely after about five seconds');
}

{
  const f = fixture();
  f.controller.restoreState({ energy: 1 });
  assert.equal(f.controller.issueCommand('harvest-tree'), false, 'Insufficient energy blocks a tree harvest command');
  const saved = f.controller.captureState();
  assert.equal(saved.energy, 1);
  f.controller.restoreState({ energy: 73.5 });
  assert.equal(f.controller.captureState().energy, 73.5, 'Sprout energy is save-restorable without restoring an in-flight command');
}

{
  const root = createSproutVisual();
  let triangles = 0;
  let meshes = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes += 1;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  assert.ok(triangles < 15000 && meshes < 70, 'Sprout model stays within the established mobile geometry budget');
  disposeSproutVisual(root);
}

console.log('Sprout physical mission behavior checks passed.');
