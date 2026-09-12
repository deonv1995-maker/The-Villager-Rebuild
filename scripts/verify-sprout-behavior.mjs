import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SproutCompanionController } from '../src/gameplay/SproutCompanionController.js';
import { SPROUT_COMPANION as tuning } from '../src/data/SproutCompanionDefinitions.js';
import { GatherableSystem } from '../src/world/GatherableSystem.js';
import { InventorySystem } from '../src/gameplay/InventorySystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';
import { createSproutVisual, disposeSproutVisual } from '../src/rendering/SproutVisualAsset.js';

function fixture() {
  const scene = new THREE.Scene();
  const terrain = { heightAt: () => 0, isPlayable: () => false };
  const gatherables = new GatherableSystem({ scene, terrain });
  gatherables.items = [];
  gatherables.group.clear();
  const inventory = new InventorySystem();
  inventory.enableSproutCompression();
  gatherables.setInventoryCapacitySource(inventory);
  const position = new THREE.Vector3();
  const facing = new THREE.Vector3(0, 0, 1);
  const root = createSproutVisual();
  root.position.set(0, tuning.hoverHeight, -2);
  scene.add(root);
  const collision = new WorldCollisionSystem({ heightAt: () => 0, isPlayable: () => true });
  const game = {
    player: { getPosition: out => out.copy(position), getFacingDirection: out => out.copy(facing) },
    island: { heightAt: () => 0, isPlayable: () => true, collision },
    gatherables, inventory, sceneSystem: { scene },
    sproutArrival: { isAllied: () => true, claimCompanionPresentation: () => root }
  };
  const controller = new SproutCompanionController({ game });
  const tick = (frames = 1) => { for (let i = 0; i < frames; i++) controller.update(0.05); };
  const add = (resourceId, x, z) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const item = { id: `test-${gatherables.items.length}`, resourceId, quantity: 1, active: true, reservedBy: null, root: mesh };
    gatherables.items.push(item);
    return item;
  };
  return { controller, tick, add, position, facing, root, inventory, gatherables, collision, scene };
}

for (const resourceId of tuning.collectibleResourceIds) {
  const f = fixture();
  const item = f.add(resourceId, 0, -3);
  f.tick(6);
  assert.ok(f.controller.compression, `${resourceId}: compression must start`);
  assert.ok(item.active && item.reservedBy, 'Reserved item stays authoritative until commit');
  assert.equal(f.inventory.get(resourceId), 0);
  f.position.set(30, 0, 0);
  f.tick(20);
  assert.equal(f.inventory.get(resourceId), 1, 'Moving beyond hard catch-up must not cancel commit');
  assert.equal(item.active, false);
  assert.equal(item.reservedBy, null);
  assert.ok(f.root.position.distanceTo(f.position) < 4, 'Catch-up resumes after commit');
  f.tick(30);
  assert.equal(f.inventory.get(resourceId), 1, 'Award must occur exactly once');
  assert.equal(f.scene.children.some(x => x.name.startsWith('sprout-compression-')), false);
}
{
  const f = fixture();
  f.add('stick', 8, 0);
  f.tick(4);
  assert.ok(f.controller.target, 'Expanded radius must select beyond old 6.25m radius');
  f.position.set(-2, 0, 0);
  f.tick(100);
  assert.equal(f.inventory.get('stick'), 1, 'Selected approach survives modest Ranger movement');
}
{
  const f = fixture();
  f.add('stick', 8, 0);
  f.collision.resolveMove = from => ({ ...from });
  f.tick(5);
  f.position.set(30, 0, 0);
  f.tick(180);
  assert.equal(f.controller.target, null, 'Unreachable approach must time out');
  assert.ok(f.root.position.distanceTo(f.position) < 4, 'Unreachable target cannot strand Sprout');
}
{
  const f = fixture();
  f.root.position.set(0, tuning.hoverHeight, 2);
  let smallest = Infinity;
  for (let i = 0; i < 100; i++) {
    f.tick();
    smallest = Math.min(smallest, Math.hypot(f.root.position.x, f.root.position.z));
  }
  assert.ok(smallest >= tuning.rangerPersonalSpace, 'Follow route must go around Ranger');
  assert.ok(f.root.position.z < -1, 'Avoidance must reach behind Ranger, not stall');
  f.position.copy(f.root.position);
  f.tick();
  assert.ok(Math.hypot(f.root.position.x - f.position.x, f.root.position.z - f.position.z) >= tuning.rangerPersonalSpace,
    'Ranger entering Sprout position must cause separation');
  const heights = [];
  for (let i = 0; i < 150; i++) { f.tick(); heights.push(f.root.position.y); }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.06, 'Idle hover must visibly move');
  assert.ok(heights.every(y => Math.abs(y - tuning.hoverHeight) <= tuning.hoverAmplitude + 0.001), 'Hover stays restrained');
}
{
  const f = fixture();
  const item = f.add('stick', 0, -3);
  f.tick(6);
  f.inventory.add('stick', 96);
  f.tick(20);
  assert.equal(item.active, true, 'Capacity failure must preserve loose resource');
  assert.equal(item.reservedBy, null);
  assert.equal(item.root.visible, true);
  assert.equal(f.inventory.get('stick'), 96);
}
{
  const f = fixture();
  const item = f.add('stick', 0, -3);
  f.tick(6);
  f.controller.dispose();
  assert.ok(item.active && item.root.visible && !item.reservedBy, 'Disposal releases reservation');
  assert.equal(f.inventory.get('stick'), 0);
}
{
  const root = createSproutVisual();
  let triangles = 0, meshes = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  assert.ok(triangles < 15000 && meshes < 70, 'Model must stay within a modest mobile geometry budget');
  assert.equal(root.getObjectByName('sprout-face-screen').geometry.type, 'RoundedBoxGeometry');
  console.log(`Sprout production model: ${meshes} meshes, ${triangles} triangles`);
  disposeSproutVisual(root);
}
console.log('Sprout runtime behavior checks passed: transaction, catch-up, approach timeout, Ranger space, hover and mobile geometry.');
