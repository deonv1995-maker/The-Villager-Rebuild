import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [scatterSource, islandSource] = await Promise.all([
  readFile('src/world/EnvironmentScatterSystem.js', 'utf8'),
  readFile('src/world/TestIslandSystem.js', 'utf8')
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
  true,
  'Natural rock dressing should remain available after broad cliff removal'
);
assert.equal(
  islandSource.includes("object.name.startsWith('terrain-face-dressing-')"),
  false,
  'World chunk adoption must not retain the removed broad cliff-dressing layer'
);

console.log('environment dressing contracts verified');
