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
  return Boolean(TOOL_MODEL_PRESENTATION[toolId] && ASSET_PATHS.tools?.[toolId]);
}

export async function createToolModelAsset(toolId) {
  const presentation = TOOL_MODEL_PRESENTATION[toolId];
  const modelPath = ASSET_PATHS.tools?.[toolId];
  if (!presentation || !modelPath) throw new Error(`No FBX tool presentation for ${toolId}`);

  const template = await loadTemplate(modelPath);
  const model = template.clone(true);
  model.name = `${toolId}-fbx-presentation`;
  prepareModel(model);
  normalizeModel(model, presentation);
  return model;
}

async function loadTemplate(modelPath) {
  if (!MODEL_TEMPLATE_CACHE.has(modelPath)) {
    MODEL_TEMPLATE_CACHE.set(modelPath, new FBXLoader().loadAsync(modelPath));
  }
  return MODEL_TEMPLATE_CACHE.get(modelPath);
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
