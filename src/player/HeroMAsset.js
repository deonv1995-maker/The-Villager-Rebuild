import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

async function decompressGzipResponse(response) {
  if (!response?.ok) {
    throw new Error(`Hero M asset request failed with status ${response?.status ?? 'unknown'}`);
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Hero M requires browser gzip decompression support');
  }

  const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('Hero M gzip response did not provide a readable body');
  return new Response(stream).arrayBuffer();
}

export async function parseHeroMGlb(arrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  if (!gltf?.scene) throw new Error('Hero M GLB did not contain a scene');
  return gltf.scene;
}

/**
 * Load the web-optimized Hero M presentation asset. The checked-in file is a
 * gzip-compressed GLB derivative of the user-supplied FBX; its embedded source
 * animations are intentionally omitted because KayKit remains the sole runtime
 * animation/gameplay authority.
 */
export async function loadHeroMBody() {
  const response = await fetch(ASSET_PATHS.ranger.heroM.body);
  const bytes = await decompressGzipResponse(response);
  return parseHeroMGlb(bytes);
}
