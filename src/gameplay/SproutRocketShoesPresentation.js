import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPROUT_VISUAL_COLORS } from '../rendering/SproutVisualAsset.js';

const FLAME = 0xbaf4ff;
const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const easeOutCubic = value => 1 - ((1 - clamp01(value)) ** 3);

function mesh(geometry, material, name, { shadow = true } = {}) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = shadow;
  result.receiveShadow = shadow;
  return result;
}

function createShoe(sideName, materials) {
  const side = sideName === 'left' ? -1 : 1;
  const root = new THREE.Group();
  root.name = `sprout-rocket-shoe-${sideName}`;
  root.userData.sproutTransformed = true;

  const assembly = new THREE.Group();
  assembly.name = `sprout-rocket-shoe-${sideName}-assembly`;
  root.add(assembly);

  const sole = mesh(
    new RoundedBoxGeometry(0.29, 0.115, 0.49, 3, 0.05),
    materials.greenDark,
    `sprout-rocket-shoe-${sideName}-sole`
  );
  sole.position.set(0, -0.09, 0.035);

  const shell = mesh(
    new THREE.SphereGeometry(0.5, 14, 9),
    materials.shell,
    `sprout-rocket-shoe-${sideName}-shell`
  );
  shell.position.set(0, -0.025, 0.06);
  shell.scale.set(0.3, 0.17, 0.5);

  const toe = mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    materials.shellShade,
    `sprout-rocket-shoe-${sideName}-toe`
  );
  toe.position.set(0, -0.055, -0.185);
  toe.scale.set(0.25, 0.12, 0.25);

  const orangeBand = mesh(
    new RoundedBoxGeometry(0.305, 0.034, 0.32, 2, 0.014),
    materials.orange,
    `sprout-rocket-shoe-${sideName}-orange-band`
  );
  orangeBand.position.set(0, -0.035, 0.105);

  const ankle = mesh(
    new RoundedBoxGeometry(0.235, 0.22, 0.22, 3, 0.055),
    materials.shellShade,
    `sprout-rocket-shoe-${sideName}-ankle-shell`
  );
  ankle.position.set(0, 0.075, 0.135);

  const sidePanel = mesh(
    new THREE.SphereGeometry(0.5, 10, 7),
    materials.green,
    `sprout-rocket-shoe-${sideName}-side-panel`
  );
  sidePanel.position.set(side * 0.135, 0.02, 0.09);
  sidePanel.scale.set(0.055, 0.13, 0.22);

  const faceFrame = mesh(
    new RoundedBoxGeometry(0.15, 0.105, 0.032, 2, 0.025),
    materials.shellShade,
    `sprout-rocket-shoe-${sideName}-face-frame`
  );
  faceFrame.position.set(side * 0.135, 0.095, 0.13);
  faceFrame.rotation.y = side * Math.PI / 2;

  const face = mesh(
    new RoundedBoxGeometry(0.13, 0.086, 0.02, 2, 0.022),
    materials.face,
    `sprout-rocket-shoe-${sideName}-face-screen`,
    { shadow: false }
  );
  face.position.set(side * 0.154, 0.095, 0.13);
  face.rotation.y = side * Math.PI / 2;

  const eye = mesh(
    new THREE.TorusGeometry(0.027, 0.008, 5, 10, Math.PI),
    materials.cyan,
    `sprout-rocket-shoe-${sideName}-eye`,
    { shadow: false }
  );
  eye.position.set(side * 0.166, 0.108, 0.13);
  eye.rotation.set(0, side * Math.PI / 2, side < 0 ? Math.PI : 0);
  eye.scale.set(1, 0.72, 1);

  const leafFin = mesh(
    new THREE.SphereGeometry(0.5, 10, 7),
    materials.green,
    `sprout-rocket-shoe-${sideName}-leaf-fin`
  );
  leafFin.position.set(side * 0.145, 0.17, 0.18);
  leafFin.rotation.set(0.05, side * -0.18, side * 0.44);
  leafFin.scale.set(0.07, 0.18, 0.045);

  const finMark = mesh(
    new RoundedBoxGeometry(0.05, 0.018, 0.014, 1, 0.005),
    materials.orange,
    `sprout-rocket-shoe-${sideName}-fin-mark`,
    { shadow: false }
  );
  finMark.position.set(side * 0.175, 0.185, 0.198);
  finMark.rotation.set(0.05, side * -0.18, side * 0.44);

  const hoverCore = mesh(
    new THREE.CylinderGeometry(0.075, 0.095, 0.12, 9),
    materials.greenDark,
    `sprout-rocket-shoe-${sideName}-hover-core`
  );
  hoverCore.position.set(0, -0.18, 0.15);

  const hoverRing = mesh(
    new THREE.TorusGeometry(0.095, 0.018, 6, 16),
    materials.cyan,
    `sprout-rocket-shoe-${sideName}-hover-ring`,
    { shadow: false }
  );
  hoverRing.position.set(0, -0.235, 0.15);
  hoverRing.rotation.x = Math.PI / 2;

  const flame = mesh(
    new THREE.ConeGeometry(0.08, 0.38, 7),
    materials.flame,
    `sprout-rocket-shoe-${sideName}-flame`,
    { shadow: false }
  );
  flame.position.set(0, -0.43, 0.15);
  flame.rotation.z = Math.PI;

  const innerFlame = mesh(
    new THREE.ConeGeometry(0.045, 0.26, 7),
    materials.innerFlame,
    `sprout-rocket-shoe-${sideName}-inner-flame`,
    { shadow: false }
  );
  innerFlame.position.set(0, -0.37, 0.15);
  innerFlame.rotation.z = Math.PI;

  const transformCore = mesh(
    new THREE.SphereGeometry(0.11, 10, 7),
    materials.transform,
    `sprout-rocket-shoe-${sideName}-transform-core`,
    { shadow: false }
  );
  transformCore.position.set(side * -0.1, 0.02, 0.06);

  const transformHalo = mesh(
    new THREE.TorusGeometry(0.19, 0.018, 6, 22),
    materials.transform,
    `sprout-rocket-shoe-${sideName}-transform-halo`,
    { shadow: false }
  );
  transformHalo.position.set(0, 0.01, 0.06);
  transformHalo.rotation.x = Math.PI / 2;

  assembly.add(
    sole,
    shell,
    toe,
    orangeBand,
    ankle,
    sidePanel,
    faceFrame,
    face,
    eye,
    leafFin,
    finMark,
    hoverCore,
    hoverRing,
    flame,
    innerFlame,
    transformCore,
    transformHalo
  );

  return {
    root,
    assembly,
    shell,
    toe,
    ankle,
    sidePanel,
    faceFrame,
    face,
    eye,
    leafFin,
    hoverRing,
    flame,
    innerFlame,
    transformCore,
    transformHalo,
    side,
    baseLeafRotationZ: leafFin.rotation.z
  };
}

export class SproutRocketShoesPresentation {
  constructor({ player, transformSeconds = 0.16 } = {}) {
    if (!player) throw new Error('SproutRocketShoesPresentation requires player');

    this.player = player;
    this.elapsed = 0;
    this.transformSeconds = Math.max(0.05, Number(transformSeconds) || 0.16);
    this.materials = {
      shell: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.shell,
        roughness: 0.58,
        metalness: 0.12,
        flatShading: true
      }),
      shellShade: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.shellShade,
        roughness: 0.5,
        metalness: 0.22,
        flatShading: true
      }),
      green: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.green,
        roughness: 0.5,
        metalness: 0.18,
        flatShading: true
      }),
      greenDark: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.greenDark,
        roughness: 0.4,
        metalness: 0.3,
        flatShading: true
      }),
      orange: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.orange,
        roughness: 0.42,
        metalness: 0.12,
        flatShading: true
      }),
      face: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.face,
        roughness: 0.12,
        metalness: 0.34,
        flatShading: true
      }),
      cyan: new THREE.MeshStandardMaterial({
        color: SPROUT_VISUAL_COLORS.cyan,
        emissive: SPROUT_VISUAL_COLORS.cyan,
        emissiveIntensity: 1.1,
        roughness: 0.2,
        metalness: 0.06,
        transparent: true,
        opacity: 0.96
      }),
      flame: new THREE.MeshBasicMaterial({
        color: FLAME,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      innerFlame: new THREE.MeshBasicMaterial({
        color: SPROUT_VISUAL_COLORS.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      transform: new THREE.MeshBasicMaterial({
        color: SPROUT_VISUAL_COLORS.cyan,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    };

    this.left = createShoe('left', this.materials);
    this.right = createShoe('right', this.materials);
    this.#mount('left', this.left.root);
    this.#mount('right', this.right.root);
    this.#applyTransformPose(0, 0);
  }

  update(dt, energyRatio = 1) {
    const safeDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    this.elapsed += safeDt;
    const energy = clamp01(Number(energyRatio) || 0);
    const transformRaw = clamp01(this.elapsed / this.transformSeconds);
    const transform = easeOutCubic(transformRaw);
    const ignition = clamp01((transformRaw - 0.62) / 0.38);
    this.#applyTransformPose(transform, ignition);

    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 18);
    const flameLength = (0.72 + pulse * 0.38 + energy * 0.2) * ignition;
    const hoverPulse = 0.92 + pulse * 0.12;

    for (const shoe of [this.left, this.right]) {
      shoe.flame.scale.set(1, Math.max(0.03, flameLength), 1);
      shoe.innerFlame.scale.set(1, Math.max(0.03, flameLength * 0.82), 1);
      shoe.flame.material.opacity = (0.58 + pulse * 0.28) * ignition;
      shoe.innerFlame.material.opacity = (0.68 + pulse * 0.24) * ignition;
      shoe.hoverRing.scale.setScalar(THREE.MathUtils.lerp(0.55, hoverPulse, ignition));
      shoe.hoverRing.material.emissiveIntensity = 0.7 + energy * 0.55 + pulse * 0.12;
      shoe.eye.material.emissiveIntensity = 0.85 + energy * 0.55 + pulse * 0.12;
    }
  }

  isTransformComplete() {
    return this.elapsed + 1e-6 >= this.transformSeconds;
  }

  dispose() {
    const materials = new Set();
    for (const shoe of [this.left, this.right]) {
      shoe.root?.traverse?.(object => {
        object.geometry?.dispose?.();
        if (object.material) materials.add(object.material);
      });
      shoe.root?.removeFromParent?.();
    }
    for (const material of materials) material.dispose?.();
  }

  #applyTransformPose(progress, ignition) {
    const p = clamp01(progress);
    const inverse = 1 - p;
    for (const shoe of [this.left, this.right]) {
      const scale = THREE.MathUtils.lerp(0.16, 1, p);
      shoe.assembly.scale.setScalar(scale);
      shoe.assembly.position.x = shoe.side * THREE.MathUtils.lerp(-0.18, 0, p);
      shoe.assembly.rotation.z = shoe.side * THREE.MathUtils.lerp(0.58, 0, p);

      shoe.toe.position.z = THREE.MathUtils.lerp(0.02, -0.185, p);
      shoe.ankle.position.y = THREE.MathUtils.lerp(-0.02, 0.075, p);
      shoe.sidePanel.scale.x = THREE.MathUtils.lerp(0.015, 0.055, p);
      shoe.faceFrame.scale.setScalar(THREE.MathUtils.lerp(0.2, 1, p));
      shoe.face.scale.setScalar(THREE.MathUtils.lerp(0.2, 1, p));
      shoe.eye.scale.set(
        THREE.MathUtils.lerp(0.2, 1, p),
        THREE.MathUtils.lerp(0.15, 0.72, p),
        THREE.MathUtils.lerp(0.2, 1, p)
      );
      shoe.leafFin.rotation.z = shoe.baseLeafRotationZ + shoe.side * inverse * 0.65;
      shoe.leafFin.scale.set(
        THREE.MathUtils.lerp(0.025, 0.07, p),
        THREE.MathUtils.lerp(0.035, 0.18, p),
        THREE.MathUtils.lerp(0.015, 0.045, p)
      );

      shoe.transformCore.scale.setScalar(Math.max(0.001, inverse * 1.45));
      shoe.transformCore.material.opacity = 0.88 * inverse;
      shoe.transformHalo.scale.setScalar(THREE.MathUtils.lerp(0.35, 1.7, p));
      shoe.transformHalo.material.opacity = 0.75 * inverse;
      shoe.hoverRing.material.opacity = THREE.MathUtils.lerp(0.22, 0.96, ignition);
    }
  }

  #mount(side, object) {
    const mounted = this.player.mountFootObject?.(side, object);
    if (mounted) return;

    this.player.root?.add?.(object);
    object.position.set(side === 'left' ? -0.18 : 0.18, 0.12, 0.08);
    object.rotation.set(0, 0, 0);
  }
}
