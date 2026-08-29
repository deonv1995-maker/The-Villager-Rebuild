import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ASSET_PATHS } from '../src/data/AssetPaths.js';

const root = process.argv[2] ?? 'public';

function flattenAssetPaths(value, prefix = '') {
  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') entries.push([name, child]);
    else entries.push(...flattenAssetPaths(child, name));
  }
  return entries;
}

function resolveRuntimePath(runtimePath) {
  const relative = runtimePath.replace(/^\.\//, '');
  if (!relative.startsWith('assets/')) {
    throw new Error(`Runtime asset path must stay inside ./assets: ${runtimePath}`);
  }
  return path.join(root, relative);
}

async function verifyGlb(filePath) {
  const data = await readFile(filePath);
  if (data.length < 20) throw new Error(`${filePath}: GLB is too small`);
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${filePath}: invalid GLB magic`);
  if (data.readUInt32LE(4) !== 2) throw new Error(`${filePath}: expected GLB version 2`);
  if (data.readUInt32LE(8) !== data.length) {
    throw new Error(`${filePath}: GLB declared length does not match file length`);
  }
}

async function verifyGltf(filePath) {
  const document = JSON.parse(await readFile(filePath, 'utf8'));
  const directory = path.dirname(filePath);
  const uris = [
    ...(document.buffers ?? []).map(item => item.uri),
    ...(document.images ?? []).map(item => item.uri)
  ].filter(uri => uri && !uri.startsWith('data:'));

  for (const uri of uris) {
    const dependency = path.join(directory, uri);
    const info = await stat(dependency);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`${filePath}: missing dependency ${uri}`);
    }
  }
}

for (const [name, runtimePath] of flattenAssetPaths(ASSET_PATHS)) {
  const filePath = resolveRuntimePath(runtimePath);
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`${name}: missing ${filePath}`);

  if (filePath.endsWith('.glb')) await verifyGlb(filePath);
  if (filePath.endsWith('.gltf')) await verifyGltf(filePath);

  console.log(`verified ${name}: ${filePath}`);
}
