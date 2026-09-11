import * as THREE from 'three';

const INTERIOR_WOOD_FACE_COLORS = Object.freeze([
  0x9b6840,
  0xa87346,
  0x8e5c37,
  0xb17b4c
]);

const interiorWoodFaceMaterials = INTERIOR_WOOD_FACE_COLORS.map(color => (
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.94,
    metalness: 0,
    flatShading: true
  })
));

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
 * occupied room. This presentation pass keeps the bark exterior untouched and only
 * replaces those inward flat faces with deterministic warm timber tones. The row-to-row
 * variation makes the inside read as dressed wood instead of one broad beige surface,
 * without introducing textures, extra wall geometry, collision, persistence or draw-call
 * heavy decorative meshes.
 */
export function applySemanticWallInteriorWoodFinish(root) {
  if (!root) return 0;

  let faceCount = 0;
  for (const group of splitLogGroups(root)) {
    const face = splitLogFlatFace(group);
    if (!face) continue;

    const rowKey = Math.round((group.position?.y ?? 0) * 20);
    const segmentKey = Math.round((group.position?.x ?? 0) * 10);
    const materialIndex = Math.abs(rowKey + segmentKey) % interiorWoodFaceMaterials.length;
    face.material = interiorWoodFaceMaterials[materialIndex];
    face.userData.semanticWallInteriorWoodFace = true;
    face.userData.semanticWallInteriorWoodTone = materialIndex;
    faceCount += 1;
  }

  root.userData.semanticWallInteriorWood = faceCount > 0;
  root.userData.semanticWallInteriorWoodFaceCount = faceCount;
  return faceCount;
}
