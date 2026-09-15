import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

/**
 * Load the authored Quaternius universal-rig pieces used by the current player
 * comparison trial. The ranger outfit already includes its authored hood, so
 * the separate hair module is deliberately omitted to prevent hood/hair clipping.
 * Animation remains owned by the established KayKit Ranger; these scenes provide
 * presentation geometry/skeletons only.
 */
export async function loadQuaterniusRangerParts() {
  const loader = new GLTFLoader();
  const paths = ASSET_PATHS.ranger.quaterniusPeasant;
  const [body, head] = await Promise.all([
    loader.loadAsync(paths.body),
    loader.loadAsync(paths.head)
  ]);

  const parts = {
    body: body?.scene,
    head: head?.scene
  };

  for (const [name, scene] of Object.entries(parts)) {
    if (!scene) throw new Error(`Quaternius ranger ${name} asset did not contain a scene`);
  }

  return parts;
}
