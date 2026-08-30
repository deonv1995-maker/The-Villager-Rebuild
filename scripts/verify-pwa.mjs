import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;

async function requireFile(relativePath, allowEmpty = false) {
  const filePath = path.join(root, relativePath);
  const info = await stat(filePath);
  if (!info.isFile() || (!allowEmpty && info.size === 0)) throw new Error(`Missing PWA file: ${filePath}`);
  return filePath;
}

async function requireMissing(relativePath) {
  const filePath = path.join(root, relativePath);
  try {
    await stat(filePath);
    throw new Error(`Legacy install file must not be emitted: ${filePath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
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
  throw new Error('PWA identity must remain The Villager / Villager');
}
if (manifest.id !== './' || manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('PWA id, start_url and scope must resolve from the GitHub Pages project root');
}
if (manifest.display !== 'fullscreen') throw new Error('PWA manifest must use fullscreen display mode');
if (manifest.orientation !== 'landscape') throw new Error('PWA manifest must prefer landscape orientation');

const icons = manifest.icons ?? [];
if (icons.length !== 3) throw new Error('PWA manifest must expose exactly the three canonical Ranger launcher icons');
const icon192 = icons.find(icon => icon.src === 'icons/ranger-192.png');
const icon512 = icons.find(icon => icon.src === 'icons/ranger-512.png');
const maskable512 = icons.find(icon => icon.src === 'icons/ranger-maskable-512.png');
if (icon192?.sizes !== '192x192' || icon192?.type !== 'image/png' || icon192?.purpose !== 'any') {
  throw new Error('Chrome install contract requires the 192x192 Ranger PNG icon');
}
if (icon512?.sizes !== '512x512' || icon512?.type !== 'image/png' || icon512?.purpose !== 'any') {
  throw new Error('Chrome install contract requires the 512x512 Ranger PNG icon');
}
if (maskable512?.sizes !== '512x512' || maskable512?.type !== 'image/png' || maskable512?.purpose !== 'maskable') {
  throw new Error('Android WebAPK install contract requires the 512x512 maskable Ranger PNG icon');
}
await verifyPng('icons/ranger-192.png', 192);
await verifyPng('icons/ranger-512.png', 512);
await verifyPng('icons/ranger-maskable-512.png', 512);
await requireFile('.nojekyll', true);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
for (const requirement of ["self.addEventListener('install'", "self.addEventListener('activate'", "self.addEventListener('fetch'", 'self.skipWaiting()', 'self.clients.claim()', 'fetch(request)']) {
  if (!serviceWorker.includes(requirement)) {
    throw new Error(`Native-PWA service worker is missing required behavior: ${requirement}`);
  }
}
for (const forbidden of ['cache.addAll(', 'caches.open(', 'caches.match(']) {
  if (serviceWorker.includes(forbidden)) {
    throw new Error(`PWA service worker must not replay a cached application shell: ${forbidden}`);
  }
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('<link rel="manifest" href="./manifest.webmanifest"')) {
  throw new Error('Built index must link the canonical manifest without a competing revision URL');
}
if (!index.includes('./icons/ranger-192.png')) throw new Error('Built index must expose the Ranger launcher icon');
if (!index.includes(".register('./sw.js', { scope: './', updateViaCache: 'none' })")) {
  throw new Error('Built index must register the canonical service worker at project-root scope');
}
if (!index.includes('registration.update()')) throw new Error('Built index must request the current service-worker update');
if (!index.includes('mobile-web-app-capable')) throw new Error('Built index is missing Android mobile-app metadata');
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}
for (const forbidden of ['beforeinstallprompt', 'preventDefault()', 'install-app-button', 'install-app-status', 'pwa-install.js', 'pwa-install.css']) {
  if (index.includes(forbidden)) {
    throw new Error(`Chrome-native install flow must not be intercepted by legacy install UI: ${forbidden}`);
  }
}
await requireMissing('pwa-install.js');
await requireMissing('pwa-install.css');

console.log(`Villager native Chrome PWA contract verified in ${root}`);
