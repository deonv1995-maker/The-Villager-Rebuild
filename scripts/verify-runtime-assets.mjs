import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ASSET_PATHS } from '../src/data/AssetPaths.js';
import { decodeSegmentedToolPayload } from '../src/rendering/ToolModelAsset.js';

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

function verifyFbxBuffer(data, label) {
  if (data.length < 64) throw new Error(`${label}: FBX is too small`);
  const header = data.toString('ascii', 0, 21);
  if (!header.startsWith('Kaydara FBX Binary')) {
    throw new Error(`${label}: expected binary FBX header`);
  }
}

async function verifyFbx(filePath) {
  verifyFbxBuffer(await readFile(filePath), filePath);
}

async function verifyPng(filePath) {
  const data = await readFile(filePath);
  if (data.length < 24) throw new Error(`${filePath}: PNG is too small`);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!data.subarray(0, 8).equals(expected)) throw new Error(`${filePath}: invalid PNG signature`);
}

async function verifyWebp(filePath) {
  const data = await readFile(filePath);
  if (data.length < 16) throw new Error(`${filePath}: WebP is too small`);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`${filePath}: invalid WebP signature`);
  }
}

for (const [name, runtimePath] of flattenAssetPaths(ASSET_PATHS)) {
  const filePath = resolveRuntimePath(runtimePath);
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`${name}: missing ${filePath}`);

  if (filePath.endsWith('.glb')) await verifyGlb(filePath);
  else if (filePath.endsWith('.gltf')) await verifyGltf(filePath);
  else if (filePath.endsWith('.fbx')) await verifyFbx(filePath);
  else if (filePath.endsWith('.png')) await verifyPng(filePath);
  else if (filePath.endsWith('.webp')) await verifyWebp(filePath);

  console.log(`verified ${name}: ${filePath}`);
}

// The selected Fantasy Pawn tools are transported as one gzip-compressed FBX
// base64 stream split across repository-friendly text segments. Their current
// boundaries are not guaranteed to land on base64 quartets, so asset integrity
// must be verified through the exact production reassembly decoder rather than
// by treating each text file as an independently decodable base64 document.
for (const [toolId, definition] of Object.entries(ASSET_PATHS.tools ?? {})) {
  const parts = definition?.parts;
  if (!Array.isArray(parts) || parts.length === 0) continue;

  const encodedParts = await Promise.all(
    parts.map(runtimePath => readFile(resolveRuntimePath(runtimePath), 'utf8'))
  );
  const compressed = decodeSegmentedToolPayload(encodedParts);
  const fbx = gunzipSync(compressed);
  verifyFbxBuffer(fbx, `${toolId} segmented runtime payload`);
  console.log(`verified tools.${toolId}.segmentedPayload: ${parts.length} parts -> ${fbx.length} FBX bytes`);
}
