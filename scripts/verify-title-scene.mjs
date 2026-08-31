import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const titleScene = read('src/startup/TitleSceneApp.js');
const main = read('src/main.js');
const index = read('index.html');
const css = read('src/title.css');

const checks = [
  ['title scene uses production Ranger asset registry', titleScene.includes('ASSET_PATHS.ranger.model')],
  ['title scene uses Ranger idle animation pack', titleScene.includes('ASSET_PATHS.ranger.movementBasic') && titleScene.includes("clip.name === 'Idle_A'")],
  ['title scene owns procedural ship', titleScene.includes("ship.name = 'title-voyage-ship'") && titleScene.includes('#createShip()')],
  ['play starts an intro sequence', titleScene.includes("this.state = 'intro'") && titleScene.includes('INTRO_DURATION')],
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
