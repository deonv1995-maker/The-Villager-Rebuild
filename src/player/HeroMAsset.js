import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

function decodeBase64(text) {
  const binary = atob(String(text ?? '').trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
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

async function fetchCompressedHeroM() {
  const paths = ASSET_PATHS.ranger.heroM.parts;
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Hero M runtime payload does not define any asset parts');
  }

  const encodedParts = await Promise.all(paths.map(async path => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Hero M asset part request failed with status ${response.status}: ${path}`);
    }
    return response.text();
  }));

  return concatenate(encodedParts.map(decodeBase64));
}

async function decompressGzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Hero M requires browser gzip decompression support');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function parseHeroMGlb(arrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  if (!gltf?.scene) throw new Error('Hero M GLB did not contain a scene');
  return gltf.scene;
}

/**
 * Load the web-optimized Hero M presentation asset. The checked-in runtime
 * payload is a segmented base64 wrapper around one gzip-compressed compact GLB
 * derived from the user-supplied FBX. Source animations are intentionally
 * omitted because KayKit remains the sole runtime animation/gameplay authority.
 */
export async function loadHeroMBody() {
  const compressedBytes = await fetchCompressedHeroM();
  const glbBytes = await decompressGzip(compressedBytes);
  return parseHeroMGlb(glbBytes);
}
