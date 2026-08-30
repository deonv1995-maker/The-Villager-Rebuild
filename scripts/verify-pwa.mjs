import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = packageJson.version;

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
if (manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('PWA start_url and scope must remain relative for GitHub Pages hosting');
}

const icons = new Map((manifest.icons ?? []).map(icon => [icon.sizes, icon.src]));
if (icons.get('192x192') !== './icons/villager-192.png') throw new Error('Missing 192x192 manifest icon');
if (icons.get('512x512') !== './icons/villager-512.png') throw new Error('Missing 512x512 manifest icon');
await verifyPng('icons/villager-192.png', 192);
await verifyPng('icons/villager-512.png', 512);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes("CACHE_NAME") || !serviceWorker.includes("addEventListener('fetch'")) {
  throw new Error('Service worker is missing install/runtime cache behavior');
}
if (!serviceWorker.includes(`CACHE_PREFIX}${expectedVersion}`) && !serviceWorker.includes(`CACHE_PREFIX}\${expectedVersion}`)) {
  if (!serviceWorker.includes(`CACHE_PREFIX}\${expectedVersion}`) && !serviceWorker.includes(`${expectedVersion}`)) {
    throw new Error(`Service worker cache version must match package version ${expectedVersion}`);
  }
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('manifest.webmanifest')) throw new Error('Built index is not linked to the PWA manifest');
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

console.log(`PWA install contract verified in ${root} for ${expectedVersion}`);
