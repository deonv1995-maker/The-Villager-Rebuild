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

async function verifySvg(relativePath) {
  const filePath = await requireFile(relativePath);
  const source = await readFile(filePath, 'utf8');
  if (!source.includes('<svg') || !source.includes('viewBox="0 0 512 512"')) {
    throw new Error(`${filePath}: invalid Villager SVG icon`);
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

const icons = manifest.icons ?? [];
const normalIcon = icons.find(icon => icon.src === './icons/icon.svg');
const maskableIcon = icons.find(icon => icon.src === './icons/icon-maskable.svg');
if (normalIcon?.sizes !== 'any' || normalIcon?.purpose !== 'any') throw new Error('Missing canonical Villager app icon');
if (maskableIcon?.sizes !== 'any' || maskableIcon?.purpose !== 'maskable') throw new Error('Missing canonical maskable Villager icon');
await verifySvg('icons/icon.svg');
await verifySvg('icons/icon-maskable.svg');
await requireFile('.nojekyll', true);

const serviceWorkerPath = await requireFile('sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes("addEventListener('fetch'") || !serviceWorker.includes("cache: 'no-store'")) {
  throw new Error('Service worker must keep the exact game/module graph network-fresh');
}
if (!serviceWorker.includes(expectedVersion)) {
  throw new Error(`Service worker shell version must match package version ${expectedVersion}`);
}

const indexPath = await requireFile('index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('manifest.webmanifest')) throw new Error('Built index is not linked to the PWA manifest');
if (!index.includes('mobile-web-app-capable')) throw new Error('Built index is missing Android mobile-app metadata');
if (!index.includes('./icons/icon.svg')) throw new Error('Built index must use the canonical Villager icon');
if (!index.includes(`Foundation ${expectedVersion}`) || !index.includes(`FOUNDATION ${expectedVersion}`)) {
  throw new Error(`Built index version labels must match package version ${expectedVersion}`);
}

console.log(`PWA install contract verified in ${root} for ${expectedVersion}`);
