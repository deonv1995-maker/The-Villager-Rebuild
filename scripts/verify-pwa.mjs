import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const shellRevision = `${expectedVersion}-install3`;

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
if (manifest.name !== 'The Villager' || manifest.short_name !== 'The Villager') {
  throw new Error('PWA identity must remain The Villager');
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
const icon192 = icons.find(icon => icon.src === `./icons/icon-192.png?v=${shellRevision}`);
const icon512 = icons.find(icon => icon.src === `./icons/icon-512.png?v=${shellRevision}`);
const maskable512 = icons.find(icon => icon.src === `./icons/icon-maskable-512.png?v=${shellRevision}`);
if (icon192?.sizes !== '192x192' || icon192?.type !== 'image/png' || icon192?.purpose !== 'any') {
  throw new Error('Chrome install contract requires an explicit 192x192 PNG app icon');
}
if (icon512?.sizes !== '512x512' || icon512?.type !== 'image/png' || icon512?.purpose !== 'any') {
  throw new Error('Chrome install contract requires an explicit 512x512 PNG app icon');
}
if (maskable512?.sizes !== '512x512' || maskable512?.type !== 'image/png' || maskable512?.purpose !== 'maskable') {
  throw new Error('Android shell requires a 512x512 maskable PNG icon');
}
await verifyPng('icons/icon-192.png', 192);
await verifyPng('icons/icon-512.png', 512);
await verifyPng('icons/icon-maskable-512.png', 512);
await verifySvg('icons/icon.svg');
await verifySvg('icons/icon-maskable.svg');
await requireFile('.nojekyll', true);

const pwaShellPath = await requireFile('pwa-shell.js');
const pwaShell = await readFile(pwaShellPath, 'utf8');
if (!pwaShell.includes("addEventListener('beforeinstallprompt'") || !pwaShell.includes('event.preventDefault()')) {
  throw new Error('PWA shell must capture Chrome beforeinstallprompt before gameplay loads');
}
if (!pwaShell.includes(`./sw.js?v=${shellRevision}`) || !pwaShell.includes('navigator.serviceWorker.ready')) {
  throw new Error('PWA shell must register and await the current service worker before gameplay bootstrap');
}

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes("addEventListener('fetch'") || !serviceWorker.includes("cache: 'no-store'")) {
  throw new Error('Service worker must keep the exact game/module graph network-fresh');
}
if (!serviceWorker.includes(shellRevision)) {
  throw new Error(`Service worker shell revision must match ${shellRevision}`);
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
const shellRef = `./pwa-shell.js?v=${shellRevision}`;
const manifestRef = `./manifest.webmanifest?v=${shellRevision}`;
const iconRef = `./icons/icon-192.png?v=${shellRevision}`;
if (!index.includes(manifestRef)) throw new Error('Built index is not linked to the current PWA manifest revision');
if (!index.includes(shellRef)) throw new Error('Built index is missing the early PWA bootstrap');
if (!index.includes('mobile-web-app-capable')) throw new Error('Built index is missing Android mobile-app metadata');
if (!index.includes(iconRef)) throw new Error('Built index must expose the raster Villager icon to Chrome');
const shellPosition = index.indexOf(shellRef);
const manifestPosition = index.indexOf(manifestRef);
const gameModulePosition = index.indexOf('type="module"');
if (shellPosition < 0 || manifestPosition < 0 || gameModulePosition < 0 || shellPosition > manifestPosition || shellPosition > gameModulePosition) {
  throw new Error('PWA bootstrap must load before the manifest install evaluation and production gameplay module');
}
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

console.log(`PWA install contract verified in ${root} for ${shellRevision}`);
