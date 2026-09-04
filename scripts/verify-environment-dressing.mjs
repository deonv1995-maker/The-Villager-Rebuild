import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [scatterSource, islandSource, coastalDefinitions, coastalSystem, titleBackdrop] = await Promise.all([
  readFile('src/world/EnvironmentScatterSystem.js', 'utf8'),
  readFile('src/world/TestIslandSystem.js', 'utf8'),
  readFile('src/data/CoastalRockDefinitions.js', 'utf8'),
  readFile('src/world/CoastalRockSystem.js', 'utf8'),
  readFile('src/startup/TitleIslandBackdrop.js', 'utf8')
]);

assert.equal(
  scatterSource.includes('ASSET_PATHS.cliffs.large'),
  false,
  'Oversized Kenney cliff_large_rock dressing must not be loaded into the playable island'
);
assert.equal(
  scatterSource.includes('terrain-face-dressing-'),
  false,
  'Removed broad cliff-face dressing must not be spawned or registered for collision'
);
assert.equal(
  scatterSource.includes('ASSET_PATHS.cliffs.rock'),
  false,
  'Grass-topped Kenney rock_largeA platforms must not be loaded into the playable island'
);
assert.equal(
  scatterSource.includes('rockTemplates'),
  false,
  'Forest rock scatter must not alternate back to the removed Kenney terrain-platform asset'
);
assert.equal(
  scatterSource.includes('ASSET_PATHS.forest.rock'),
  true,
  'KayKit natural forest-rock dressing should remain enabled'
);
assert.equal(
  islandSource.includes("object.name.startsWith('terrain-face-dressing-')"),
  false,
  'World chunk adoption must not retain the removed broad cliff-dressing layer'
);

assert.equal(
  scatterSource.includes('addCoastalRockFormations'),
  true,
  'Playable island environment scatter should add the shared coastal formations'
);
assert.equal(
  coastalSystem.includes('COASTAL_ROCK_FORMATIONS'),
  true,
  'Coastal rock placement must consume one shared authored formation definition set'
);
assert.equal(
  coastalSystem.includes('terrain.coastRadiusAt(angle)'),
  true,
  'Coastal formations must resolve from the authoritative procedural coastline'
);
assert.equal(
  coastalSystem.includes('terrain.heightAt(x, z) <= terrain.waterLevel + MAX_EMERGED_TERRAIN'),
  true,
  'Coastal formations must move outward until they resolve over water'
);
assert.equal(
  coastalSystem.includes('collision.addObstacle'),
  false,
  'Offshore silhouette rocks must not introduce collision into the Day-1 arrival route'
);
assert.equal(
  coastalSystem.includes('RockHarvestSystem'),
  false,
  'Offshore silhouette rocks must remain separate from harvestable inland rocks'
);
assert.equal(
  islandSource.includes("object.name.startsWith('coastal-rock-')"),
  true,
  'Playable coastal formations should participate in world chunk visibility management'
);

const formationCount = (coastalDefinitions.match(/formation\(\{/g) ?? []).length;
assert.ok(
  formationCount >= 16,
  `Expected a substantial island-perimeter coastal formation set, found ${formationCount}`
);
assert.equal(
  coastalDefinitions.includes("id: 'wreck-west-inner'") && coastalDefinitions.includes("id: 'wreck-east-inner'"),
  true,
  'Shared definitions should include authored rocks flanking the shipwreck approach'
);
assert.equal(
  coastalDefinitions.includes("id: 'west-breaker-mid'") && coastalDefinitions.includes("id: 'north-east-spire'"),
  true,
  'Shared definitions should also dress the broader island perimeter'
);

assert.equal(
  titleBackdrop.includes('ASSET_PATHS.forest.rock') && titleBackdrop.includes('addCoastalRockFormations'),
  true,
  'Title shipwreck island should reuse the same KayKit rock asset and coastal placement system'
);
assert.equal(
  titleBackdrop.includes("namePrefix: 'title-coastal-rock'") && titleBackdrop.includes('localizeTerrainCenterZ: true'),
  true,
  'Title coastal formations should be clearly named and mapped into title-island local coordinates'
);
assert.equal(
  titleBackdrop.includes('export function createTitleIslandBackdrop()'),
  true,
  'Adding title coastal rocks must preserve the existing synchronous title backdrop API'
);

console.log(`environment dressing contracts verified · ${formationCount} shared coastal rock formations`);
