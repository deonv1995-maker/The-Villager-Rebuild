import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const shellRevision = `${expectedVersion}-install6`;

async function requireFile(relativePath, allowEmpty = false) {
  const filePath = path.join(root, relativePath);
  const info = await stat(filePath);
  if (!info.isFile() || (!allowEmpty && info.size === 0)) throw new Error(`Missing PWA file: ${filePath}`);
  return filePath;
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

  let offset = 8;
  let sawIhdr = false;
  let sawIend = false;
  const idat = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > data.length) throw new Error(`${filePath}: truncated PNG chunk`);

    const type = data.toString('ascii', typeStart, dataStart);
    if (type === 'IHDR') sawIhdr = true;
    if (type === 'IDAT') idat.push(data.subarray(dataStart, dataEnd));
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!sawIhdr || !sawIend || idat.length === 0) {
    throw new Error(`${filePath}: incomplete PNG structure`);
  }

  try {
    inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw new Error(`${filePath}: PNG image data cannot be decoded: ${error.message}`);
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
const icon192 = icons.find(icon => icon.src === 'icons/ranger-192.png');
const icon512 = icons.find(icon => icon.src === 'icons/ranger-512.png');
const maskable512 = icons.find(icon => icon.src === 'icons/ranger-maskable-512.png');
if (icon192?.sizes !== '192x192' || icon192?.type !== 'image/png' || icon192?.purpose !== 'any') {
  throw new Error('Chrome install contract requires a clean 192x192 Ranger PNG app icon');
}
if (icon512?.sizes !== '512x512' || icon512?.type !== 'image/png' || icon512?.purpose !== 'any') {
  throw new Error('Chrome install contract requires a clean 512x512 Ranger PNG app icon');
}
if (maskable512?.sizes !== '512x512' || maskable512?.type !== 'image/png' || maskable512?.purpose !== 'maskable') {
  throw new Error('Android shell requires a clean 512x512 Ranger maskable PNG icon');
}
await verifyPng('icons/ranger-192.png', 192);
await verifyPng('icons/ranger-512.png', 512);
await verifyPng('icons/ranger-maskable-512.png', 512);
await requireFile('.nojekyll', true);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes(`SHELL_VERSION = '${shellRevision}'`)) {
  throw new Error(`Service worker shell revision must match ${shellRevision}`);
}
for (const asset of [
  './manifest.webmanifest',
  './icons/ranger-192.png',
  './icons/ranger-512.png',
  './icons/ranger-maskable-512.png'
]) {
  if (!serviceWorker.includes(`'${asset}'`)) throw new Error(`Service worker must pre-cache clean shell asset ${asset}`);
}
if (!serviceWorker.includes('cache.addAll(SHELL_ASSETS)')) {
  throw new Error('Service worker must pre-cache the install shell like the archived Villager PWA');
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
const pngIconRef = './icons/ranger-192.png';
if (!index.includes(manifestRef)) throw new Error('Built index is not linked to the current PWA manifest revision');
if (!index.includes(workerRef)) throw new Error('Built index is not registering the current service worker revision');
if (!index.includes("scope: './'")) throw new Error('Service worker registration must use the archived explicit relative scope');
if (!index.includes('registration.update()')) throw new Error('Service worker registration must request the current shell update');
if (!index.includes('mobile-web-app-capable')) throw new Error('Built index is missing Android mobile-app metadata');
if (!index.includes(`<link rel="icon" href="${pngIconRef}" type="image/png" sizes="192x192" />`)) {
  throw new Error('Built index must expose the clean Ranger PNG icon to Chrome');
}
if (!index.includes(`<link rel="apple-touch-icon" href="${pngIconRef}" />`)) {
  throw new Error('Built index must expose the clean Ranger touch icon');
}
if (index.includes('pwa-shell.js') || index.includes('beforeinstallprompt') || index.includes('preventDefault()')) {
  throw new Error('Android install flow must not suppress or replace Chrome native installation UI');
}
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

console.log(`Native Villager PWA install contract verified in ${root} for ${shellRevision}`);
