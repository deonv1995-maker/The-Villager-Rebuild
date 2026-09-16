import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

const MODEL_TEMPLATE_CACHE = new Map();
const UP = new THREE.Vector3(0, 1, 0);
const SOURCE_HEAD_AXIS = new THREE.Vector3(0, -1, 0);

const TOOL_MODEL_PRESENTATION = Object.freeze({
  axe: Object.freeze({ targetLength: 1.05, restMinY: -0.38 }),
  hammer: Object.freeze({ targetLength: 0.98, restMinY: -0.35 }),
  shovel: Object.freeze({ targetLength: 1.2, restMinY: -0.51 }),
  sword: Object.freeze({ targetLength: 1.68, restMinY: -0.21 })
});

export function hasToolModelAsset(toolId) {
  const parts = ASSET_PATHS.tools?.[toolId]?.parts;
  return Boolean(TOOL_MODEL_PRESENTATION[toolId] && Array.isArray(parts) && parts.length > 0);
}

export async function createToolModelAsset(toolId) {
  const presentation = TOOL_MODEL_PRESENTATION[toolId];
  const parts = ASSET_PATHS.tools?.[toolId]?.parts;
  if (!presentation || !Array.isArray(parts) || parts.length === 0) {
    throw new Error(`No FBX tool presentation for ${toolId}`);
  }

  const template = await loadTemplate(toolId, parts);
  const model = template.clone(true);
  model.name = `${toolId}-fbx-presentation`;
  prepareModel(model);
  normalizeModel(model, presentation);
  return model;
}

async function loadTemplate(toolId, parts) {
  if (!MODEL_TEMPLATE_CACHE.has(toolId)) {
    MODEL_TEMPLATE_CACHE.set(toolId, (async () => {
      const compressedBytes = await fetchCompressedParts(toolId, parts);
      const fbxBuffer = await decompressGzip(compressedBytes);
      return new FBXLoader().parse(fbxBuffer, '');
    })());
  }
  return MODEL_TEMPLATE_CACHE.get(toolId);
}

async function fetchCompressedParts(toolId, parts) {
  const encodedParts = await Promise.all(parts.map(async path => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`${toolId} asset part request failed with status ${response.status}: ${path}`);
    }
    return response.text();
  }));
  return concatenate(encodedParts.map(decodeBase64));
}

function decodeBase64(text) {
  const binary = atob(String(text ?? '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatenate(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

async function decompressGzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('FBX tool assets require browser gzip decompression support');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function prepareModel(model) {
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const clonedMaterials = sourceMaterials.map(material => material?.clone?.() ?? material);
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
    for (const material of clonedMaterials) {
      if (material?.map) material.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
}

function normalizeModel(model, presentation) {
  model.updateMatrixWorld(true);
  const primaryMesh = findPrimaryMesh(model);
  if (primaryMesh) {
    const headDirection = SOURCE_HEAD_AXIS.clone().transformDirection(primaryMesh.matrixWorld).normalize();
    if (headDirection.lengthSq() > 0.000001) {
      model.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(headDirection, UP));
    }
  }

  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const currentLength = Math.max(size.y, 0.001);
  model.scale.multiplyScalar(presentation.targetLength / currentLength);

  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y += presentation.restMinY - box.min.y;
  model.updateMatrixWorld(true);
}

function findPrimaryMesh(model) {
  let primary = null;
  let highestVertexCount = -1;
  model.traverse(object => {
    if (!object.isMesh) return;
    const vertexCount = object.geometry?.attributes?.position?.count ?? 0;
    if (vertexCount <= highestVertexCount) return;
    primary = object;
    highestVertexCount = vertexCount;
  });
  return primary;
}
