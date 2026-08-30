import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const shellRevision = 'original-pwa-1';

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
    throw new Error(`${filePath}: invalid original Villager SVG icon`);
  }
}

const manifestPath = await requireFile('manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.id !== './' || manifest.name !== 'The Villager' || manifest.short_name !== 'Villager') {
  throw new Error('PWA identity must match the original Villager manifest');
}
if (manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('Original Villager start_url and scope must remain relative');
}
if (manifest.display !== 'fullscreen') throw new Error('Original Villager display mode must remain fullscreen');
if (!Array.isArray(manifest.display_override) || manifest.display_override.join(',') !== 'fullscreen,standalone') {
  throw new Error('Original Villager display_override must remain fullscreen then standalone');
}
if (manifest.orientation !== 'any') throw new Error('Original Villager manifest orientation must remain any');

const icons = manifest.icons ?? [];
if (icons.length !== 2) throw new Error('Original Villager manifest must expose exactly two SVG launcher icons');
const normalIcon = icons.find(icon => icon.src === 'icons/icon.svg');
const maskableIcon = icons.find(icon => icon.src === 'icons/icon-maskable.svg');
if (normalIcon?.sizes !== 'any' || normalIcon?.type !== 'image/svg+xml' || normalIcon?.purpose !== 'any') {
  throw new Error('Original Villager standard SVG icon declaration changed');
}
if (maskableIcon?.sizes !== 'any' || maskableIcon?.type !== 'image/svg+xml' || maskableIcon?.purpose !== 'maskable') {
  throw new Error('Original Villager maskable SVG icon declaration changed');
}
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
  throw new Error('Built index must link the original-style versioned manifest URL');
}
if (!index.includes('./icons/icon.svg')) throw new Error('Built index must expose the original Villager SVG icon');
if (!index.includes(`navigator.serviceWorker.register('./sw.js?v=${shellRevision}')`)) {
  throw new Error('Built index must use the original simple service-worker registration pattern');
}
for (const requirement of ['Cache-Control', 'no-cache, no-store, must-revalidate', 'mobile-web-app-capable']) {
  if (!index.includes(requirement)) throw new Error(`Built index is missing original PWA shell metadata: ${requirement}`);
}
for (const forbidden of [
  'beforeinstallprompt',
  'preventDefault()',
  'install-app-button',
  'install-app-status',
  'pwa-install.js',
  'pwa-install.css',
  'ranger-192.png',
  'updateViaCache',
  'registration.update()'
]) {
  if (index.includes(forbidden)) {
    throw new Error(`Original Chrome-owned install flow must not contain rebuild install logic: ${forbidden}`);
  }
}
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}
await requireMissing('pwa-install.js');
await requireMissing('pwa-install.css');

console.log(`Original Villager Chrome PWA contract verified in ${root}`);
