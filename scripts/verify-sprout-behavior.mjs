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
    walkableHeightAt: () => 0,
    isPlayable: () => true,
    collision: {
      resolveMove(from, desired) {
        return { x: desired.x, z: desired.z, blocked: false };
      }
    },
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
  const cinematic = { begins: 0, ends: 0, clips: [] };

  const trees = [
    { treeId: 7, position: new THREE.Vector3(0, 0, -6), active: true, hits: 0 },
    { treeId: 8, position: new THREE.Vector3(7, 0, -4), active: true, hits: 0 },
    { treeId: 9, position: new THREE.Vector3(24, 0, 0), active: true, hits: 0 }
  ];
  let harvestCalls = 0;
  const treeHarvest = {
    findNearestActiveTree(center, range) {
      const candidates = trees
        .filter(tree => tree.active && center.distanceTo(tree.position) <= range + 1e-6)
        .sort((a, b) => center.distanceTo(a.position) - center.distanceTo(b.position));
      const tree = candidates[0];
      return tree ? { treeId: tree.treeId, label: 'Tree', position: tree.position.clone() } : null;
    },
    harvestTree(treeId) {
      const tree = trees.find(candidate => candidate.treeId === treeId && candidate.active);
      if (!tree) return null;
      harvestCalls += 1;
      tree.hits += 1;
      if (tree.hits < 3) {
        return { chopped: false, remainingHits: 3 - tree.hits, position: tree.position.clone() };
      }
      tree.active = false;
      for (let index = 0; index < 2; index += 1) {
        gatherables.spawn('log', {
          x: tree.position.x + index * 0.32,
          z: tree.position.z + index * 0.22,
          quantity: 1
        });
      }
      return {
        chopped: true,
        remainingHits: 0,
        position: tree.position.clone(),
        dropResourceId: 'log',
        dropCount: 2
      };
    }
  };

  const player = {
    cinematicDriver: null,
    getPosition: out => out.copy(position),
    getFacingDirection: out => out.copy(facing),
    getRightHandWorldPosition(out) {
      return out.set(position.x + 0.34, position.y + 1.28, position.z + 0.2);
    },
    beginCinematic(driver) {
      if (this.cinematicDriver && this.cinematicDriver !== driver) return false;
      this.cinematicDriver = driver;
      cinematic.begins += 1;
      return true;
    },
    endCinematic(driver) {
      if (this.cinematicDriver && this.cinematicDriver !== driver) return false;
      if (this.cinematicDriver === driver) cinematic.ends += 1;
      this.cinematicDriver = null;
      return true;
    },
    playCinematicAnimation(preferences) {
      cinematic.clips.push(Array.isArray(preferences) ? preferences[0] : preferences);
      return { name: Array.isArray(preferences) ? preferences[0] : preferences, duration: 1 };
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
  const runUntilIdle = (limit = 1400) => {
    for (let frame = 0; frame < limit; frame += 1) {
      controller.update(0.05);
      if (!controller.getCommandState().activeCommandId) return frame + 1;
    }
    throw new Error('Sprout mission did not return to idle within test frame budget');
  };
  const add = (resourceId, x, z) => {
    gatherables.spawn(resourceId, { x, z, quantity: 1 });
    return gatherables.items[gatherables.items.length - 1];
  };

  return {
    controller,
    tick,
    runUntilIdle,
    add,
    root,
    player,
    inventory,
    gatherables,
    statuses,
    cinematic,
    trees,
    get harvestCalls() { return harvestCalls; }
  };
}

{
  const f = fixture();
  f.tick();
  assert.equal(f.root.visible, false, 'Allied Sprout stays stowed while no command is active');
  f.controller.restoreState({ energy: 50 });
  f.tick(20);
  assert.ok(f.controller.getEnergyState().energy > 50, 'Stowed Sprout passively recharges');
  assert.ok(f.controller.getEnergyState().energy < tuning.energyMax, 'Recharge remains gradual rather than instant');
}

{
  const f = fixture();
  for (let index = 0; index < 6; index += 1) f.add('stick', 4 + index * 0.55, -5 - index * 0.3);
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('find-stick'), true);
  f.tick(2);
  assert.equal(f.root.visible, true, 'Basic resource mission visibly deploys Sprout');
  assert.equal(f.player.cinematicDriver, f.controller, 'Ranger owns the deployment beat while mini Sprout leaves the hand');
  assert.ok(f.root.scale.x < 0.6, 'Sprout begins deployment at mini scale');
  f.runUntilIdle();
  const stored = f.inventory.get('stick');
  assert.ok(stored >= tuning.resourceBatchMin && stored <= tuning.resourceBatchMax,
    `one resource deployment must collect between ${tuning.resourceBatchMin} and ${tuning.resourceBatchMax} items, got ${stored}`);
  assert.equal(f.gatherables.items.filter(item => item.resourceId === 'stick' && item.active).length, 6 - stored,
    'only physically collected world resources are removed');
  assert.equal(f.root.visible, false, 'resource mission ends with Sprout stowed again');
  assert.ok(f.cinematic.begins >= 2 && f.cinematic.ends >= 2,
    'resource mission uses both Ranger deployment and retrieval presentation beats');
  assert.ok(f.cinematic.clips.includes('Throw') && f.cinematic.clips.includes('Interact'),
    'deployment/retrieval reuses authored Ranger animation clips');
  assert.ok(f.controller.getEnergyState().energy < before, 'resource mission consumes configured Sprout energy');
}

{
  const f = fixture();
  f.add('stone', 11, 0);
  assert.equal(f.controller.issueCommand('find-stone'), true);
  let maxTravel = 0;
  for (let frame = 0; frame < 500 && f.inventory.get('stone') < 1; frame += 1) {
    f.tick();
    maxTravel = Math.max(maxTravel, Math.hypot(f.root.position.x, f.root.position.z));
  }
  assert.equal(f.inventory.get('stone'), 1, 'Sprout physically reaches and stores an authoritative stone pickup');
  assert.ok(maxTravel > 7, 'collection moves Sprout through the world instead of remotely vacuuming the pickup');
}

{
  const f = fixture();
  f.add('log', 9, -3);
  assert.equal(f.controller.issueCommand('collect-logs'), true);
  f.runUntilIdle();
  assert.equal(f.inventory.get('log'), 1, 'Collect Logs physically retrieves legitimate world Logs');
  assert.equal(f.gatherables.items.some(item => item.resourceId === 'log' && item.active), false);
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('harvest-tree'), true);
  f.runUntilIdle(2200);
  assert.equal(f.harvestCalls, 6, 'tree mission applies three shared-authority laser cuts to each of the two in-range trees');
  assert.equal(f.trees[0].active, false);
  assert.equal(f.trees[1].active, false);
  assert.equal(f.trees[2].active, true, 'tree outside the established 18 m harvest radius remains untouched');
  assert.equal(f.inventory.get('log'), 4, 'Sprout physically collects all authoritative Log drops from in-range felled trees');
  assert.equal(
    f.controller.getEnergyState().energy,
    before - tuning.laserEnergyPerPulse * 6 - tuning.collectionEnergyPerPickup * 4,
    'laser passes and physical Log compression consume energy before idle recharge resumes'
  );
  assert.equal(f.root.visible, false, 'multi-tree harvest ends with the shared retrieval animation and stow');
}

{
  const f = fixture();
  const before = f.controller.getEnergyState().energy;
  assert.equal(f.controller.issueCommand('scan-underground'), true);
  f.tick(3);
  assert.equal(f.player.cinematicDriver, f.controller, 'underground scan keeps Ranger in the hold-mini-Sprout presentation');
  assert.ok(f.root.scale.x <= 0.25, 'underground scan keeps Sprout mini-sized in the Ranger hand');
  const presentation = f.controller.getPresentationState();
  assert.equal(presentation.scanning, true, 'mini Sprout performs the active full-area scanner presentation');
  assert.equal(presentation.scanTerrainProjection, false);
  assert.ok(presentation.pocketSignalCue, 'closest underground pocket creates a separate faint signal cue');
  assert.equal(Math.round(presentation.pocketSignalCue.y), -6);
  assert.ok(presentation.pocketSignalCue.alpha > 0.9, 'new pocket cue begins near full faint-cue opacity');
  assert.equal(f.controller.getEnergyState().energy, before - tuning.commands['scan-underground'].energyCost);
  f.runUntilIdle();
  assert.equal(f.root.visible, false, 'Ranger puts mini Sprout away after the cave scan');
  assert.ok(f.controller.getPresentationState().pocketSignalCue,
    'pocket glow lingers after Sprout is put away');
  f.tick(Math.ceil((tuning.undergroundSignalLingerSeconds + 0.15) / 0.05));
  assert.equal(f.controller.getPresentationState().pocketSignalCue, null,
    'faint pocket glow fades away after the configured five-second signal window');
}

{
  const f = fixture();
  f.controller.restoreState({ energy: 1 });
  assert.equal(f.controller.issueCommand('harvest-tree'), false, 'Insufficient energy blocks a tree mission');
  const saved = f.controller.captureState();
  assert.equal(saved.energy, 1);
  f.controller.restoreState({ energy: 73.5 });
  assert.equal(f.controller.captureState().energy, 73.5, 'Sprout energy is save-restorable without restoring an in-flight mission');
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

console.log('Sprout mission deployment, physical collection, 2-5 forage batches, multi-tree harvest, hand scan and five-second pocket signal checks passed.');
