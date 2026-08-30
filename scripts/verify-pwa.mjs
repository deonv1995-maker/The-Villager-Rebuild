import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;
const expectedAppPath = '/The-Villager-Rebuild/';

async function requireFile(relativePath) {
  const filePath = path.join(root, relativePath);
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing PWA file: ${filePath}`);
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
}

const manifestPath = await requireFile('manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.display !== 'standalone') throw new Error('PWA manifest must use standalone display mode');
if (manifest.orientation !== 'landscape') throw new Error('PWA manifest must prefer landscape orientation');
if (manifest.id !== expectedAppPath || manifest.start_url !== expectedAppPath || manifest.scope !== expectedAppPath) {
  throw new Error(`PWA id/start_url/scope must use explicit GitHub Pages path ${expectedAppPath}`);
}
if (manifest.prefer_related_applications !== false) {
  throw new Error('PWA manifest must keep prefer_related_applications false');
}

const icons = new Map((manifest.icons ?? []).map(icon => [icon.sizes, icon]));
const icon192 = icons.get('192x192');
const icon512 = icons.get('512x512');
if (icon192?.src !== './icons/villager-192.png') throw new Error('Missing 192x192 manifest icon');
if (icon512?.src !== './icons/villager-512.png') throw new Error('Missing 512x512 manifest icon');
if (!(icon192?.purpose ?? '').split(/\s+/).includes('any')) throw new Error('192x192 icon must support purpose any');
if (!(icon512?.purpose ?? '').split(/\s+/).includes('any')) throw new Error('512x512 icon must support purpose any');
await verifyPng('icons/villager-192.png', 192);
await verifyPng('icons/villager-512.png', 512);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes('CACHE_NAME') || !serviceWorker.includes("addEventListener('fetch'")) {
  throw new Error('Service worker is missing install/runtime cache behavior');
}
if (!serviceWorker.includes(expectedVersion)) {
  throw new Error(`Service worker cache version must include package version ${expectedVersion}`);
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('manifest.webmanifest')) throw new Error('Built index is not linked to the PWA manifest');
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

const assetDir = path.join(root, 'assets');
const assetFiles = (await readdir(assetDir)).filter(file => file.endsWith('.js'));
const builtJavascript = (await Promise.all(assetFiles.map(file => readFile(path.join(assetDir, file), 'utf8')))).join('\n');
if (!builtJavascript.includes('beforeinstallprompt') || !builtJavascript.includes('INSTALL GAME')) {
  throw new Error('Production bundle must include the browser PWA install prompt flow');
}
if (!builtJavascript.includes('updateViaCache') || !builtJavascript.includes('none')) {
  throw new Error('Production bundle must register the service worker without HTTP cache reuse');
}

console.log(`PWA install contract verified in ${root} for ${expectedVersion}`);
