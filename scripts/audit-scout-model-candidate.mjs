import { readFile } from 'node:fs/promises';
import path from 'node:path';

const candidatePath = process.argv[2];

if (!candidatePath) {
  console.error('Usage: node scripts/audit-scout-model-candidate.mjs <candidate.gltf|candidate.glb>');
  process.exit(64);
}

function parseGlb(data) {
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Candidate does not have a valid GLB header.');
  }
  if (data.readUInt32LE(4) !== 2) throw new Error('Scout candidate must use glTF 2.0.');
  if (data.readUInt32LE(8) !== data.length) {
    throw new Error('GLB declared length does not match the file length.');
  }

  const jsonChunkLength = data.readUInt32LE(12);
  const jsonChunkType = data.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) throw new Error('GLB does not begin with a JSON chunk.');
  return JSON.parse(data.toString('utf8', 20, 20 + jsonChunkLength).replace(/\u0000+$/g, '').trim());
}

function parseCandidate(data, extension) {
  if (extension === '.glb') return parseGlb(data);
  if (extension === '.gltf') return JSON.parse(data.toString('utf8'));
  throw new Error(`Unsupported Scout candidate format: ${extension || '(none)'}. Use .gltf or .glb.`);
}

function accessorCount(document, accessorIndex) {
  if (!Number.isInteger(accessorIndex)) return 0;
  return document.accessors?.[accessorIndex]?.count ?? 0;
}

function primitiveVertexCount(document) {
  let total = 0;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      total += accessorCount(document, primitive.attributes?.POSITION);
    }
  }
  return total;
}

function primitiveCount(document) {
  return (document.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives?.length ?? 0), 0);
}

function jointNames(document) {
  const names = [];
  const seen = new Set();
  for (const skin of document.skins ?? []) {
    for (const jointIndex of skin.joints ?? []) {
      const name = document.nodes?.[jointIndex]?.name ?? `node-${jointIndex}`;
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function externalUris(document) {
  return [
    ...(document.buffers ?? []).map(item => item.uri),
    ...(document.images ?? []).map(item => item.uri)
  ].filter(uri => uri && !uri.startsWith('data:'));
}

const data = await readFile(candidatePath);
const extension = path.extname(candidatePath).toLowerCase();
const document = parseCandidate(data, extension);

if (String(document.asset?.version ?? '') !== '2.0') {
  throw new Error(`Scout candidate must declare glTF 2.0, found ${document.asset?.version ?? 'unknown'}.`);
}

const meshes = document.meshes ?? [];
const primitives = primitiveCount(document);
const vertices = primitiveVertexCount(document);
const skins = document.skins ?? [];
const joints = jointNames(document);
const animations = document.animations ?? [];
const materials = document.materials ?? [];
const textures = document.textures ?? [];
const dependencies = externalUris(document);

if (meshes.length === 0 || primitives === 0 || vertices === 0) {
  throw new Error('Scout candidate does not contain usable render geometry.');
}

const summary = {
  file: candidatePath,
  bytes: data.length,
  generator: document.asset?.generator ?? null,
  meshes: meshes.length,
  primitives,
  vertices,
  materials: materials.length,
  textures: textures.length,
  skins: skins.length,
  joints: joints.length,
  animations: animations.length,
  externalDependencies: dependencies.length
};

console.log(JSON.stringify(summary, null, 2));

if (dependencies.length > 0) {
  console.log(`External dependencies: ${dependencies.join(', ')}`);
}

if (skins.length === 0 || joints.length === 0) {
  console.error('\nScout candidate is renderable but is not rigged.');
  console.error('Do not replace the production Scout presentation with this file yet.');
  console.error('The KayKit medium rig must remain the animation/tool-anchor authority until a tested rig/retarget step exists.');
  process.exitCode = 2;
} else {
  console.log(`\nRig detected (${joints.length} joints). Candidate may proceed to compatibility/retarget testing.`);
}
