import * as THREE from 'three';

const CYAN = 0x62cfff;

function signalMaterial(opacity) {
  return new THREE.MeshBasicMaterial({
    color: CYAN,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export function createSproutPocketSignalVisual(scene) {
  if (!scene) return null;

  const root = new THREE.Group();
  root.name = 'sprout-pocket-signal-glow';
  root.visible = false;
  root.renderOrder = 35;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 12, 8),
    signalMaterial(0)
  );
  glow.name = 'sprout-pocket-signal-core';
  glow.renderOrder = 35;
  root.add(glow);

  const ringGeometry = new THREE.TorusGeometry(0.72, 0.025, 5, 28);
  const ringA = new THREE.Mesh(ringGeometry, signalMaterial(0));
  ringA.name = 'sprout-pocket-signal-ring-a';
  ringA.rotation.x = Math.PI / 2;
  ringA.renderOrder = 35;
  root.add(ringA);

  const ringB = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.018, 5, 32),
    signalMaterial(0)
  );
  ringB.name = 'sprout-pocket-signal-ring-b';
  ringB.rotation.x = Math.PI / 2;
  ringB.renderOrder = 35;
  root.add(ringB);

  root.userData.glow = glow;
  root.userData.ringA = ringA;
  root.userData.ringB = ringB;
  scene.add(root);
  return root;
}

export function updateSproutPocketSignalVisual(root, elapsed, cue = null) {
  if (!root) return;
  const alpha = THREE.MathUtils.clamp(Number(cue?.alpha) || 0, 0, 1);
  if (!cue || alpha <= 0) {
    root.visible = false;
    return;
  }

  const strength = THREE.MathUtils.clamp(Number(cue.strength) || 0, 0, 1);
  const pulse = 0.5 + 0.5 * Math.sin((Number(elapsed) || 0) * (2.8 + strength * 1.4));
  const visibility = alpha * (0.72 + strength * 0.28);

  root.visible = true;
  root.position.set(Number(cue.x) || 0, Number(cue.y) || 0, Number(cue.z) || 0);
  root.scale.setScalar(0.94 + pulse * 0.08);
  root.rotation.y = (Number(elapsed) || 0) * 0.18;

  const glow = root.userData.glow;
  const ringA = root.userData.ringA;
  const ringB = root.userData.ringB;
  if (glow?.material) glow.material.opacity = Math.min(0.16, (0.055 + pulse * 0.04) * visibility);
  if (ringA?.material) ringA.material.opacity = Math.min(0.24, (0.09 + pulse * 0.08) * visibility);
  if (ringB?.material) ringB.material.opacity = Math.min(0.18, (0.06 + (1 - pulse) * 0.07) * visibility);
  if (ringA) ringA.rotation.z = (Number(elapsed) || 0) * 0.32;
  if (ringB) ringB.rotation.z = -(Number(elapsed) || 0) * 0.21;
}

export function disposeSproutPocketSignalVisual(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  root.parent?.remove(root);
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}
