import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const titleScene = read('src/startup/TitleSceneApp.js');
const titleHero = read('src/startup/TitleHeroPresentation.js');
const appearanceBoundary = read('src/player/RangerAppearancePresentation.js');
const manifest = read('public/manifest.webmanifest');
const iconGenerator = read('scripts/generate-pwa-icons.mjs');
const iconSvg = read('public/icons/icon.svg');
const maskableSvg = read('public/icons/icon-maskable.svg');
const titleDoc = read('docs/HERO_M_TITLE_PRESENTATION.md');
const iconDoc = read('docs/HERO_M_LAUNCHER_ICON.md');

const checks = [
  [
    'title scene resolves its visible character through the shared production presentation boundary',
    titleScene.includes("import { TitleHeroPresentation } from './TitleHeroPresentation.js';")
      && titleScene.includes('new TitleHeroPresentation({')
      && titleScene.includes('await this.titleHeroPresentation.readyPromise')
  ],
  [
    'title Hero adapter follows RangerAppearancePresentation instead of selecting a separate body',
    titleHero.includes("import { RangerAppearancePresentation } from '../player/RangerAppearancePresentation.js';")
      && titleHero.includes('new RangerAppearancePresentation({ player: this.player })')
      && !titleHero.includes("from '../player/HeroMPresentation.js'")
  ],
  [
    'shared appearance boundary still resolves to the final Hero M presentation layer',
    appearanceBoundary.includes('HeroMArmMotionPresentation as RangerAppearancePresentation')
  ],
  [
    'KayKit remains a hidden title animation driver while Hero M receives the sampled pose',
    titleScene.includes("this.ranger.name = 'title-kaykit-animation-driver'")
      && titleScene.includes('this.mixer?.update(dt)')
      && titleScene.includes('this.titleHeroPresentation?.update(dt)')
      && titleHero.includes("assetMode: 'kaykit'")
  ],
  [
    'title pose driver stays model-local while the deck rig owns facing',
    titleScene.includes('this.ranger.rotation.set(0, 0, 0)')
      && titleScene.includes('this.rangerRig.rotation.y = RANGER_DECK_MODEL_YAW')
      && titleScene.includes('RANGER_DECK_MODEL_YAW + Math.sin')
  ],
  [
    'shipwreck jump keeps KayKit timing but updates the visible Hero M state',
    titleScene.includes("clip.name === 'Jump_Full_Short'")
      && titleScene.includes("this.titleHeroPresentation?.setAnimationState('Jump_Full_Short')")
      && titleScene.includes('this.storm?.triggerRangerSplash(this.rangerRig.position)')
  ],
  [
    'title loading identity names Hero M rather than the retired visible Ranger',
    titleScene.includes("this.setStatus('VOYAGE · LOADING HERO M')")
      && !titleScene.includes("this.setStatus('VOYAGE · LOADING RANGER')")
  ],
  [
    'launcher generator derives artwork from all three production Hero M asset segments',
    iconGenerator.includes('hero_m.glb.gz.part0.b64')
      && iconGenerator.includes('hero_m.glb.gz.part1.b64')
      && iconGenerator.includes('hero_m.glb.gz.part2.b64')
      && iconGenerator.includes('parseHeroMGlb')
      && iconGenerator.includes('collectTriangles')
      && iconGenerator.includes('renderHeroM')
      && !iconGenerator.includes('RANGER_DATA_B64')
  ],
  [
    'manifest exposes only revisioned Hero M install aliases',
    manifest.includes('hero-m-install-192-v1.png')
      && manifest.includes('hero-m-install-512-v1.png')
      && manifest.includes('hero-m-install-maskable-512-v1.png')
      && !manifest.includes('ranger-install-')
  ],
  [
    'repository SVG identity markers no longer identify the old Ranger artwork',
    iconSvg.includes('hero-m-runtime-derived-v1')
      && maskableSvg.includes('hero-m-runtime-derived-v1-maskable')
      && !iconSvg.includes('ranger-v1')
      && !maskableSvg.includes('ranger-v1')
  ],
  [
    'Hero M title and launcher architecture decisions are documented',
    titleDoc.includes('same player-facing presentation boundary as gameplay')
      && iconDoc.includes('same compact Hero M runtime GLB')
  ]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
