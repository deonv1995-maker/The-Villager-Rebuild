import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { PHYSICAL_LOG } from '../src/data/PhysicalLogDefinitions.js';
import { ConstructionTerrainAdaptationSystem } from '../src/world/ConstructionTerrainAdaptationSystem.js';
import { FloorSupportVisual } from '../src/world/FloorSupportVisual.js';
import { GrassFieldSystem } from '../src/world/GrassFieldSystem.js';
import { FernFieldSystem } from '../src/world/FernFieldSystem.js';
import { WorldCollisionSystem } from '../src/world/WorldCollisionSystem.js';

const nearlyEqual = (left, right, tolerance = 0.000001) => Math.abs(left - right) <= tolerance;
const snapGrid = value => Math.round(value / PHYSICAL_LOG.gridStep) * PHYSICAL_LOG.gridStep;

assert.ok(PHYSICAL_LOG.floorGroundClearance >= 0.06 && PHYSICAL_LOG.floorGroundClearance <= 0.1, 'Ground floors need a shallow seating clearance');
assert.equal(PHYSICAL_LOG.floorTerrainEmbedTolerance, PHYSICAL_LOG.floorMaxTerrainCutDepth, 'Legacy floor placement tolerance must share the single terrain-adaptation depth limit');
assert.ok(PHYSICAL_LOG.floorMaxTerrainCutDepth >= 2, 'Slope construction needs meaningful bounded high-side retreat depth');
assert.ok(PHYSICAL_LOG.floorTerrainCorePadding >= 0.08, 'Terrain cut core must extend slightly past the visible floor footprint');
assert.ok(PHYSICAL_LOG.floorTerrainBlendDistance >= 1.2, 'High-side terrain retreat must blend naturally into procedural terrain');
assert.ok(PHYSICAL_LOG.floorTerrainSurfaceClearance >= 0.05, 'Adapted terrain must remain below the split-log walking face');
assert.ok(PHYSICAL_LOG.floorUndersideDepth >= 0.2, 'Split-log support must target the curved underside rather than the walking surface');
assert.ok(PHYSICAL_LOG.floorMaxSupportDepth > PHYSICAL_LOG.floorMaxTerrainCutDepth, 'Downhill support depth should remain slightly more permissive than uphill retreat depth');

const lengthGridUnits = PHYSICAL_LOG.length / PHYSICAL_LOG.gridStep;
const widthGridUnits = PHYSICAL_LOG.floorWidth / PHYSICAL_LOG.gridStep;
assert.ok(nearlyEqual(lengthGridUnits, Math.round(lengthGridUnits)), 'Construction grid must divide the physical Log length exactly');
assert.ok(nearlyEqual(widthGridUnits, Math.round(widthGridUnits)), 'Construction grid must divide the floor strip width exactly');

const snappedOriginX = snapGrid(0.37);
const snappedOriginZ = snapGrid(-0.42);
const snappedLongX = snapGrid(snappedOriginX + PHYSICAL_LOG.length);
const snappedSideZ = snapGrid(snappedOriginZ + PHYSICAL_LOG.floorWidth);
assert.ok(nearlyEqual(snappedLongX - snappedOriginX, PHYSICAL_LOG.length), 'Connected floor ends must preserve the exact 2.9 m panel length');
assert.ok(nearlyEqual(snappedSideZ - snappedOriginZ, PHYSICAL_LOG.floorWidth), 'Connected floor sides must preserve the exact one-third Log strip width');

// Construction-local terrain adaptation: immutable natural terrain is never raised,
// high-side relief retreats below the floor, connected floors form one level terrace,
// and removing the active floors restores the captured terrain mesh exactly.
const terrainGroup = new THREE.Group();
const terrainGeometry = new THREE.BufferGeometry();
terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -1, -0.8, 0,
   1,  0.8, 0,
   4,  3.2, 0
], 3));
terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute([
  0.25, 0.55, 0.2,
  0.25, 0.55, 0.2,
  0.25, 0.55, 0.2
], 3));
const terrainMesh = new THREE.Mesh(terrainGeometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
terrainMesh.name = 'terrain-chunk-0-0';
terrainGroup.add(terrainMesh);
const naturalTerrain = { heightAt: x => x * 0.8 };
const adaptation = new ConstructionTerrainAdaptationSystem({ group: terrainGroup, terrain: naturalTerrain });
assert.equal(adaptation.captureTerrainMeshes(), 1, 'Construction terrain layer must capture existing terrain chunks instead of regenerating the island');
const naturalHigh = adaptation.heightAt(1, 0);
const naturalLow = adaptation.heightAt(-1, 0);
const floorA = { id: 1, mode: 'floor', active: true, x: 0, z: 0, yaw: 0, baseY: 0.08, topY: 0.108 };
assert.equal(adaptation.setFloors([floorA]), true);
const cutY = floorA.topY - PHYSICAL_LOG.floorTerrainSurfaceClearance;
assert.ok(nearlyEqual(adaptation.heightAt(1, 0), cutY, 0.00001), 'High-side natural terrain inside a floor must retreat to the construction clearance plane');
assert.equal(adaptation.heightAt(-1, 0), naturalLow, 'Construction terrain adaptation must never raise low-side natural terrain');
assert.equal(adaptation.heightAt(4, 0), naturalTerrain.heightAt(4, 0), 'Terrain outside the local blend must remain untouched');
assert.ok(terrainGeometry.getAttribute('position').getY(1) < naturalHigh, 'Terrain render vertices must follow the same local high-side retreat');
const floorB = { id: 2, mode: 'floor', active: true, x: PHYSICAL_LOG.length, z: 0, yaw: 0, baseY: 0.08, topY: 0.108 };
adaptation.setFloors([floorA, floorB]);
assert.ok(nearlyEqual(adaptation.heightAt(PHYSICAL_LOG.halfLength, 0), cutY, 0.00001), 'Connected floor footprints must meet as one coherent terrace surface');
assert.equal(adaptation.setFloors([]), true);
assert.equal(adaptation.heightAt(1, 0), naturalHigh, 'Demolition must reveal immutable natural terrain again');
assert.ok(nearlyEqual(terrainGeometry.getAttribute('position').getY(1), 0.8, 0.00001), 'Terrain mesh vertices must restore from their captured natural baseline after demolition');
assert.ok(nearlyEqual(terrainGeometry.getAttribute('color').getX(1), 0.25, 0.00001), 'Terrain color must restore with the natural mesh rather than leaving a permanent construction scar');

// Connected floors share one construction-owned foundation and merge common corner
// supports instead of generating competing per-panel support roots.
const foundationGroup = new THREE.Group();
let constructionFloorCount = 0;
const supportTerrain = {
  baseHeightAt: () => -1,
  heightAt: () => -1,
  setConstructionFloors: floors => { constructionFloorCount = floors.length; }
};
const foundation = new FloorSupportVisual({ group: foundationGroup, terrain: supportTerrain });
const supportA = foundation.createForFloor({ x: 0, z: 0, yaw: 0, baseY: 0.08, topY: 0.108 }, 10);
assert.equal(constructionFloorCount, 1, 'Floor support ownership must register the floor with the construction terrain layer');
let foundationRoot = foundationGroup.getObjectByName('construction-floor-foundations');
assert.equal(foundationRoot?.children.length, 4, 'One isolated floor should expose four foundation corner supports on deep low terrain');
const supportB = foundation.createForFloor({ x: PHYSICAL_LOG.length, z: 0, yaw: 0, baseY: 0.08, topY: 0.108 }, 11);
assert.equal(constructionFloorCount, 2);
foundationRoot = foundationGroup.getObjectByName('construction-floor-foundations');
assert.equal(foundationRoot?.children.length, 6, 'Two end-connected floors must merge their two shared seam corners instead of producing eight supports');
assert.equal(foundationRoot?.userData.floorIds.length, 2, 'Shared foundation root must represent the connected active floor set');
assert.equal(foundation.remove(supportB), true);
assert.equal(constructionFloorCount, 1, 'Demolishing one floor must resync the remaining active construction footprint');
foundationRoot = foundationGroup.getObjectByName('construction-floor-foundations');
assert.equal(foundationRoot?.children.length, 4, 'Shared foundation must rebuild cleanly from remaining floors after demolition');
assert.equal(foundation.remove(supportA), true);
assert.equal(constructionFloorCount, 0);
assert.equal(foundationGroup.getObjectByName('construction-floor-foundations'), undefined, 'Removing the last floor must remove its generated foundation presentation');

// Existing standable collision remains continuous across exact snapped seams.
const collision = new WorldCollisionSystem({
  heightAt: () => 0,
  baseHeightAt: () => 0,
  isPlayable: () => true
});
const floorTop = 0.04;
const floorHalfZ = PHYSICAL_LOG.floorWidth * 0.5;
const supportHalfX = PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding;
const supportHalfZ = floorHalfZ + PHYSICAL_LOG.floorSupportSeamPadding;
const addFloor = (x, z) => collision.addBox({
  x,
  z,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: floorHalfZ,
  yaw: 0,
  type: 'placed-log',
  label: `test-floor-${x}-${z}-floor`,
  bottomY: -PHYSICAL_LOG.floorUndersideDepth,
  topY: floorTop,
  standable: true,
  supportHalfX,
  supportHalfZ,
  supportY: floorTop,
  supportOverridesBase: true,
  supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
  stepHeight: 0.18
});
addFloor(snappedOriginX, snappedOriginZ);
addFloor(snappedOriginX, snappedSideZ);
addFloor(snappedLongX, snappedOriginZ);
for (const offset of [-0.025, 0, 0.025]) {
  assert.equal(collision.supportHeightAt(snappedOriginX, (snappedOriginZ + snappedSideZ) * 0.5 + offset, 0), floorTop, 'Side floor seam must remain continuously standable');
  assert.equal(collision.supportHeightAt((snappedOriginX + snappedLongX) * 0.5 + offset, snappedOriginZ, 0), floorTop, 'End floor seam must remain continuously standable');
}

// Grass and ferns share the same reversible horizontal footprint rule. Their
// natural ecology entries are retained, hidden while covered, and restored after
// the floor collider is removed.
const vegetationCollision = new WorldCollisionSystem({ heightAt: () => 0, baseHeightAt: () => 0, isPlayable: () => true });
let vegetationRevision = 0;
const vegetationAdaptation = {
  getRevision: () => vegetationRevision,
  heightAt: x => x > 1.5 ? -0.35 : 0
};
const vegetationTerrain = {
  getScatterBounds: () => ({ halfX: 0.2, halfZ: 0.2, centerZ: 0 }),
  grassDensityAt: () => 1,
  fernDensityAt: () => 1,
  heightAt: () => 0
};
const scatter = { isGrassClear: () => true };
const grass = new GrassFieldSystem({ group: new THREE.Group(), terrain: vegetationTerrain, scatter, collision: vegetationCollision, constructionTerrain: vegetationAdaptation, maxInstances: 18 });
const ferns = new FernFieldSystem({ group: new THREE.Group(), terrain: vegetationTerrain, scatter, collision: vegetationCollision, constructionTerrain: vegetationAdaptation, maxInstances: 12 });
assert.equal(grass.populate(), 18);
assert.equal(ferns.populate(), 12);
grass.update(1 / 60, { x: 2, z: 2 });
ferns.update(1 / 60, { x: 2, z: 2 });
const vegetationFloor = vegetationCollision.addBox({
  x: 0,
  z: 0,
  halfX: PHYSICAL_LOG.halfLength,
  halfZ: PHYSICAL_LOG.floorWidth * 0.5,
  yaw: 0,
  type: 'placed-log',
  label: 'built-log-77-floor',
  bottomY: -0.18,
  topY: 0.1
});
vegetationRevision += 1;
grass.update(1 / 60, { x: 2, z: 2 });
ferns.update(1 / 60, { x: 2, z: 2 });
assert.equal(grass.entries.every(entry => entry.constructionHidden), true, 'Grass inside a floor footprint must hide regardless of its original terrain height');
assert.equal(ferns.entries.every(entry => entry.constructionHidden), true, 'Ferns must use the same construction clearing boundary as grass');
assert.equal(vegetationCollision.removeObstacle(vegetationFloor), true);
vegetationRevision += 1;
grass.update(1 / 60, { x: 2, z: 2 });
ferns.update(1 / 60, { x: 2, z: 2 });
assert.equal(grass.entries.some(entry => entry.constructionHidden), false, 'Demolition must restore grass ecology entries');
assert.equal(ferns.entries.some(entry => entry.constructionHidden), false, 'Demolition must restore fern ecology entries');

const [logSource, supportSource, adaptationSource, collisionSource, grassSource, fernSource, islandSource, definitionsSource] = await Promise.all([
  readFile('src/world/PhysicalLogSystem.js', 'utf8'),
  readFile('src/world/FloorSupportVisual.js', 'utf8'),
  readFile('src/world/ConstructionTerrainAdaptationSystem.js', 'utf8'),
  readFile('src/world/WorldCollisionSystem.js', 'utf8'),
  readFile('src/world/GrassFieldSystem.js', 'utf8'),
  readFile('src/world/FernFieldSystem.js', 'utf8'),
  readFile('src/world/TestIslandSystem.js', 'utf8'),
  readFile('src/data/PhysicalLogDefinitions.js', 'utf8')
]);

for (const requirement of [
  'excludeRawOccupied: true',
  'rawKey: `beam:${anchorIds.join(\'-\')}`',
  'this.#baseTerrainHeightAt(',
  'sample.center + PHYSICAL_LOG.floorGroundClearance',
  'PHYSICAL_LOG.floorTerrainEmbedTolerance',
  'supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding',
  'supportOverridesBase: true',
  'collectLocalRoofFramePairs',
  'collectRoofRegions',
  "'roof-rafter'",
  "'roof-ridge'"
]) assert.ok(logSource.includes(requirement), `Construction runtime is missing preserved contract: ${requirement}`);

assert.ok(definitionsSource.includes('MAX_FLOOR_TERRAIN_ADAPTATION'), 'Slope placement and terrain retreat must use one shared high-side depth authority');
assert.ok(adaptationSource.includes('this.floors = new Map()'), 'Terrain adaptation must be derived from active construction footprints');
assert.ok(adaptationSource.includes('this.#adaptedHeightFrom(naturalY'), 'Construction terrain must layer over immutable natural height samples');
assert.ok(adaptationSource.includes('result = Math.min(result, candidate)'), 'Construction terrain may lower high-side relief but must never raise low-side terrain');
assert.ok(adaptationSource.includes('naturalY: Float32Array.from'), 'Terrain mesh restoration must retain an immutable per-vertex baseline');
assert.ok(adaptationSource.includes('#refreshAffectedMeshes(previous, normalized)'), 'Floor add/remove must rebuild only locally affected terrain chunks');
assert.ok(supportSource.includes("root.name = 'construction-floor-foundations'"), 'Connected floors must use one shared foundation presentation');
assert.ok(supportSource.includes('FOUNDATION_MERGE_RADIUS'), 'Foundation support candidates must merge at connected floor seams');
assert.ok(supportSource.includes('this.terrain.setConstructionFloors?.'), 'Floor lifecycle must drive terrain adaptation through an optional construction boundary');
assert.ok(supportSource.includes('this.terrain.baseHeightAt?.(x, z)'), 'Low-side foundation supports must continue sampling immutable terrain');
assert.ok(collisionSource.includes('supportOverridesBase'), 'Standable floors must retain construction surface ownership');
assert.ok(collisionSource.includes('escapingStandableEdge'), 'Existing platform edge traversal must remain intact');
assert.ok(grassSource.includes('constructionFloorCoversVegetation'), 'Vegetation-floor overlap must remain isolated from procedural terrain generation');
assert.ok(!grassSource.includes('entry.y + 0.9 < floor.bottomY'), 'Floor vegetation clearing must not depend on the pre-cut vertical position');
assert.ok(grassSource.includes('constructionTerrain?.heightAt?.'), 'Visible vegetation around a terrain cut must reproject to the reversible construction surface');
assert.ok(fernSource.includes('collision = null') && fernSource.includes('constructionTerrain = null'), 'Ferns must receive the same dynamic construction boundaries as grass');
assert.ok(islandSource.includes('new ConstructionTerrainAdaptationSystem'), 'Island composition must own one construction-local terrain adapter');
assert.ok(islandSource.includes('baseHeightAt(x, z)') && islandSource.includes('return this.terrain.heightAt(x, z)'), 'Immutable procedural height must remain separately accessible to construction/support systems');
assert.ok(islandSource.includes('constructionHeightAt(x, z)') && islandSource.includes('this.constructionTerrain.heightAt(x, z)'), 'Movement must have a construction-adjusted terrain surface without rewriting procedural generation');
assert.ok(islandSource.includes('this.constructionTerrain.captureTerrainMeshes()'), 'Terrain baseline must be captured immediately after procedural terrain creation');
assert.ok(islandSource.includes('collision: this.collision') && islandSource.includes('constructionTerrain: this.constructionTerrain'), 'Grass and ferns must share the island construction/collision boundary');

console.log('Slope floor terrain retreat, reversible ecology, coherent foundations and preserved traversal contracts verified');
