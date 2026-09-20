import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { TERRAIN_SCULPT_MODES } from '../src/data/TerrainSculptingDefinitions.js';
import { ConstructionTerrainAdaptationSystem } from '../src/world/ConstructionTerrainAdaptationSystem.js';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';
import { ExplorationPoiSystem } from '../src/world/ExplorationPoiSystem.js';
import { TerrainSculptingSystem } from '../src/world/TerrainSculptingSystem.js';
import { WaterVisualSystem } from '../src/world/WaterVisualSystem.js';

const pointInTriangle2D = (px, pz, a, b, c) => {
  const sign = (x1, z1, x2, z2, x3, z3) =>
    (x1 - x3) * (z2 - z3) - (x2 - x3) * (z1 - z3);
  const d1 = sign(px, pz, a.x, a.z, b.x, b.z);
  const d2 = sign(px, pz, b.x, b.z, c.x, c.z);
  const d3 = sign(px, pz, c.x, c.z, a.x, a.z);
  const hasNegative = d1 < -0.000001 || d2 < -0.000001 || d3 < -0.000001;
  const hasPositive = d1 > 0.000001 || d2 > 0.000001 || d3 > 0.000001;
  return !(hasNegative && hasPositive);
};

const findGround = (terrain, {
  minHeight = terrain.waterLevel + 1.25,
  minDistanceFrom = null,
  minDistance = 0
} = {}) => {
  for (let z = -120; z <= 120; z += 8) {
    for (let x = -150; x <= 150; x += 8) {
      if (!terrain.isPlayable(x, z, 3)) continue;
      if (terrain.heightAt(x, z) < minHeight) continue;
      if (
        minDistanceFrom &&
        Math.hypot(x - minDistanceFrom.x, z - minDistanceFrom.z) < minDistance
      ) continue;
      return { x, z, y: terrain.heightAt(x, z) };
    }
  }
  return null;
};

assert.deepEqual(
  TERRAIN_SCULPT_MODES,
  ['raise', 'lower', 'dig', 'smooth', 'level'],
  'Pickaxe terrain menu order must remain Raise, Lower, Dig, Smoothen, Level'
);

const group = new THREE.Group();
const terrain = new ExpandedIslandTerrainSystem(group);
terrain.create();

const foundationWater = group.getObjectByName('foundation-water');
assert.ok(foundationWater, 'base ocean surface must exist');
assert.equal(
  foundationWater.userData.naturalWaterMask,
  true,
  'base ocean surface must be masked to naturally submerged world cells'
);
assert.equal(
  foundationWater.geometry.userData.naturalWaterMask,
  true,
  'shared ocean geometry must declare the natural-water mask'
);

const waterVisuals = new WaterVisualSystem({ group, terrain });
waterVisuals.create();
const shimmer = group.getObjectByName('stylized-ocean-shimmer');
assert.ok(shimmer, 'animated ocean shimmer must exist');
assert.equal(
  shimmer.userData.naturalWaterMask,
  true,
  'ocean shimmer must use the same land-aware mask as the base water surface'
);

const inland = findGround(terrain);
assert.ok(inland, 'test island must expose solid inland ground');
assert.equal(
  terrain.isNaturalWaterAt(inland.x, inland.z),
  false,
  'solid inland ground must not be part of the ocean render mask'
);

const waterPositions = foundationWater.geometry.getAttribute('position');
const localZ = inland.z - terrain.centerZ;
let waterCoversInland = false;
for (let index = 0; index < waterPositions.count; index += 3) {
  const triangle = [0, 1, 2].map(offset => ({
    x: waterPositions.getX(index + offset),
    z: waterPositions.getZ(index + offset)
  }));
  if (pointInTriangle2D(inland.x, localZ, triangle[0], triangle[1], triangle[2])) {
    waterCoversInland = true;
    break;
  }
}
assert.equal(
  waterCoversInland,
  false,
  'ocean geometry must not exist underneath solid inland mining ground'
);

let rebuiltChunks = 0;
terrain.onTerrainChunkGeometryChanged(() => {
  rebuiltChunks += 1;
});
const constructionTerrain = new ConstructionTerrainAdaptationSystem({
  group,
  terrain
});
constructionTerrain.captureTerrainMeshes();
const terrainRevisionBeforeSculpt = constructionTerrain.getRevision();
const sculpting = new TerrainSculptingSystem({ terrain });

const startHeight = terrain.heightAt(inland.x, inland.z);
const aimOrigin = new THREE.Vector3(inland.x, startHeight + 2.2, inland.z);
const downward = new THREE.Vector3(0, -1, 0);
const surfaceTarget = sculpting.getSurfaceTarget({
  aim: { origin: aimOrigin, direction: downward },
  playerPosition: aimOrigin
});
assert.ok(surfaceTarget, 'surface terraforming must acquire reachable ground with the white-dot ray');
assert.equal(surfaceTarget.type, 'terraform-ground');

const raised = sculpting.apply('raise', surfaceTarget);
assert.ok(raised?.changed, 'Raise must create a terrain edit');
assert.ok(
  terrain.heightAt(inland.x, inland.z) > startHeight + 0.3,
  'Raise must increase the shared terrain height authority'
);
assert.ok(rebuiltChunks > 0, 'a surface edit must rebuild only affected terrain chunks');
assert.ok(
  constructionTerrain.getRevision() > terrainRevisionBeforeSculpt,
  'surface edits must advance the shared terrain revision so grass and ground cover can reproject'
);
const sculptChunkX = Math.floor(inland.x / 72);
const sculptChunkZ = Math.floor(inland.z / 72);
const sculptMesh = group.getObjectByName(`terrain-chunk-${sculptChunkX}-${sculptChunkZ}`);
assert.ok(sculptMesh, 'edited terrain chunk must remain present');
assert.equal(
  sculptMesh.userData.surfaceSculpted,
  true,
  'a chunk containing surface edits must opt into the scoped sculpt render lattice'
);
assert.equal(
  sculptMesh.userData.terrainSegments,
  terrain.sculptTerrainSegments,
  'surface editing must render at finer detail than the ordinary world lattice'
);

const distant = findGround(terrain, {
  minDistanceFrom: inland,
  minDistance: 24
});
assert.ok(distant, 'test island must expose a second independent sculpting location');
const distantNatural = terrain.heightAt(distant.x, distant.z);
const distantTarget = {
  type: 'terraform-ground',
  point: new THREE.Vector3(distant.x, distantNatural, distant.z)
};
const lowered = sculpting.apply('lower', distantTarget);
assert.ok(lowered?.changed, 'Lower must create a terrain edit');
assert.ok(
  terrain.heightAt(distant.x, distant.z) < distantNatural - 0.3,
  'Lower must decrease the shared terrain height authority'
);

const nearLevelPoint = {
  x: inland.x + 1.25,
  z: inland.z
};
const beforeLevelDifference = Math.abs(
  terrain.heightAt(inland.x, inland.z) -
  terrain.heightAt(nearLevelPoint.x, nearLevelPoint.z)
);
assert.ok(sculpting.apply('level', surfaceTarget)?.changed, 'Level must create a terrain edit');
const afterLevelDifference = Math.abs(
  terrain.heightAt(inland.x, inland.z) -
  terrain.heightAt(nearLevelPoint.x, nearLevelPoint.z)
);
assert.ok(
  afterLevelDifference <= beforeLevelDifference + 0.01,
  'Level must not increase height difference inside its brush'
);

assert.ok(sculpting.apply('smooth', surfaceTarget)?.changed, 'Smoothen must create a terrain edit');
assert.equal(
  sculpting.apply('dig', surfaceTarget),
  null,
  'Dig must remain outside the 2D surface sculpting authority'
);

const snapshot = sculpting.captureState();
assert.equal(snapshot.kind, 'terrain-sculpting-v1');
assert.equal(snapshot.edits.length, 4, 'surface state must persist only the four surface operations');

const restoreGroup = new THREE.Group();
const restoredTerrain = new ExpandedIslandTerrainSystem(restoreGroup);
restoredTerrain.create();
const restoredSculpting = new TerrainSculptingSystem({ terrain: restoredTerrain });
assert.equal(restoredSculpting.restoreState(snapshot), true, 'terrain sculpting state must restore');
assert.ok(
  Math.abs(
    restoredTerrain.heightAt(inland.x, inland.z) -
    terrain.heightAt(inland.x, inland.z)
  ) < 0.01,
  'restored surface height must reproduce the edited terrain'
);
assert.ok(
  Math.abs(
    restoredTerrain.heightAt(distant.x, distant.z) -
    terrain.heightAt(distant.x, distant.z)
  ) < 0.01,
  'restored Lower edits must reproduce at a separate location'
);

const tunnelGroup = new THREE.Group();
const underground = new ExplorationPoiSystem({
  group: tunnelGroup,
  terrain
});
underground.create();
const currentSurface = terrain.heightAt(inland.x, inland.z);
const mineTarget = underground.getMineTarget({
  aim: {
    origin: new THREE.Vector3(inland.x, currentSurface + 2.2, inland.z),
    direction: downward
  },
  playerPosition: new THREE.Vector3(inland.x, currentSurface + 2.2, inland.z)
});
assert.ok(mineTarget, 'DIG must still acquire the 3D density field after surface editing');
assert.ok(underground.mine(mineTarget)?.mined, 'DIG must still excavate a true underground volume');
assert.ok(
  underground.getDebugState().activeChunkCount > 0,
  'DIG must retain lazy 3D tunneling chunks'
);
assert.equal(
  underground.refreshTerrainSurface({
    x: inland.x,
    z: inland.z,
    radius: surfaceTarget.radius
  }),
  true,
  'active tunnels must rebuild against changed surface heights'
);

const [
  gameSource,
  contextSource,
  mainSource,
  saveSource,
  assetPathsSource,
  menuSource,
  controllerSource,
  constructionTerrainSource,
  tunnelingSource,
  indexSource
] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/ContextActionPolicy.js', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/persistence/SaveGameController.js', 'utf8'),
  readFile('src/data/AssetPaths.js', 'utf8'),
  readFile('src/ui/PickaxeTerrainMenu.js', 'utf8'),
  readFile('src/gameplay/PickaxeTerrainRuntimeController.js', 'utf8'),
  readFile('src/world/ConstructionTerrainAdaptationSystem.js', 'utf8'),
  readFile('src/world/UndergroundTunnelingSystem.js', 'utf8'),
  readFile('index.html', 'utf8')
]);

assert.ok(
  gameSource.includes('pickaxeSurfaceMode') &&
  gameSource.includes('pickaxeReady && !pickaxeSurfaceMode'),
  'GameApp must suppress rock/tunnel targeting while a surface Pickaxe mode owns the action'
);
assert.ok(
  contextSource.includes("const TERRAIN_ACTION_ID = 'pickaxe-terrain'") &&
  contextSource.includes('if (terrainAction) return resolveExternalAction(terrainAction);'),
  'mobile context action policy must prioritize the selected Pickaxe terrain operation'
);
assert.ok(
  mainSource.includes('new PickaxeTerrainRuntimeController({ game })') &&
  mainSource.includes('game.pickaxeTerrainRuntime = pickaxeTerrainRuntime'),
  'Pickaxe terrain runtime must start with gameplay'
);
assert.ok(
  saveSource.indexOf('restoreState?.(record.state.terrainSculpting)') <
  saveSource.indexOf('restoreState?.(record.state.tunneling)'),
  'surface edits must restore before 3D tunneling so density uses the edited ground height'
);
assert.ok(
  saveSource.includes('state.terrainSculpting = this.game.island?.terrainSculpting?.captureState?.() ?? null'),
  'surface terraforming must use the existing save record'
);
assert.ok(
  menuSource.includes('TERRAIN_SCULPT_MODES.map') &&
  menuSource.includes('data-terrain-mode="${mode}"') &&
  menuSource.includes('definition.label.toUpperCase()'),
  'menu rows must be generated from the centralized five-mode definition order'
);
assert.ok(
  assetPathsSource.includes("terrain: Object.freeze({") &&
  assetPathsSource.includes("icon-terrain-raise.svg") &&
  assetPathsSource.includes("icon-terrain-lower.svg") &&
  assetPathsSource.includes("icon-terrain-dig.svg") &&
  assetPathsSource.includes("icon-terrain-smooth.svg") &&
  assetPathsSource.includes("icon-terrain-level.svg"),
  'terrain operations must resolve through dedicated semantic icon assets'
);
assert.equal(
  menuSource.includes('ui.build.frame') ||
  menuSource.includes('ui.build.stairs') ||
  menuSource.includes('ui.build.roof') ||
  menuSource.includes('ui.build.floor'),
  false,
  'Pickaxe terrain operations must not reuse unrelated construction icons'
);
assert.ok(
  controllerSource.includes("this.mode !== 'dig'") &&
  controllerSource.includes("playSwing('pickaxe')") &&
  controllerSource.includes("recordUse?.('pickaxe')"),
  'surface terraforming must keep Dig separate and consume normal Pickaxe use/durability'
);
assert.ok(
  controllerSource.includes('getFloorSculptTarget?.({') &&
  controllerSource.includes('applyFloorSculpt?.(this.mode, target)') &&
  controllerSource.includes('point.y + 0.045'),
  'Raise/Lower/Smoothen/Level must fall through to the shared 3D tunnel-floor authority and preview at underground height'
);
assert.ok(
  constructionTerrainSource.includes('this.revision += 1;'),
  'terrain-geometry replacement must publish a revision for vegetation reprojection'
);
assert.ok(
  tunnelingSource.includes('#naturalSurfaceHeightAt(x, z)') &&
  tunnelingSource.includes('naturalSurfaceY - this.config.maxDepth'),
  'tunnel safety depth must remain anchored to natural geology instead of mutable surface edits'
);
assert.ok(
  indexSource.includes('./src/pickaxe-terrain-menu.css'),
  'Pickaxe terrain menu layout must be loaded by the app shell'
);

console.log('Pickaxe terrain modes, persistent surface sculpting, 3D Dig ownership and inland water masking verified');
