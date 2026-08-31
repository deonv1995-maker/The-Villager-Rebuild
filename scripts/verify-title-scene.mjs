import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const titleScene = read('src/startup/TitleSceneApp.js');
const islandBackdrop = read('src/startup/TitleIslandBackdrop.js');
const shipVisual = read('src/startup/TitleShipVisual.js');
const stormSystem = read('src/startup/TitleStormSystem.js');
const config = read('src/startup/TitleSceneConfig.js');
const main = read('src/main.js');
const index = read('index.html');
const css = read('src/title.css');

const checks = [
  ['title scene uses production Ranger asset registry', titleScene.includes('ASSET_PATHS.ranger.model')],
  ['title scene uses Ranger idle animation pack', titleScene.includes('ASSET_PATHS.ranger.movementBasic') && titleScene.includes("clip.name === 'Idle_A'")],
  ['Ranger uses a ship-balance presentation rig', titleScene.includes("title-ranger-balance-rig") && titleScene.includes('this.scene.attach(this.rangerRig)')],
  ['title island samples the playable terrain source of truth', islandBackdrop.includes('ExpandedIslandTerrainSystem') && islandBackdrop.includes("title-island-playable-profile")],
  ['title ship has a pointed hull and bowsprit', shipVisual.includes("title-ship-pointed-hull") && shipVisual.includes('bowsprit')],
  ['storm system owns rain and bow spray', stormSystem.includes("title-storm-rain") && stormSystem.includes("title-bow-spray")],
  ['storm system recalculates ocean normals for visible waves', stormSystem.includes('computeVertexNormals()') && stormSystem.includes('1.52')],
  ['storm system includes lightning and foam impact feedback', stormSystem.includes('pulseAt') && stormSystem.includes('wreckFoam') && stormSystem.includes('triggerRangerSplash')],
  ['title scene centralizes voyage scale and timing', config.includes('introDuration') && config.includes('oceanY') && config.includes('islandHorizontalScale')],
  ['play starts an intro sequence', titleScene.includes("this.state = 'intro'") && titleScene.includes('TITLE_SCENE.introDuration')],
  ['intro hands off through callback', titleScene.includes('void this.onPlay?.()')],
  ['main boots title before gameplay', main.includes('new TitleSceneApp') && main.includes('onPlay: () => bootGameplay(titleScene)') && main.includes('async function bootGameplay')],
  ['gameplay still uses existing GameApp', main.includes("import { GameApp } from './core/GameApp.js';")],
  ['title stylesheet is linked', index.includes('./src/title.css')],
  ['title UI is mobile safe-area aware', css.includes('safe-area-inset-top') && css.includes('@media (orientation: landscape)')],
  ['game HUD is hidden only during title scene', css.includes('body.title-scene-active .mobile-hud')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
