import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const shellRevision = `${expectedVersion}-install7`;

async function requireFile(relativePath, allowEmpty = false) {
  const filePath = path.join(root, relativePath);
  const info = await stat(filePath);
  if (!info.isFile() || (!allowEmpty && info.size === 0)) throw new Error(`Missing PWA file: ${filePath}`);
  return filePath;
}

async function verifySvg(relativePath) {
  const filePath = await requireFile(relativePath);
  const source = await readFile(filePath, 'utf8');
  if (!source.includes('<svg') || !source.includes('viewBox="0 0 512 512"')) {
    throw new Error(`${filePath}: invalid Villager SVG icon`);
  }
}

async function verifyPng(relativePath, expectedSize) {
  const filePath = await requireFile(relativePath);
  const data = await readFile(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) {
    throw new Error(`${filePath}: invalid PNG signature`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(`${filePath}: expected ${expectedSize}x${expectedSize}, got ${width}x${height}`);
  }
}

const manifestPath = await requireFile('manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.name !== 'The Villager' || manifest.short_name !== 'Villager') {
  throw new Error('PWA identity must match the proven archived Villager manifest');
}
if (manifest.display !== 'fullscreen') throw new Error('PWA manifest must use fullscreen display mode');
if (!Array.isArray(manifest.display_override) || !manifest.display_override.includes('standalone')) {
  throw new Error('PWA manifest must keep standalone fallback');
}
if (manifest.orientation !== 'landscape') throw new Error('PWA manifest must prefer landscape orientation');
if (manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('PWA start_url and scope must remain relative for GitHub Pages hosting');
}
if (manifest.prefer_related_applications !== false) {
  throw new Error('PWA manifest must not prefer a native related application');
}

const icons = manifest.icons ?? [];
const icon192 = icons.find(icon => icon.src === 'icons/icon-192.png');
const icon512 = icons.find(icon => icon.src === 'icons/icon-512.png');
const maskable512 = icons.find(icon => icon.src === 'icons/icon-maskable-512.png');
const normalSvg = icons.find(icon => icon.src === 'icons/icon.svg');
const maskableSvg = icons.find(icon => icon.src === 'icons/icon-maskable.svg');
if (icon192?.sizes !== '192x192' || icon192?.type !== 'image/png' || icon192?.purpose !== 'any') {
  throw new Error('Chrome install contract requires an explicit 192x192 PNG app icon');
}
if (icon512?.sizes !== '512x512' || icon512?.type !== 'image/png' || icon512?.purpose !== 'any') {
  throw new Error('Chrome install contract requires an explicit 512x512 PNG app icon');
}
if (maskable512?.sizes !== '512x512' || maskable512?.type !== 'image/png' || maskable512?.purpose !== 'maskable') {
  throw new Error('Android shell requires a 512x512 maskable PNG icon');
}
if (normalSvg?.sizes !== 'any' || normalSvg?.type !== 'image/svg+xml' || normalSvg?.purpose !== 'any') {
  throw new Error('Archived Villager SVG app icon must remain available');
}
if (maskableSvg?.sizes !== 'any' || maskableSvg?.type !== 'image/svg+xml' || maskableSvg?.purpose !== 'maskable') {
  throw new Error('Archived Villager maskable SVG icon must remain available');
}
await verifyPng('icons/icon-192.png', 192);
await verifyPng('icons/icon-512.png', 512);
await verifyPng('icons/icon-maskable-512.png', 512);
await verifySvg('icons/icon.svg');
await verifySvg('icons/icon-maskable.svg');
await requireFile('.nojekyll', true);

const installScriptPath = await requireFile('pwa-install.js');
const installScript = await readFile(installScriptPath, 'utf8');
for (const requirement of ['beforeinstallprompt', 'event.preventDefault()', 'prompt.prompt()', 'appinstalled', 'display-mode: standalone']) {
  if (!installScript.includes(requirement)) {
    throw new Error(`In-game install controller is missing required behavior: ${requirement}`);
  }
}
await requireFile('pwa-install.css');

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes(`SHELL_VERSION = '${shellRevision}'`)) {
  throw new Error(`Service worker shell revision must match ${shellRevision}`);
}
for (const shellAsset of ['./pwa-install.js', './pwa-install.css']) {
  if (!serviceWorker.includes(`'${shellAsset}'`)) {
    throw new Error(`Service worker must include ${shellAsset} in the install shell`);
  }
}
if (!serviceWorker.includes('cache.addAll(SHELL_ASSETS)')) {
  throw new Error('Service worker must pre-cache the install shell');
}
if (!serviceWorker.includes("request.mode === 'navigate'")) {
  throw new Error('Service worker must provide a cached navigation fallback for the install shell');
}
if (!serviceWorker.includes("cache: 'no-store'")) {
  throw new Error('Gameplay/runtime requests must remain network-fresh');
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
const manifestRef = `./manifest.webmanifest?v=${shellRevision}`;
const workerRef = `./sw.js?v=${shellRevision}`;
const installScriptRef = `./pwa-install.js?v=${shellRevision}`;
const installStyleRef = `./pwa-install.css?v=${shellRevision}`;
if (!index.includes(manifestRef)) throw new Error('Built index is not linked to the current PWA manifest revision');
if (!index.includes(workerRef)) throw new Error('Built index is not registering the current service worker revision');
if (!index.includes(installScriptRef)) throw new Error('Built index is missing the in-game install controller');
if (!index.includes(installStyleRef)) throw new Error('Built index is missing the in-game install styles');
if (!index.includes('id="install-app-button"')) throw new Error('Built index is missing the Install App button');
if (!index.includes('id="install-app-status"')) throw new Error('Built index is missing install status feedback');
if (!index.includes("scope: './'")) throw new Error('Service worker registration must keep explicit relative scope');
if (!index.includes('registration.update()')) throw new Error('Service worker registration must request the current shell update');
if (!index.includes('mobile-web-app-capable')) throw new Error('Built index is missing Android mobile-app metadata');
if (!index.includes(`./icons/icon.svg?v=${shellRevision}`)) throw new Error('Built index must expose the canonical Villager icon to Chrome');
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

console.log(`Villager PWA install contract verified in ${root} for ${shellRevision}`);
