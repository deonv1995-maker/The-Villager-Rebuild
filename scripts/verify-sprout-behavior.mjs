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
  const root = createSproutVisual();
  scene.add(root);
  const statuses = [];
  let harvestCalls = 0;
  let treeActive = true;
  const treePosition = new THREE.Vector3(0, 0, -6);
  const treeHarvest = {
    findNearestActiveTree() {
      return treeActive ? { treeId: 7, label: 'Tree', position: treePosition.clone() } : null;
    },
    harvestTree(treeId) {
      assert.equal(treeId, 7);
      harvestCalls += 1;
      if (harvestCalls < 3) {
        return { chopped: false, remainingHits: 3 - harvestCalls, position: treePosition.clone() };
      }
      treeActive = false;
      for (let index = 0; index < 3; index += 1) {
        gatherables.spawn('log', { x: index * 0.35, z: -6 + index * 0.2, quantity: 1 });
      }
      return {
        chopped: true,
        remainingHits: 0,
        position: treePosition.clone(),
        dropResourceId: 'log',
        dropCount: 3
      };
    }
  };

  const game = {
    player: {
      getPosition: out => out.copy(position),
      getFacingDirection: out => out.copy(facing)
    },
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
    inventory,
    gatherables,
    statuses,
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
  f.add('stick', 0, -8);
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('find-stick'), true);
  f.tick(2);
  assert.equal(f.root.visible, true, 'Resource scan deploys Sprout beside the Ranger');
  assert.equal(f.controller.getPresentationState().scanning, true);
  assert.ok(f.controller.getPresentationState().scanTarget, 'Resource scan exposes a visual target');
  assert.equal(f.controller.getEnergyState().energy, before - tuning.commands['find-stick'].energyCost);
  f.tick(Math.ceil((tuning.resourceScanHoldSeconds + 0.2) / 0.05));
  assert.equal(f.root.visible, false, 'Scan completion returns Sprout to storage');
}

{
  const f = fixture();
  f.add('log', 2, -3);
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('collect-logs'), true);
  f.tick(40);
  assert.equal(f.inventory.get('log'), 1, 'Collect Logs compresses a legitimate world log into shared inventory');
  assert.ok(f.controller.getEnergyState().energy <= before - tuning.collectionEnergyPerPickup);
  assert.equal(f.gatherables.items.some(item => item.resourceId === 'log' && item.active), false);
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('harvest-tree'), true);
  f.tick(180);
  assert.equal(f.harvestCalls, 3, 'Sprout laser uses the shared tree harvest authority for all three cuts');
  assert.equal(f.inventory.get('log'), 3, 'Laser tree command collects the resulting authoritative log drops');
  assert.ok(
    f.controller.getEnergyState().energy <= before - tuning.laserEnergyPerPulse * 3 - tuning.collectionEnergyPerPickup * 3,
    'Laser passes and log compression both consume Sprout energy'
  );
  assert.equal(f.root.visible, false, 'Sprout is stowed again after harvest completion');
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('scan-underground'), true);
  f.tick(2);
  const presentation = f.controller.getPresentationState();
  assert.equal(presentation.scanning, true);
  assert.equal(presentation.scanTerrainProjection, false);
  assert.equal(Math.round(presentation.scanTarget.y), -6);
  assert.equal(f.controller.getEnergyState().energy, before - tuning.commands['scan-underground'].energyCost);
}

{
  const f = fixture();
  f.controller.restoreState({ energy: 1 });
  assert.equal(f.controller.issueCommand('harvest-tree'), false, 'Insufficient energy blocks a laser command');
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

console.log('Sprout command/energy behavior checks passed.');
