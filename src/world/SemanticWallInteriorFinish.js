import * as THREE from 'three';

const INTERIOR_WOOD_FACE_COLOR = 0x8f5d3b;
const INTERIOR_WOOD_SEAM_COLOR = 0x5a3924;
const INTERIOR_WOOD_SEAM_DEPTH = 0.018;
const INTERIOR_WOOD_SEAM_HEIGHT = 0.026;
const INTERIOR_WOOD_SEAM_INSET = 0.045;

const interiorWoodFaceMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_WOOD_FACE_COLOR,
  roughness: 0.94,
  metalness: 0,
  flatShading: true
});

const interiorWoodSeamMaterial = new THREE.MeshStandardMaterial({
  color: INTERIOR_WOOD_SEAM_COLOR,
  roughness: 0.97,
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

const addCourseSeam = (group, face, index) => {
  face.geometry?.computeBoundingBox?.();
  const bounds = face.geometry?.boundingBox;
  if (!bounds) return null;

  const width = Math.max(0.08, bounds.max.x - bounds.min.x - INTERIOR_WOOD_SEAM_INSET * 2);
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(width, INTERIOR_WOOD_SEAM_DEPTH, INTERIOR_WOOD_SEAM_HEIGHT),
    interiorWoodSeamMaterial
  );
  seam.name = `SemanticWallInteriorCourseSeam${index + 1}`;
  seam.position.set(
    (bounds.min.x + bounds.max.x) * 0.5,
    face.position.y + INTERIOR_WOOD_SEAM_DEPTH * 0.9,
    bounds.max.z - INTERIOR_WOOD_SEAM_HEIGHT * 0.35
  );
  seam.castShadow = false;
  seam.receiveShadow = true;
  seam.userData.semanticWallInteriorCourseSeam = true;
  group.add(seam);
  return seam;
};

/**
 * Semantic walls already use split half-logs with their flat face directed toward the
 * occupied room. Keep the bark exterior untouched, give every inward face one coherent
 * warm timber material, and add a shallow dark course seam at the lower edge of each
 * split log. The seam restores readable horizontal log courses on mobile without adding
 * a second wall shell, changing collision, or competing with Door/Window geometry.
 */
export function applySemanticWallInteriorWoodFinish(root) {
  if (!root) return 0;

  let faceCount = 0;
  let seamCount = 0;
  for (const group of splitLogGroups(root)) {
    const face = splitLogFlatFace(group);
    if (!face) continue;

    face.material = interiorWoodFaceMaterial;
    face.userData.semanticWallInteriorWoodFace = true;
    face.userData.semanticWallInteriorWoodTone = 0;
    if (addCourseSeam(group, face, seamCount)) seamCount += 1;
    faceCount += 1;
  }

  root.userData.semanticWallInteriorWood = faceCount > 0;
  root.userData.semanticWallInteriorWoodUnifiedTone = faceCount > 0;
  root.userData.semanticWallInteriorWoodFaceCount = faceCount;
  root.userData.semanticWallInteriorCourseSeamCount = seamCount;
  root.userData.semanticWallInteriorCourseDefinition = seamCount > 0;
  return faceCount;
}
