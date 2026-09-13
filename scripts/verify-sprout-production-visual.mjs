import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const main = read('src/main.js');
const asset = read('src/rendering/SproutVisualAsset.js');
const runtime = read('src/gameplay/SproutVisualRuntimeController.js');
const arrival = read('src/gameplay/SproutArrivalController.js');
const crashSite = read('src/world/SproutCrashSiteSystem.js');
const companion = read('src/gameplay/SproutCompanionController.js');
const docs = read('docs/SPROUT_VISUAL_ASSET.md');
const packageJson = JSON.parse(read('package.json'));

const arrivalIndex = main.indexOf('new SproutArrivalController({');
const visualIndex = main.indexOf('new SproutVisualRuntimeController({ game })');
const companionIndex = main.indexOf('new SproutCompanionController({ game })');

const checks = [
  ['main boots the production visual runtime between story creation and companion ownership', arrivalIndex >= 0 && visualIndex > arrivalIndex && companionIndex > visualIndex],
  ['production Sprout visual is an isolated rendering asset factory', asset.includes('export function createSproutVisual()') && asset.includes("root.name = 'sprout-production-companion'") && asset.includes('sproutProductionVisual = true')],
  ['visual version 4 keeps the authored 75 percent presentation scale while strengthening motion readability', asset.includes('root.userData.visualVersion = 4') && asset.includes('const PRESENTATION_SCALE = 0.75') && asset.includes('root.userData.presentationScale = PRESENTATION_SCALE') && asset.includes('const MOTION = Object.freeze({')],
  ['visual matches the approved cream green orange cyan spherical design language', asset.includes('shell: 0xe7e1cf') && asset.includes('green: 0x365d46') && asset.includes('orange: 0xd8833d') && asset.includes('cyan: 0x67d7f0') && asset.includes("name: 'sprout-spherical-shell'")],
  ['face is nested through shell frame liner and rounded screen instead of one detached slab', asset.includes("name: 'sprout-face-frame'") && asset.includes("name: 'sprout-face-liner'") && asset.includes("name: 'sprout-face-screen'") && asset.includes('new RoundedBoxGeometry(0.635, 0.375, 0.04, 4, 0.105)')],
  ['visual includes expressive arc eyes, mouth, twin leaf fins and concept 02 accent', asset.includes("new THREE.TorusGeometry(0.064, 0.017, 6, 12, Math.PI)") && asset.includes("name: 'sprout-eye-left'") && asset.includes("name: 'sprout-eye-right'") && asset.includes("name: 'sprout-expression-mouth'") && asset.includes("name: 'sprout-leaf-fin-left'") && asset.includes("name: 'sprout-leaf-fin-right'") && asset.includes("name: 'sprout-fin-02-mark'")],
  ['scanner is a visible front-quarter mounted module instead of a side-facing hidden lens', asset.includes("scannerMount.name = 'sprout-scanner-mount'") && asset.includes('scannerMount.position.set(-0.36, 0.33, 0.31)') && asset.includes("name: 'sprout-scanning-lens'") && asset.includes("name: 'sprout-scanner-hinge'")],
  ['visual includes helper arms, lamp, multi-tool, back module and layered hover system', asset.includes("'sprout-left-helper-arm'") && asset.includes("'sprout-right-helper-arm'") && asset.includes("name: 'sprout-utility-lamp'") && asset.includes("name: 'sprout-multitool-palm'") && asset.includes("name: 'sprout-removable-back-module'") && asset.includes("name: 'sprout-antigrav-ring'") && asset.includes("name: 'sprout-antigrav-inner-ring'")],
  ['stronger body bob stays presentation-only behind an internal motion root', asset.includes("motionRoot.name = 'sprout-presentation-motion-root'") && asset.includes('root.userData.motionRoot = motionRoot') && asset.includes('bodyBobAmplitude: 0.085') && asset.includes('motionRoot.position.y =')],
  ['helper arms retain delayed inertia with larger readable swing and bob amplitudes', asset.includes('armSwingAmplitude: 0.085') && asset.includes('armBobAmplitude: 0.052') && asset.includes('leftArm.position.y = (leftArm.userData.baseY ?? -0.02)') && asset.includes('rightArm.position.y = (rightArm.userData.baseY ?? -0.02)') && asset.includes('elapsed * 2.05 - 0.56') && asset.includes('elapsed * 2.05 - 0.74')],
  ['three stabilizer assemblies and hover rings receive stronger smooth asynchronous motion', asset.includes('podPrimaryAmplitude: 0.058') && asset.includes('podSecondaryAmplitude: 0.024') && asset.includes('ringBobAmplitude: 0.042') && asset.includes('innerRingBobAmplitude: 0.034') && asset.includes('const stabilizerPods = []') && asset.includes('const irregular = Math.sin')],
  ['top fins and hover assembly gain readable secondary sway without new gameplay authority', asset.includes('finSwingAmplitude: 0.075') && asset.includes('hoverSpinSpeed: 0.62') && asset.includes('hoverAssembly.rotation.z =') && asset.includes('finLeft.rotation.x =') && asset.includes('finRight.rotation.x =')],
  ['visual animation exposes powered/scanning expression states without gameplay authority', asset.includes('export function updateSproutVisual') && asset.includes('powered = true') && asset.includes('scanning = false') && asset.includes('eyeLeft.rotation.z = scanning ? 0.08 : 0') && !asset.includes('inventory') && !asset.includes('gatherables') && !asset.includes('collision')],
  ['runtime replaces only the fallback presentation while preserving transform then applying authored visual scale', runtime.includes('production.position.copy(existing.position)') && runtime.includes('production.quaternion.copy(existing.quaternion)') && runtime.includes('production.scale.copy(existing.scale).multiplyScalar(production.userData.presentationScale ?? 1)') && runtime.includes('production.visible = existing.visible') && runtime.includes('disposeFallbackPresentation(existing)')],
  ['runtime guarantees production presentation before allegiance claim', runtime.includes('#wrapCompanionClaim()') && runtime.includes('this.#ensureInstalled();') && runtime.includes('this.originalClaim()') && runtime.includes("presentation.name = 'sprout-production-companion'")],
  ['runtime leaves gameplay authorities outside the production visual boundary', !runtime.includes('inventory.add') && !runtime.includes('inventory.consume') && !runtime.includes('reserveLooseResource') && !runtime.includes('treeHarvest') && !runtime.includes('collision.resolveMove')],
  ['existing crash-site fallback remains a safe construction fallback until production replacement installs', crashSite.includes("root.name = 'sprout-placeholder-companion'") && crashSite.includes('this.sprout = this.#createSproutPlaceholder()')],
  ['story still transfers one crash-site actor rather than spawning a second companion', arrival.includes('this.crashSite.scene.attach(sprout)') && arrival.includes('this.crashSite.sprout = null') && companion.includes('claimCompanionPresentation?.()')],
  ['documentation records production status, concept-reference refinement, mobile budget and readable v4 motion', docs.includes('production visual active') && docs.includes('approved hovering spherical concept') && docs.includes('Refinement pass (visual version 4)') && docs.includes('presentation-only motion root') && docs.includes('Mobile budget') && docs.includes('Third-party license dependency: none')],
  ['full repository check includes production Sprout visual regression', packageJson.scripts.check.includes('npm run verify:sprout-visual')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failed > 0) process.exitCode = 1;
else console.log(`Sprout production visual regression checks passed (${checks.length} contracts).`);
