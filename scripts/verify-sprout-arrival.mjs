import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const titleScene = read('src/startup/TitleSceneApp.js');
const celestial = read('src/startup/TitleCelestialEvent.js');
const config = read('src/startup/TitleSceneConfig.js');
const shipwreckDoc = read('docs/SHIPWRECK_TITLE_INTRO.md');
const sproutDoc = read('docs/SPROUT_COMPANION.md');

const numberFor = key => {
  const match = new RegExp(`${key}:\\s*([0-9.]+)`).exec(config);
  return match ? Number(match[1]) : Number.NaN;
};

const checks = [
  ['title scene owns Sprout celestial presentation through a dedicated module', titleScene.includes("import { TitleCelestialEvent }") && titleScene.includes('new TitleCelestialEvent')],
  ['voyage starts calm with island-ahead status instead of immediate storm status', titleScene.includes("this.setStatus('VOYAGE · ISLAND AHEAD')") && !titleScene.includes("this.setStatus('VOYAGE · STORM RISING')")],
  ['night completes before the blue arrival flash', numberFor('nightFull') < numberFor('blueFlashAt')],
  ['blue arrival flash precedes storm danger', numberFor('blueFlashAt') < numberFor('stormStart')],
  ['shooting star appears after the blue flash', numberFor('blueFlashAt') < numberFor('shootingStarStart')],
  ['storm, severe weather and wreck impact remain ordered', numberFor('stormStart') < numberFor('severeStormStart') && numberFor('severeStormStart') < numberFor('wreckImpactStart')],
  ['celestial presentation renders stars and the incoming Sprout signal', celestial.includes("title-night-stars") && celestial.includes("title-sprout-shooting-star") && celestial.includes('shootingStarStart') && celestial.includes('shootingStarEnd')],
  ['blue flash is visually distinct from ordinary storm lightning', celestial.includes('BLUE_FLASH') && celestial.includes('flash * 10.5')],
  ['title event heads toward the island without implementing the later crash-site impact', celestial.includes('this.shootingStarEnd = new THREE.Vector3(-7, 10.5, -81)') && !celestial.includes('crater') && !celestial.includes('crashSite')],
  ['shipwreck documentation preserves the title/gameplay ownership boundary', shipwreckDoc.includes('TitleCelestialEvent') && shipwreckDoc.includes('does not create the Sprout crash site')],
  ['Sprout companion architecture documents one shared inventory', sproutDoc.includes('one authoritative shared inventory') && sproutDoc.includes('not own a second inventory')],
  ['Sprout companion architecture preserves Ranger harvesting ownership', sproutDoc.includes('Ranger performs the harvesting') && sproutDoc.includes('Sprout performs retrieval')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
