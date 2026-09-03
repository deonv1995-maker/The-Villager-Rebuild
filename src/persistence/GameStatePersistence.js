import * as THREE from 'three';
import {
  LOG_BUILD_MODES,
  LOG_CONSTRUCTION_MODES,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { TOOL_DEFINITIONS, TOOL_DURABILITY } from '../data/ToolDefinitions.js';
import { createConstructionLogVisual } from '../world/PhysicalLogVisual.js';
import { THATCH_GRASS_COST } from '../world/RoofThatchSystem.js';

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clampInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
};
const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const finiteArray = (value, length, fallback) => {
  if (!Array.isArray(value) || value.length !== length) return [...fallback];
  const normalized = value.map((entry, index) => finiteNumber(entry, fallback[index]));
  return normalized.length === length ? normalized : [...fallback];
};

const captureTransform = object => ({
  position: object.position.toArray(),
  quaternion: object.quaternion.toArray(),
  scale: object.scale.toArray()
});

const applyTransform = (object, transform) => {
  const position = finiteArray(transform?.position, 3, [0, 0, 0]);
  const quaternion = finiteArray(transform?.quaternion, 4, [0, 0, 0, 1]);
  const scale = finiteArray(transform?.scale, 3, [1, 1, 1]);
  object.position.fromArray(position);
  object.quaternion.fromArray(quaternion).normalize();
  object.scale.fromArray(scale);
};

const capturePlayer = game => {
  const position = game.player.getPosition(new THREE.Vector3());
  return {
    position: { x: position.x, z: position.z },
    rootYaw: game.player.root.rotation.y,
    cameraYaw: game.player.yaw,
    cameraPitch: game.player.pitch
  };
};

const restorePlayer = (game, state) => {
  if (!isRecord(state?.position)) throw new Error('Save is missing Ranger position state');
  const x = finiteNumber(state.position.x, Number.NaN);
  const z = finiteNumber(state.position.z, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Saved Ranger position is invalid');

  const rootYaw = finiteNumber(state.rootYaw, Math.PI);
  const driver = { id: 'save-game-restore' };
  if (!game.player.beginCinematic(driver)) throw new Error('Ranger is busy and cannot restore a save point');
  game.player.setCinematicPose({ x, z, yaw: rootYaw, snapCamera: true });
  game.player.endCinematic(driver);
  game.player.yaw = finiteNumber(state.cameraYaw, rootYaw + Math.PI);
  game.player.pitch = THREE.MathUtils.clamp(finiteNumber(state.cameraPitch, -0.22), -0.75, 0.25);
};

const captureInventory = game => ({
  quantities: Object.fromEntries(
    game.inventory.snapshot().map(item => [item.id, item.quantity])
  )
});

const restoreInventory = (game, state) => {
  if (!isRecord(state?.quantities)) throw new Error('Save is missing inventory state');
  for (const item of game.inventory.snapshot()) {
    if (item.quantity > 0) {
      game.inventory.consume([{ itemId: item.id, quantity: item.quantity }]);
    }
  }
  for (const item of game.inventory.snapshot()) {
    const quantity = clampInteger(state.quantities[item.id]);
    if (quantity > 0) game.inventory.add(item.id, quantity);
  }
};

const captureEquipment = game => {
  const durability = {};
  for (const toolId of Object.keys(TOOL_DEFINITIONS)) {
    durability[toolId] = [...(game.toolDurability?.units?.get(toolId) ?? [])];
  }
  return {
    equippedToolId: game.toolbelt.getEquippedToolId(),
    durability
  };
};

const restoreEquipment = (game, state, recoveredSpearDurabilities = []) => {
  if (!game.toolDurability) throw new Error('Tool durability runtime is unavailable during restore');
  const durabilityState = isRecord(state?.durability) ? state.durability : {};
  const maximum = TOOL_DURABILITY.maxPercent;

  for (const toolId of Object.keys(TOOL_DEFINITIONS)) {
    const quantity = game.inventory.get(toolId);
    const savedUnits = Array.isArray(durabilityState[toolId]) ? durabilityState[toolId] : [];
    const units = savedUnits
      .map(value => THREE.MathUtils.clamp(finiteNumber(value, maximum), 0.1, maximum))
      .slice(0, quantity);

    if (toolId === 'spear' && recoveredSpearDurabilities.length > 0) {
      for (const value of recoveredSpearDurabilities) {
        if (units.length >= quantity) break;
        units.push(THREE.MathUtils.clamp(finiteNumber(value, maximum), 0.1, maximum));
      }
    }
    while (units.length < quantity) units.push(maximum);
    game.toolDurability.units.set(toolId, units);
  }

  const equipped = state?.equippedToolId;
  const result = game.toolbelt.select(equipped ?? 'hand');
  if (!result?.equipped) game.toolbelt.clear();
};

const captureHarvest = game => ({
  trees: game.treeHarvest.trees
    .filter(tree => tree.hits > 0 || !tree.active)
    .map(tree => ({ treeId: tree.treeId, hits: tree.hits, active: tree.active })),
  rocks: game.rockHarvest.rocks
    .filter(rock => rock.hits > 0 || !rock.active)
    .map(rock => ({ id: rock.id, hits: rock.hits, active: rock.active }))
});

const restoreHarvest = (game, state) => {
  const trees = Array.isArray(state?.trees) ? state.trees : [];
  for (const saved of trees) {
    const tree = game.treeHarvest.trees.find(candidate => candidate.treeId === saved.treeId);
    if (!tree) continue;
    const hits = clampInteger(saved.hits, 0, game.treeHarvest.definition.hitsRequired);
    const point = new THREE.Vector3(
      tree.obstacle.x,
      game.island.heightAt(tree.obstacle.x, tree.obstacle.z),
      tree.obstacle.z
    );
    for (let index = 0; index < hits && tree.active; index += 1) {
      game.treeHarvest.chop(point);
    }
  }

  const rocks = Array.isArray(state?.rocks) ? state.rocks : [];
  for (const saved of rocks) {
    const rock = game.rockHarvest.rocks.find(candidate => candidate.id === saved.id);
    if (!rock) continue;
    const hits = clampInteger(saved.hits, 0, 3);
    const point = new THREE.Vector3(
      rock.obstacle.x,
      game.island.heightAt(rock.obstacle.x, rock.obstacle.z),
      rock.obstacle.z
    );
    for (let index = 0; index < hits && rock.active; index += 1) {
      game.rockHarvest.mine(point);
    }
  }
};

const captureGatherables = game => ({
  nextSpawnId: game.gatherables.nextSpawnId,
  items: game.gatherables.items.map(item => ({
    id: item.id,
    resourceId: item.resourceId,
    active: item.active,
    quantity: item.quantity,
    transform: captureTransform(item.root)
  })),
  harvestedGrassPatchIds: game.gatherables.grassPatches
    .filter(patch => !patch.active)
    .map(patch => patch.id)
});

const applyGatherableState = (gatherables, item, saved) => {
  item.quantity = clampInteger(saved.quantity, 1);
  applyTransform(item.root, saved.transform);
  item.active = Boolean(saved.active);
  item.root.visible = true;
  if (item.active) {
    if (item.root.parent !== gatherables.group) gatherables.group.add(item.root);
  } else {
    item.root.parent?.remove(item.root);
  }
};

const hideGrassPatch = (gatherables, patch) => {
  if (!patch?.active) return;
  patch.active = false;
  const dirtyMeshes = new Set();
  const dummy = gatherables.grassDummy ?? new THREE.Object3D();
  for (const entry of patch.entries ?? []) {
    entry.grassHarvested = true;
    entry.scaleX = 0;
    entry.scaleY = 0;
    entry.scaleZ = 0;
    gatherables.grassField?.active?.delete?.(entry);
    if (!entry?.mesh || entry.index < 0) continue;
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.rotation.set(entry.baseLeanX ?? 0, entry.baseYaw ?? 0, entry.baseLeanZ ?? 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, dummy.matrix);
    dirtyMeshes.add(entry.mesh);
  }
  for (const mesh of dirtyMeshes) mesh.instanceMatrix.needsUpdate = true;
};

const restoreGatherables = (game, state) => {
  if (!Array.isArray(state?.items)) throw new Error('Save is missing world gatherable state');
  const gatherables = game.gatherables;
  const savedById = new Map(state.items.map(item => [item.id, item]));

  for (const item of [...gatherables.items]) {
    if (String(item.id).startsWith('spawn-')) {
      item.root.parent?.remove(item.root);
    }
  }
  gatherables.items = gatherables.items.filter(item => !String(item.id).startsWith('spawn-'));
  gatherables.nextSpawnId = 0;

  for (const item of gatherables.items) {
    const saved = savedById.get(item.id);
    if (saved) applyGatherableState(gatherables, item, saved);
  }

  const dynamicItems = state.items
    .filter(item => /^spawn-\d+$/.test(String(item.id)))
    .sort((left, right) => Number(left.id.slice(6)) - Number(right.id.slice(6)));

  for (const saved of dynamicItems) {
    const desiredId = Number(saved.id.slice(6));
    if (gatherables.nextSpawnId < desiredId) gatherables.nextSpawnId = desiredId;
    gatherables.spawn(saved.resourceId, {
      x: finiteNumber(saved.transform?.position?.[0]),
      z: finiteNumber(saved.transform?.position?.[2]),
      quantity: clampInteger(saved.quantity, 1),
      yaw: 0
    });
    const item = gatherables.items[gatherables.items.length - 1];
    if (item.id !== saved.id) item.id = saved.id;
    applyGatherableState(gatherables, item, saved);
  }

  gatherables.nextSpawnId = Math.max(
    gatherables.nextSpawnId,
    clampInteger(state.nextSpawnId)
  );
  const harvested = new Set(Array.isArray(state.harvestedGrassPatchIds) ? state.harvestedGrassPatchIds : []);
  for (const patch of gatherables.grassPatches) {
    if (harvested.has(patch.id)) hideGrassPatch(gatherables, patch);
  }
  gatherables.target = null;
  if (gatherables.indicator) gatherables.indicator.visible = false;
};

const captureCampfire = game => game.campfire.getState();

const restoreCampfire = (game, state) => {
  if (!state?.built) return;
  const position = state.position;
  if (!isRecord(position)) throw new Error('Saved campfire position is invalid');

  const added = [];
  for (const ingredient of game.campfire.definition.ingredients) {
    game.inventory.add(ingredient.itemId, ingredient.quantity);
    added.push({ ...ingredient });
  }

  game.campfire.previewRoot = new THREE.Group();
  game.campfire.previewPlacement = {
    x: finiteNumber(position.x),
    y: finiteNumber(position.y),
    z: finiteNumber(position.z)
  };
  const built = game.campfire.confirmBuild();
  if (built) return;

  game.campfire.cancelPreview();
  game.inventory.consume(added);
  throw new Error('Saved campfire could not be reconstructed');
};

const captureConstruction = game => ({
  nextBuiltId: game.physicalLogs.nextBuiltId,
  buildMode: game.physicalLogs.buildMode,
  carriedItemId: game.physicalLogs.carriedItem?.id ?? null,
  builtLogs: game.physicalLogs.builtLogs
    .filter(entry => entry.active)
    .map(entry => ({
      id: entry.id,
      mode: entry.mode,
      x: entry.x,
      z: entry.z,
      yaw: entry.yaw,
      baseY: entry.baseY,
      centerY: entry.centerY,
      topY: entry.topY,
      storey: entry.storey ?? 0,
      rawKey: entry.rawKey,
      snapKind: entry.snapKind,
      roofKey: entry.roofKey,
      roofRegionKey: entry.roofRegionKey,
      roofRole: entry.roofRole,
      roofLength: entry.roofLength,
      supportRegionKey: entry.supportRegionKey,
      stairKey: entry.stairKey,
      stairOpeningKey: entry.stairOpeningKey,
      stairOpeningRegionKeys: entry.stairOpeningRegionKeys,
      stairStepIndex: entry.stairStepIndex,
      stairStepCount: entry.stairStepCount,
      transform: captureTransform(entry.root)
    }))
});

const registerPersistedLogCollision = (game, mode, placement, root) => {
  const collision = game.island.collision;
  const label = root.name;
  if (placement.snapKind === 'roof-rafter' || placement.snapKind === 'roof-ridge') return null;

  if (mode === 'frame') {
    return collision.addObstacle({
      x: placement.x,
      z: placement.z,
      radius: 0.3,
      type: 'placed-log',
      label,
      bottomY: placement.baseY,
      topY: placement.topY
    });
  }

  if (mode === 'wall') {
    return collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: 0.28,
      yaw: placement.yaw,
      type: 'placed-log',
      label,
      bottomY: placement.y - 0.28,
      topY: placement.topY
    });
  }

  if (mode === 'angle') {
    return collision.addObstacle({
      x: placement.x,
      z: placement.z,
      radius: 0.34,
      type: 'placed-log',
      label,
      bottomY: placement.baseY,
      topY: placement.topY
    });
  }

  if (mode === 'stairs') {
    return collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: PHYSICAL_LOG.radius,
      yaw: placement.yaw,
      type: 'placed-log',
      label,
      bottomY: placement.topY - PHYSICAL_LOG.radius * 2,
      topY: placement.topY,
      standable: true,
      supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
      supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportY: placement.topY,
      supportOverridesBase: true,
      supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
      stepHeight: PHYSICAL_LOG.stairMaxStepRise + 0.02
    });
  }

  if (mode === 'floor') {
    return collision.addBox({
      x: placement.x,
      z: placement.z,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: PHYSICAL_LOG.floorWidth * 0.5,
      yaw: placement.yaw,
      type: 'placed-log',
      label,
      bottomY: placement.baseY - PHYSICAL_LOG.floorUndersideDepth - 0.02,
      topY: placement.topY,
      standable: true,
      supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
      supportHalfZ: PHYSICAL_LOG.floorWidth * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportY: placement.topY,
      supportOverridesBase: true,
      supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
      stepHeight: 0.18
    });
  }

  if (mode === 'roof') return null;

  const overheadFrameBeam = mode === 'raw' && placement.snapKind === 'frame-pair-top';
  return collision.addBox({
    x: placement.x,
    z: placement.z,
    halfX: PHYSICAL_LOG.halfLength,
    halfZ: PHYSICAL_LOG.radius,
    yaw: placement.yaw,
    type: 'placed-log',
    label,
    bottomY: placement.snapKind ? placement.y - PHYSICAL_LOG.radius : placement.ground,
    topY: placement.y + PHYSICAL_LOG.radius,
    standable: !overheadFrameBeam,
    supportHalfX: overheadFrameBeam ? 0 : PHYSICAL_LOG.halfLength - 0.14,
    supportHalfZ: overheadFrameBeam ? 0 : PHYSICAL_LOG.radius * 0.7,
    supportY: overheadFrameBeam ? null : placement.y + PHYSICAL_LOG.radius,
    stepHeight: 0.58
  });
};

const restoreConstruction = (game, state) => {
  const physicalLogs = game.physicalLogs;
  const builtLogs = Array.isArray(state?.builtLogs) ? state.builtLogs : [];

  for (const built of physicalLogs.builtLogs) {
    if (built.collisionHandle) game.island.collision.removeObstacle(built.collisionHandle);
    physicalLogs.floorSupports.remove(built.supportRoot);
    built.root?.parent?.remove(built.root);
  }
  physicalLogs.builtLogs = [];
  physicalLogs.nextBuiltId = 0;
  physicalLogs.carriedItem = null;
  const savedBuildMode = state?.buildMode === 'angle' ? 'stairs' : state?.buildMode;
  physicalLogs.buildMode = LOG_BUILD_MODES.includes(savedBuildMode) ? savedBuildMode : 'raw';

  for (const saved of builtLogs.sort((left, right) => left.id - right.id)) {
    if (!LOG_CONSTRUCTION_MODES.includes(saved.mode)) continue;
    const id = clampInteger(saved.id);
    const root = createConstructionLogVisual(saved.mode);
    root.name = `built-log-${id}-${saved.mode}`;
    applyTransform(root, saved.transform);
    physicalLogs.group.add(root);

    const placement = {
      x: finiteNumber(saved.x, root.position.x),
      z: finiteNumber(saved.z, root.position.z),
      yaw: finiteNumber(saved.yaw),
      baseY: finiteNumber(saved.baseY, root.position.y),
      ground: finiteNumber(saved.baseY, root.position.y),
      y: root.position.y,
      topY: finiteNumber(saved.topY, root.position.y + PHYSICAL_LOG.radius),
      snapKind: saved.snapKind ?? null,
      rawKey: saved.rawKey ?? null,
      roofKey: saved.roofKey ?? null,
      roofRegionKey: saved.roofRegionKey ?? null,
      roofRole: saved.roofRole ?? null,
      roofLength: Number.isFinite(saved.roofLength) ? saved.roofLength : null,
      supportRegionKey: saved.supportRegionKey ?? null,
      stairKey: saved.stairKey ?? null,
      stairOpeningKey: saved.stairOpeningKey ?? null,
      stairOpeningRegionKeys: Array.isArray(saved.stairOpeningRegionKeys) ? saved.stairOpeningRegionKeys : null,
      stairStepIndex: Number.isFinite(saved.stairStepIndex) ? saved.stairStepIndex : null,
      stairStepCount: Number.isFinite(saved.stairStepCount) ? saved.stairStepCount : null,
      storey: clampInteger(saved.storey)
    };
    const collisionHandle = registerPersistedLogCollision(game, saved.mode, placement, root);
    const built = {
      id,
      mode: saved.mode,
      root,
      collisionHandle,
      supportRoot: null,
      active: true,
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      baseY: placement.baseY,
      centerY: finiteNumber(saved.centerY, root.position.y),
      topY: placement.topY,
      rawKey: placement.rawKey,
      snapKind: placement.snapKind,
      roofKey: placement.roofKey,
      roofRegionKey: placement.roofRegionKey,
      roofRole: placement.roofRole,
      roofLength: placement.roofLength,
      supportRegionKey: placement.supportRegionKey,
      stairKey: placement.stairKey,
      stairOpeningKey: placement.stairOpeningKey,
      stairOpeningRegionKeys: placement.stairOpeningRegionKeys,
      stairStepIndex: placement.stairStepIndex,
      stairStepCount: placement.stairStepCount,
      storey: placement.storey
    };
    physicalLogs.builtLogs.push(built);
    if (built.mode === 'floor' && built.storey === 0) {
      built.supportRoot = physicalLogs.floorSupports.createForFloor(placement, id);
    }
  }

  const highestId = physicalLogs.builtLogs.reduce((max, entry) => Math.max(max, entry.id + 1), 0);
  physicalLogs.nextBuiltId = Math.max(highestId, clampInteger(state?.nextBuiltId));
  physicalLogs.structureRevision += 1;
  physicalLogs.framePairCacheRevision = -1;
  physicalLogs.floorCornerCacheRevision = -1;
  physicalLogs.upperFloorRegionCacheRevision = -1;
  physicalLogs.roofQueryCacheRevision = -1;
  physicalLogs.framePairCache = [];
  physicalLogs.floorCornerCache = [];
  physicalLogs.upperFloorRegionCache = [];
  physicalLogs.roofQueryCache = [];
  physicalLogs.roofQueryCacheKey = '';

  const carriedItemId = state?.carriedItemId;
  if (!carriedItemId) return;
  const item = game.gatherables.items.find(candidate => candidate.id === carriedItemId);
  if (!item || item.resourceId !== 'log') return;
  item.active = false;
  item.root.parent?.remove(item.root);
  game.player.root.add(item.root);
  item.root.scale.setScalar(1);
  item.root.position.set(...PHYSICAL_LOG.carryPosition);
  item.root.rotation.set(...PHYSICAL_LOG.carryEuler);
  item.root.visible = false;
  physicalLogs.carriedItem = item;
  physicalLogs.carryPose.setActive(false);
};

const captureWallPanels = game => ({
  panels: [...(game.wallPanelCustomization?.system?.customizations?.values?.() ?? [])]
    .map(state => ({ id: state.key, variant: state.variant }))
});

const restoreWallPanels = (game, state) => {
  const system = game.wallPanelCustomization?.system;
  if (!system) return;
  system.sync();
  for (const panel of Array.isArray(state?.panels) ? state.panels : []) {
    const result = system.customize(panel.id, panel.variant);
    if (!result) throw new Error(`Saved wall panel ${panel.id} could not be reconstructed`);
  }
};

const captureRoofThatch = game => ({
  panels: [...(game.roofThatch?.system?.thatched?.entries?.() ?? [])]
    .map(([id, state]) => ({
      id,
      center: {
        x: state.panel.center.x,
        y: state.panel.center.y,
        z: state.panel.center.z
      }
    }))
});

const restoreRoofThatch = (game, state) => {
  const system = game.roofThatch?.system;
  if (!system) return;
  system.sync();
  for (const panel of Array.isArray(state?.panels) ? state.panels : []) {
    game.inventory.add('grass', THATCH_GRASS_COST);
    const result = system.thatch(panel.id, panel.center);
    if (result?.built) continue;
    game.inventory.consume([{ itemId: 'grass', quantity: THATCH_GRASS_COST }]);
    throw new Error(`Saved roof thatch ${panel.id} could not be reconstructed`);
  }
};

const captureProjectiles = game => {
  const durabilities = game.spearProjectiles.embeddedSpears
    .map(spear => finiteNumber(spear.durability, TOOL_DURABILITY.maxPercent));
  if (game.spearProjectiles.projectile) {
    durabilities.push(finiteNumber(
      game.spearProjectiles.projectileDurability,
      TOOL_DURABILITY.maxPercent
    ));
  }
  return { recoverableSpearDurabilities: durabilities };
};

const recoverTransientSpears = (game, state) => {
  const durabilities = Array.isArray(state?.recoverableSpearDurabilities)
    ? state.recoverableSpearDurabilities
        .map(value => finiteNumber(value, 0))
        .filter(value => value > 0)
    : [];
  for (const durability of durabilities) game.inventory.add('spear', 1);
  return durabilities;
};

export function captureGameState(game) {
  if (!game?.player || !game?.inventory || !game?.physicalLogs) {
    throw new Error('captureGameState requires a fully started game');
  }
  return {
    player: capturePlayer(game),
    inventory: captureInventory(game),
    equipment: captureEquipment(game),
    harvest: captureHarvest(game),
    gatherables: captureGatherables(game),
    campfire: captureCampfire(game),
    construction: captureConstruction(game),
    wallPanels: captureWallPanels(game),
    roofThatch: captureRoofThatch(game),
    projectiles: captureProjectiles(game)
  };
}

export function restoreGameState(game, state) {
  if (!isRecord(state)) throw new Error('Saved gameplay state is invalid');
  restoreInventory(game, state.inventory);
  restoreHarvest(game, state.harvest);
  restoreGatherables(game, state.gatherables);
  restoreCampfire(game, state.campfire);
  restoreConstruction(game, state.construction);
  restoreWallPanels(game, state.wallPanels);
  restoreRoofThatch(game, state.roofThatch);
  const recoveredSpearDurabilities = recoverTransientSpears(game, state.projectiles);
  restoreEquipment(game, state.equipment, recoveredSpearDurabilities);
  restorePlayer(game, state.player);

  game.wallPanelCustomization?.system?.sync();
  game.roofThatch?.system?.sync();
  return true;
}