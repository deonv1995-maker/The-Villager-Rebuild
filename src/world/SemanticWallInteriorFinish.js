import * as THREE from 'three';

const INTERIOR_WOOD_FACE_COLOR = 0x98653f;

const interiorWoodFaceMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_WOOD_FACE_COLOR,
  roughness: 0.94,
  metalness: 0,
  flatShading: true
});

const splitLogGroups = root => {
  const groups = [];
  root?.traverse?.(object => {
    if (!object?.isGroup || !String(object.name ?? '').includes('SplitLog')) return;
    groups.push(object);
  });
  return groups;
};

const splitLogFlatFace = group => group.children.find(child => (
  child?.isMesh && child.geometry?.type === 'BoxGeometry'
));

/**
 * Semantic walls already use split half-logs with their flat face directed toward the
 * occupied room. Keep the bark exterior untouched and give every inward flat face one
 * shared warm timber material. Lighting and the split-log geometry provide enough natural
 * variation; row-by-row colour changes made adjacent walls compete visually and produced
 * a patchwork interior on mobile.
 */
export function applySemanticWallInteriorWoodFinish(root) {
  if (!root) return 0;

  let faceCount = 0;
  for (const group of splitLogGroups(root)) {
    const face = splitLogFlatFace(group);
    if (!face) continue;

    face.material = interiorWoodFaceMaterial;
    face.userData.semanticWallInteriorWoodFace = true;
    face.userData.semanticWallInteriorWoodTone = 0;
    faceCount += 1;
  }

  root.userData.semanticWallInteriorWood = faceCount > 0;
  root.userData.semanticWallInteriorWoodUnifiedTone = faceCount > 0;
  root.userData.semanticWallInteriorWoodFaceCount = faceCount;
  return faceCount;
}
