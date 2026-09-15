import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';

/**
 * Load the three authored Quaternius universal-rig pieces used by the player
 * candidate. Animation remains owned by the established KayKit Ranger; these
 * scenes provide presentation geometry/skeletons only.
 */
export async function loadQuaterniusPeasantParts() {
  const loader = new GLTFLoader();
  const paths = ASSET_PATHS.ranger.quaterniusPeasant;
  const [body, head, hair] = await Promise.all([
    loader.loadAsync(paths.body),
    loader.loadAsync(paths.head),
    loader.loadAsync(paths.hair)
  ]);

  const parts = {
    body: body?.scene,
    head: head?.scene,
    hair: hair?.scene
  };

  for (const [name, scene] of Object.entries(parts)) {
    if (!scene) throw new Error(`Quaternius peasant ${name} asset did not contain a scene`);
  }

  return parts;
}
