import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readBinary = path => readFileSync(new URL(`../${path}`, import.meta.url));
const readGlbAnimationNames = path => {
  const buffer = readBinary(path);
  if (buffer.toString('utf8', 0, 4) !== 'glTF') return [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(buffer.toString('utf8', chunkStart, chunkStart + chunkLength).replace(/\u0000+$/g, '').trim());
      return (json.animations ?? []).map(animation => animation?.name).filter(Boolean);
    }
    offset = chunkStart + chunkLength;
  }
  return [];
};

const titleScene = read('src/startup/TitleSceneApp.js');
const islandBackdrop = read('src/startup/TitleIslandBackdrop.js');
const shipVisual = read('src/startup/TitleShipVisual.js');
const stormSystem = read('src/startup/TitleStormSystem.js');
const arrivalIntro = read('src/startup/BeachArrivalIntroController.js');
const rangerController = read('src/player/RangerController.js');
const config = read('src/startup/TitleSceneConfig.js');
const main = read('src/main.js');
const index = read('index.html');
const css = read('src/title.css');
const movementAnimations = readGlbAnimationNames('public/assets/kaykit/animations/Rig_Medium_MovementBasic.glb');

console.log(`INFO KayKit movement animations: ${movementAnimations.join(', ')}`);

const checks = [
  ['title scene uses production Ranger asset registry', titleScene.includes('ASSET_PATHS.ranger.model')],
  ['title scene uses Ranger idle animation pack', titleScene.includes('ASSET_PATHS.ranger.movementBasic') && titleScene.includes("clip.name === 'Idle_A'")],
  ['Ranger uses a ship-balance presentation rig', titleScene.includes('title-ranger-balance-rig') && titleScene.includes('this.scene.attach(this.rangerRig)')],
  ['Ranger title arms are no longer blended toward the model bind pose', !titleScene.includes('TITLE_ARM_BONES') && !titleScene.includes('#applyRangerArmRestPose') && !config.includes('rangerArmRestBlend')],
  ['Ranger deck presentation includes body sway', titleScene.includes('rangerDeckSway') && titleScene.includes('footShift')],
  ['title island samples the playable terrain source of truth', islandBackdrop.includes('ExpandedIslandTerrainSystem') && islandBackdrop.includes('title-island-playable-profile')],
  ['title ship has a pointed hull and bowsprit', shipVisual.includes('title-ship-pointed-hull') && shipVisual.includes('bowsprit')],
  ['title ship closes bow deck and renders hull surfaces double-sided', shipVisual.includes('title-ship-solid-bow-deck') && shipVisual.includes('side: THREE.DoubleSide')],
  ['title ship has an internal water occluder', shipVisual.includes('title-ship-water-occluder') && shipVisual.includes('waterOccluder')],
  ['title ship has additional hull strakes and keel detail', shipVisual.includes('createHullStrake') && shipVisual.includes('keel')],
  ['title rigging uses flexible segmented lines rather than rigid rope cylinders', shipVisual.includes('createFlexibleRope') && shipVisual.includes('new THREE.Line') && shipVisual.includes('updateFlexibleRope')],
  ['title sail is ship-owned cloth instead of a rigid child of the falling mast', shipVisual.includes("sailMesh.name = 'title-flexing-sail'") && shipVisual.includes('ship.add(sailMesh)') && !shipVisual.includes('mastUpperPivot.add(sailMesh)')],
  ['title sail deforms between moving yard anchors and lower sheet anchors', shipVisual.includes('updateSailCloth') && shipVisual.includes('mastUpperPivot.localToWorld') && shipVisual.includes('bottomLeft.set') && shipVisual.includes('bottomRight.set')],
  ['mast fracture uses a separate upper pivot and visible splinter groups', shipVisual.includes('title-mast-broken-upper-pivot') && shipVisual.includes('title-mast-lower-splinters') && shipVisual.includes('title-mast-upper-splinters') && titleScene.includes('mastUpperPivot.rotation')],
  ['storm system owns rain and bow spray', stormSystem.includes('title-storm-rain') && stormSystem.includes('title-bow-spray')],
  ['storm system recalculates ocean normals for visible waves', stormSystem.includes('computeVertexNormals()') && stormSystem.includes('stormWaveAmplitudeMax')],
  ['storm wave motion is centrally tuned below the previous aggressive amplitude', config.includes('stormWaveAmplitudeMax: 1.16') && config.includes('stormWaveSpeedBoost: 1.3')],
  ['storm system includes lightning and foam impact feedback', stormSystem.includes('pulseAt') && stormSystem.includes('wreckFoam') && stormSystem.includes('triggerRangerSplash')],
  ['title scene centralizes voyage scale and timing', config.includes('introDuration') && config.includes('oceanY') && config.includes('islandHorizontalScale')],
  ['play starts an intro sequence', titleScene.includes("this.state = 'intro'") && titleScene.includes('TITLE_SCENE.introDuration')],
  ['intro hands off through callback', titleScene.includes('void this.onPlay?.()')],
  ['Ranger exposes an exclusive cinematic-control boundary', rangerController.includes('beginCinematic(driver)') && rangerController.includes('endCinematic(driver)') && rangerController.includes('setCinematicPose') && rangerController.includes('playCinematicAnimation')],
  ['arrival intro owns prone crawl rise dust and settle phases', arrivalIntro.includes("PRONE: 'prone'") && arrivalIntro.includes("CRAWL: 'crawl'") && arrivalIntro.includes("RISE: 'rise'") && arrivalIntro.includes("DUST: 'dust'") && arrivalIntro.includes("SETTLE: 'settle'")],
  ['arrival intro begins and releases Ranger cinematic ownership', arrivalIntro.includes('this.player.beginCinematic(this)') && arrivalIntro.includes('this.player.endCinematic(this)')],
  ['arrival intro derives wet sand from the current island and water level', arrivalIntro.includes('#findWetSandStart') && arrivalIntro.includes('waterLevel') && arrivalIntro.includes('isPlayable')],
  ['arrival starts Ranger face-down rather than on his back', arrivalIntro.includes('modelPitch: 1.48') && !arrivalIntro.includes('modelPitch: -1.48')],
  ['arrival crawl is deliberately slow and ends at the authoritative spawn', arrivalIntro.includes('[PHASE.CRAWL]: 6.0') && arrivalIntro.includes('this.crawlEnd = { ...this.spawn }')],
  ['arrival crawl handles native and fallback animation orientation separately', arrivalIntro.includes('nativeCrawlAnimation') && arrivalIntro.includes("['Walking_A']") && arrivalIntro.includes('fallbackPitch')],
  ['main boots title before gameplay', main.includes('new TitleSceneApp') && main.includes('onPlay: () => bootGameplay(titleScene)') && main.includes('async function bootGameplay')],
  ['main starts beach arrival after existing gameplay systems load', main.includes('new BeachArrivalIntroController') && main.includes('arrivalIntro.start()') && main.includes('window.__villager = game')],
  ['gameplay still uses existing GameApp', main.includes("import { GameApp } from './core/GameApp.js';")],
  ['title stylesheet is linked', index.includes('./src/title.css')],
  ['title UI is mobile safe-area aware', css.includes('safe-area-inset-top') && css.includes('@media (orientation: landscape)')],
  ['game HUD remains hidden through the arrival cinematic', css.includes('body.title-scene-active .mobile-hud') && css.includes('body.arrival-intro-active .mobile-hud')],
  ['game HUD fades in when arrival control is released', css.includes('body.arrival-intro-revealing .mobile-hud') && css.includes('transition: opacity 880ms ease')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
