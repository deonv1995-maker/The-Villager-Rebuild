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
  const panelConstruction = { entries: new Map() };
  const externalActions = new Map();
  const statuses = [];
  const player = {
    cinematicDriver: null,
    getPosition: out => out.copy(position),
    getFacingDirection: out => out.copy(facing),
    beginCinematic(driver) {
      if (!driver || this.cinematicDriver) return false;
      this.cinematicDriver = driver;
      return true;
    },
    endCinematic(driver) {
      if (!this.cinematicDriver || (driver && this.cinematicDriver !== driver)) return false;
      this.cinematicDriver = null;
      return true;
    },
    playCinematicAnimation(preferences, options = {}) {
      return { name: Array.isArray(preferences) ? preferences[0] : preferences, duration: options.loop ? 1 : 1.35 };
    },
    faceWorldPoint() {}
  };
  const hud = {
    setInventory() {},
    setExternalAction(id, action) {
      if (action) externalActions.set(id, action);
      else externalActions.delete(id);
    }
  };
  const game = {
    player,
    island: { heightAt: () => 0, isPlayable: () => true, collision },
    gatherables,
    inventory,
    panelConstruction,
    hud,
    setStatus: message => statuses.push(message),
    sceneSystem: { scene },
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
  return {
    controller,
    tick,
    add,
    position,
    facing,
    root,
    inventory,
    gatherables,
    collision,
    panelConstruction,
    scene,
    player,
    externalActions,
    statuses
  };
}

for (const resourceId of tuning.collectibleResourceIds) {
  const f = fixture();
  const item = f.add(resourceId, 0, -3);
  f.tick(6);
  assert.ok(f.controller.target, `${resourceId}: target must stay selected during the scan-lock pause`);
  assert.equal(f.controller.compression, null, `${resourceId}: compression must wait until scanning finishes`);
  assert.equal(f.controller.getPresentationState().scanning, true, `${resourceId}: scanner stays active while approaching/locking`);
  assert.equal(f.controller.getPresentationState().scanTarget?.z, item.root.position.z, `${resourceId}: presentation exposes the selected scan target`);
  f.tick(Math.ceil((tuning.targetScanHoldSeconds + 0.15) / 0.05));
  assert.ok(f.controller.compression, `${resourceId}: compression must start after scan lock`);
  assert.equal(f.controller.getPresentationState().scanning, false, `${resourceId}: scanner must switch off before compression`);
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
  const doorRoot = new THREE.Group();
  doorRoot.position.set(0, 0, 0);
  f.scene.add(doorRoot);
  f.panelConstruction.entries.set('test-door', {
    id: 'test-door',
    active: true,
    kind: 'wall',
    variant: 'door',
    structureId: 'test-cabin',
    storey: 0,
    root: doorRoot
  });
  f.collision.addBox({
    x: -5,
    z: 0,
    halfX: 4.05,
    halfZ: 0.28,
    yaw: 0,
    type: 'panel-wall',
    bottomY: -1,
    topY: 3
  });
  f.collision.addBox({
    x: 5,
    z: 0,
    halfX: 4.05,
    halfZ: 0.28,
    yaw: 0,
    type: 'panel-wall',
    bottomY: -1,
    topY: 3
  });
  f.root.position.set(2.2, tuning.hoverHeight, -2);
  f.position.set(2.2, 0, 14);

  let crossedAtDoor = false;
  let maxFrameTravel = 0;
  const previous = f.root.position.clone();
  for (let i = 0; i < 260; i += 1) {
    f.tick();
    const frameTravel = Math.hypot(
      f.root.position.x - previous.x,
      f.root.position.z - previous.z
    );
    maxFrameTravel = Math.max(maxFrameTravel, frameTravel);
    if (previous.z < 0 && f.root.position.z >= 0) {
      crossedAtDoor = Math.abs(f.root.position.x)
        <= 0.95 - tuning.collisionRadius + 0.05;
    }
    previous.copy(f.root.position);
    if (crossedAtDoor && f.root.position.z > 1.2) break;
  }

  assert.ok(crossedAtDoor, 'Blocked Sprout follow must cross the wall plane through the semantic door opening');
  assert.ok(f.root.position.z > 1.2, 'Sprout must finish the doorway route on the Ranger side of the wall');
  assert.ok(
    maxFrameTravel <= tuning.catchUpSpeed * 0.05 + 0.03,
    'constructed-door recovery must stay bounded and must not use the hard catch-up teleport through the wall'
  );
}
{
  const f = fixture();
  f.root.position.set(0, tuning.hoverHeight, 2);
  let smallest = Infinity;
  for (let i = 0; i < 38; i++) {
    f.position.z -= 0.035;
    f.tick();
    smallest = Math.min(smallest, Math.hypot(f.root.position.x - f.position.x, f.root.position.z - f.position.z));
  }
  assert.ok(smallest >= tuning.rangerPersonalSpace, 'Follow route must go around Ranger');

  f.position.copy(f.root.position);
  const separationStart = f.root.position.clone();
  f.tick();
  const firstSeparationStep = Math.hypot(
    f.root.position.x - separationStart.x,
    f.root.position.z - separationStart.z
  );
  const firstSeparationDistance = Math.hypot(
    f.root.position.x - f.position.x,
    f.root.position.z - f.position.z
  );
  assert.ok(firstSeparationStep > 0, 'Ranger entering Sprout position must start a separation response');
  assert.ok(
    firstSeparationStep <= tuning.rangerSeparationSpeed * 0.05 + 0.002,
    'ordinary Ranger/Sprout overlap must resolve with a bounded move instead of a one-frame teleport'
  );
  assert.ok(
    firstSeparationDistance < tuning.rangerPersonalSpace,
    'bounded separation must not snap directly to the personal-space edge on the first frame'
  );
  f.tick(Math.ceil((tuning.rangerPersonalSpace / tuning.rangerSeparationSpeed) / 0.05) + 4);
  assert.ok(
    Math.hypot(f.root.position.x - f.position.x, f.root.position.z - f.position.z) >= tuning.rangerPersonalSpace,
    'bounded separation must still restore Ranger personal space promptly'
  );

  const heights = [];
  for (let i = 0; i < 80; i++) { f.tick(); heights.push(f.root.position.y); }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.06, 'Idle hover must visibly move');
  assert.ok(heights.every(y => Math.abs(y - tuning.hoverHeight) <= tuning.hoverAmplitude + 0.001), 'Hover stays restrained');
}
{
  const f = fixture();
  f.tick(2);
  const perceivedBefore = f.controller.perceivedPlayerPosition.clone();
  f.position.set(2.5, 0, 0);
  f.tick();
  assert.ok(f.controller.perceivedPlayerPosition.distanceTo(perceivedBefore) < 0.01,
    'Sprout must not know an abrupt Ranger move on the same frame');
  f.tick(10);
  const intermediateError = f.controller.perceivedPlayerPosition.distanceTo(f.position);
  assert.ok(intermediateError > 0.02 && intermediateError < 2.49,
    'once sensed, Sprout perception must ease toward Ranger instead of snapping to the newest sample');
  f.tick(24);
  assert.ok(f.controller.perceivedPlayerPosition.distanceTo(f.position) < 0.01,
    'Sprout must settle onto the sampled Ranger position after its delayed eased response');
}
{
  const f = fixture();
  const start = f.root.position.clone();
  f.tick(Math.ceil((tuning.idleAfterSeconds + 3) / 0.05));
  const horizontalTravel = Math.hypot(f.root.position.x - start.x, f.root.position.z - start.z);
  assert.ok(horizontalTravel > 0.2, 'Stationary Ranger must allow independent Sprout idle roaming');
  assert.equal(f.controller.rangerMoving, false);
}
{
  const f = fixture();
  f.tick(Math.ceil((tuning.idleAfterSeconds + 0.3) / 0.05));
  const item = f.add('stick', f.root.position.x, f.root.position.z + 0.6);
  f.tick(6);
  assert.ok(f.controller.target, 'Idle collection must scan-lock a nearby loose resource before reserving it');
  assert.equal(f.controller.compression, null, 'Idle collection must not overlap target scanning and compression');
  f.tick(Math.ceil((tuning.targetScanHoldSeconds + 0.15) / 0.05));
  assert.ok(f.controller.compression, 'Idle collection must reserve the resource after the scan-lock pause');
  assert.ok(f.controller.compression.inspectDuration >= tuning.idleInspectMinSeconds,
    'Idle collection must include an inspection beat before compression');
  f.tick(8);
  assert.equal(f.inventory.get('stick'), 0, 'Inspection must not award inventory early');
  assert.ok(item.active && item.reservedBy, 'Inspection preserves the reservation/commit boundary');
  f.tick(50);
  assert.equal(f.inventory.get('stick'), 1, 'Inspected pickup must still commit exactly once');
}
{
  const f = fixture();
  f.tick(Math.ceil((tuning.idleAnimationAfterSeconds - 0.5) / 0.05));
  assert.equal(f.controller.idleAnimation, null, 'Extended-idle flourish must not start early');
  assert.equal(f.externalActions.has('sprout-bond'), false, 'Sprout idle must not create a context action');

  f.tick(Math.ceil(0.8 / 0.05));
  assert.ok(f.controller.idleAnimation, 'Extended Ranger inactivity must automatically start Sprout idle animation');
  assert.equal(f.controller.idleAnimation.kind, 'affection', 'First idle flourish should use the playful affection pose');
  assert.equal(f.controller.getPresentationState().affectionate, true);
  assert.equal(f.player.cinematicDriver, null, 'Automatic Sprout idle animation must never take Ranger cinematic control');
  assert.equal(f.externalActions.size, 0, 'Automatic Sprout idle animation must not expose PET, COUNT or another button');

  f.position.x += 0.25;
  f.tick();
  assert.equal(f.controller.idleAnimation, null, 'Ranger movement must cancel the autonomous idle animation immediately');
  assert.equal(f.controller.rangerIdleElapsed, 0, 'Ranger movement must reset the extended-idle timer');
  assert.equal(f.player.cinematicDriver, null, 'Cancelling idle animation must leave Ranger control untouched');
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
  f.tick(Math.ceil((tuning.targetScanHoldSeconds + 0.05) / 0.05));
  assert.ok(f.controller.compression, 'Disposal test requires an active reserved transfer');
  f.controller.dispose();
  assert.ok(item.active && item.root.visible && !item.reservedBy, 'Disposal releases reservation');
  assert.equal(f.inventory.get('stick'), 0);
}
{
  const f = fixture();
  let highestSurfaceQueries = 0;
  let walkableQueries = 0;
  f.controller.island.heightAt = () => {
    highestSurfaceQueries += 1;
    return 0;
  };
  f.controller.island.walkableHeightAt = (x, z, { referenceY = null } = {}) => {
    walkableQueries += 1;
    return Number.isFinite(referenceY) && referenceY < -2 ? -5 : 0;
  };

  f.position.set(0, -5, 14);
  f.tick();
  assert.ok(walkableQueries > 0, 'Cave catch-up must query the shared layer-aware walkable support');
  assert.equal(highestSurfaceQueries, 0, 'Cave catch-up must not force Sprout onto the highest surface layer');
  assert.ok(
    Math.abs(f.root.position.y - (-5 + tuning.hoverHeight)) < 0.001,
    'Hard catch-up must place Sprout above the Ranger\'s cave floor instead of above the surface'
  );

  f.position.set(0, 0, -14);
  f.tick();
  assert.ok(
    Math.abs(f.root.position.y - tuning.hoverHeight) < 0.001,
    'Returning to the overworld must resolve Sprout back onto the surface layer'
  );
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
console.log('Sprout runtime behavior checks passed: scan-lock sequence, transaction, catch-up, semantic-door exit routing, cave-layer grounding, eased delayed follow sensing, bounded Ranger separation, idle roam/inspection, automatic idle flourish, Ranger space, hover and mobile geometry.');
