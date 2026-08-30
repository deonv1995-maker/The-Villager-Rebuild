import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const shellRevision = 'current-chrome-icons-1';

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
    throw new Error(`Competing install file must not be emitted: ${filePath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
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
if (manifest.id !== './' || manifest.name !== 'The Villager' || manifest.short_name !== 'Villager') {
  throw new Error('PWA identity must match The Villager');
}
if (manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('Villager start_url and scope must remain relative to the Pages project root');
}
if (manifest.display !== 'fullscreen') throw new Error('Villager display mode must remain fullscreen');
if (!Array.isArray(manifest.display_override) || manifest.display_override.join(',') !== 'fullscreen,standalone') {
  throw new Error('Villager display_override must remain fullscreen then standalone');
}
if (manifest.orientation !== 'any') throw new Error('Villager manifest orientation must remain any during install recovery');
if (manifest.prefer_related_applications === true) throw new Error('PWA must not prefer a related native application');

const icons = manifest.icons ?? [];
const png192 = icons.find(icon => icon.src === 'icons/icon-192.png');
const png512 = icons.find(icon => icon.src === 'icons/icon-512.png');
const pngMaskable = icons.find(icon => icon.src === 'icons/icon-maskable-512.png');
const svgIcon = icons.find(icon => icon.src === 'icons/icon.svg');
const svgMaskable = icons.find(icon => icon.src === 'icons/icon-maskable.svg');
if (png192?.sizes !== '192x192' || png192?.type !== 'image/png' || png192?.purpose !== 'any') {
  throw new Error('Current Chromium installability requires an explicit 192x192 PNG icon');
}
if (png512?.sizes !== '512x512' || png512?.type !== 'image/png' || png512?.purpose !== 'any') {
  throw new Error('Current Chromium installability requires an explicit 512x512 PNG icon');
}
if (pngMaskable?.sizes !== '512x512' || pngMaskable?.type !== 'image/png' || pngMaskable?.purpose !== 'maskable') {
  throw new Error('Android launcher presentation requires the 512x512 maskable PNG icon');
}
if (svgIcon?.sizes !== 'any' || svgIcon?.type !== 'image/svg+xml' || svgIcon?.purpose !== 'any') {
  throw new Error('Original Villager standard SVG fallback changed');
}
if (svgMaskable?.sizes !== 'any' || svgMaskable?.type !== 'image/svg+xml' || svgMaskable?.purpose !== 'maskable') {
  throw new Error('Original Villager maskable SVG fallback changed');
}
await verifyPng('icons/icon-192.png', 192);
await verifyPng('icons/icon-512.png', 512);
await verifyPng('icons/icon-maskable-512.png', 512);
await verifySvg('icons/icon.svg');
await verifySvg('icons/icon-maskable.svg');
await requireFile('.nojekyll', true);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
for (const requirement of [
  "self.addEventListener('install'",
  "self.addEventListener('activate'",
  "self.addEventListener('fetch'",
  'self.skipWaiting()',
  'caches.keys()',
  'keys.map(key=>caches.delete(key))',
  'self.clients.claim()',
  "fetch(request,{cache:'no-store'})"
]) {
  if (!serviceWorker.includes(requirement)) {
    throw new Error(`Original Villager service worker behavior is missing: ${requirement}`);
  }
}
for (const forbidden of ['caches.open(', 'caches.match(', 'cache.addAll(', 'LEGACY_CACHE_PREFIXES', 'VILLAGER_CACHE_PREFIXES']) {
  if (serviceWorker.includes(forbidden)) {
    throw new Error(`Original Villager service worker must not keep rebuild cache logic: ${forbidden}`);
  }
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes(`./manifest.webmanifest?v=${shellRevision}`)) {
  throw new Error('Built index must link the current Chrome install manifest revision');
}
if (!index.includes('./icons/icon.svg')) throw new Error('Built index must expose the original Villager SVG favicon');
if (!index.includes(`navigator.serviceWorker.register('./sw.js?v=${shellRevision}')`)) {
  throw new Error('Built index must use the simple versioned service-worker registration pattern');
}
for (const requirement of ['Cache-Control', 'no-cache, no-store, must-revalidate', 'mobile-web-app-capable']) {
  if (!index.includes(requirement)) throw new Error(`Built index is missing PWA shell metadata: ${requirement}`);
}
for (const forbidden of [
  'beforeinstallprompt',
  'preventDefault()',
  'install-app-button',
  'install-app-status',
  'pwa-install.js',
  'pwa-install.css',
  'updateViaCache',
  'registration.update()'
]) {
  if (index.includes(forbidden)) {
    throw new Error(`Chrome-owned install flow must not contain competing install logic: ${forbidden}`);
  }
}
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}
await requireMissing('pwa-install.js');
await requireMissing('pwa-install.css');

console.log(`Villager current Chrome PWA contract verified in ${root}`);
