import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPROUT_COMPANION } from '../data/SproutCompanionDefinitions.js';

const COLORS = Object.freeze({
  shell: 0xe7e1cf,
  shellShade: 0xbab7aa,
  green: 0x365d46,
  greenDark: 0x213b2f,
  orange: 0xd8833d,
  face: 0x11191b,
  cyan: 0x67d7f0,
  joint: 0x6d7470,
  flame: 0xbaf4ff
});

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const easeOutCubic = value => 1 - ((1 - clamp01(value)) ** 3);
const easeInCubic = value => clamp01(value) ** 3;

function mesh(geometry, material, name, { shadow = true } = {}) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = shadow;
  result.receiveShadow = shadow;
  return result;
}

function createTransformPod(side, materials) {
  const pod = new THREE.Group();
  pod.name = `sprout-rocket-shoe-${side}-transform-pod`;
  pod.position.set(0, 0.11, 0.1);

  const shell = mesh(
    new THREE.SphereGeometry(0.15, 12, 8),
    materials.shell,
    `sprout-rocket-shoe-${side}-transform-shell`
  );
  shell.scale.set(1.03, 0.96, 1);

  const sidePanel = mesh(
    new THREE.SphereGeometry(0.153, 10, 7),
    materials.green,
    `sprout-rocket-shoe-${side}-transform-green-panel`
  );
  sidePanel.position.set(side === 'left' ? -0.105 : 0.105, 0.008, 0);
  sidePanel.scale.set(0.28, 0.7, 0.58);

  const band = mesh(
    new THREE.TorusGeometry(0.126, 0.013, 6, 18),
    materials.orange,
    `sprout-rocket-shoe-${side}-transform-orange-band`
  );
  band.position.set(0, -0.055, 0.01);
  band.scale.set(1, 0.82, 1);

  const faceFrame = mesh(
    new RoundedBoxGeometry(0.2, 0.115, 0.032, 2, 0.025),
    materials.greenDark,
    `sprout-rocket-shoe-${side}-transform-face-frame`,
    { shadow: false }
  );
  faceFrame.position.set(0, 0.025, 0.134);

  const eye = mesh(
    new THREE.TorusGeometry(0.035, 0.009, 5, 10, Math.PI),
    materials.expression,
    `sprout-rocket-shoe-${side}-transform-eye`,
    { shadow: false }
  );
  eye.position.set(side === 'left' ? -0.035 : 0.035, 0.043, 0.153);
  eye.scale.y = 0.72;

  const leaf = mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    materials.green,
    `sprout-rocket-shoe-${side}-transform-leaf`
  );
  leaf.position.set(side === 'left' ? -0.055 : 0.055, 0.16, -0.005);
  leaf.rotation.z = side === 'left' ? -0.45 : 0.45;
  leaf.scale.set(0.72, 1.65, 0.38);

  pod.add(shell, sidePanel, band, faceFrame, eye, leaf);
  return pod;
}

function createShoe(side, materials) {
  const sideSign = side === 'left' ? -1 : 1;
  const root = new THREE.Group();
  root.name = `sprout-rocket-shoe-${side}`;
  root.userData.sproutTransformedEquipment = true;
  root.userData.visualIdentity = 'sprout-production-shell';

  const transformPod = createTransformPod(side, materials);
  root.add(transformPod);

  const assembly = new THREE.Group();
  assembly.name = `sprout-rocket-shoe-${side}-formed-assembly`;
  root.add(assembly);

  const shell = mesh(
    new THREE.SphereGeometry(0.235, 16, 10),
    materials.shell,
    `sprout-rocket-shoe-${side}-shell`
  );
  shell.position.set(0, -0.045, -0.015);
  shell.scale.set(0.78, 0.48, 1.48);
  shell.rotation.x = -0.08;

  const shellShade = mesh(
    new THREE.SphereGeometry(0.205, 12, 8),
    materials.shellShade,
    `sprout-rocket-shoe-${side}-heel-shell`
  );
  shellShade.position.set(0, -0.025, 0.205);
  shellShade.scale.set(0.78, 0.52, 0.72);

  const sidePanel = mesh(
    new THREE.SphereGeometry(0.212, 12, 8),
    materials.green,
    `sprout-rocket-shoe-${side}-green-side-panel`
  );
  sidePanel.position.set(sideSign * 0.145, -0.005, -0.015);
  sidePanel.scale.set(0.24, 0.52, 1.24);
  sidePanel.rotation.z = sideSign * -0.1;

  const orangeBand = mesh(
    new THREE.TorusGeometry(0.167, 0.022, 7, 22),
    materials.orange,
    `sprout-rocket-shoe-${side}-orange-shell-band`
  );
  orangeBand.position.set(0, -0.052, 0.075);
  orangeBand.scale.set(0.82, 0.58, 1);

  const faceFrame = mesh(
    new RoundedBoxGeometry(0.19, 0.055, 0.18, 3, 0.025),
    materials.greenDark,
    `sprout-rocket-shoe-${side}-face-frame`
  );
  faceFrame.position.set(sideSign * 0.025, 0.088, -0.045);
  faceFrame.rotation.x = -0.055;

  const faceScreen = mesh(
    new RoundedBoxGeometry(0.148, 0.025, 0.132, 2, 0.018),
    materials.face,
    `sprout-rocket-shoe-${side}-face-screen`,
    { shadow: false }
  );
  faceScreen.position.set(sideSign * 0.025, 0.12, -0.052);
  faceScreen.rotation.x = -0.055;

  const expressionEye = mesh(
    new THREE.TorusGeometry(0.038, 0.009, 5, 10, Math.PI),
    materials.expression,
    `sprout-rocket-shoe-${side}-expression-eye`,
    { shadow: false }
  );
  expressionEye.position.set(sideSign * 0.025, 0.139, -0.075);
  expressionEye.rotation.x = -Math.PI / 2;
  expressionEye.rotation.z = sideSign * 0.12;
  expressionEye.scale.y = 0.72;

  const leafFin = mesh(
    new THREE.SphereGeometry(0.058, 9, 7),
    materials.green,
    `sprout-rocket-shoe-${side}-leaf-fin`
  );
  leafFin.position.set(sideSign * 0.145, 0.13, 0.14);
  leafFin.rotation.set(0.12, sideSign * -0.12, sideSign * 0.52);
  leafFin.scale.set(0.68, 1.65, 0.36);

  const finMark = mesh(
    new THREE.BoxGeometry(0.052, 0.018, 0.012),
    materials.orange,
    `sprout-rocket-shoe-${side}-fin-mark`,
    { shadow: false }
  );
  finMark.position.set(sideSign * 0.165, 0.16, 0.145);
  finMark.rotation.z = sideSign * 0.52;

  const energyPanel = mesh(
    new THREE.SphereGeometry(0.055, 10, 7),
    materials.energy,
    `sprout-rocket-shoe-${side}-energy-core`,
    { shadow: false }
  );
  energyPanel.position.set(-sideSign * 0.115, 0.018, 0.13);
  energyPanel.scale.set(0.52, 0.82, 0.42);

  const nozzle = mesh(
    new THREE.CylinderGeometry(0.072, 0.092, 0.13, 9),
    materials.greenDark,
    `sprout-rocket-shoe-${side}-nozzle`
  );
  nozzle.position.set(0, -0.17, 0.17);

  const antigravRing = mesh(
    new THREE.TorusGeometry(0.095, 0.018, 7, 18),
    materials.energy,
    `sprout-rocket-shoe-${side}-antigrav-ring`,
    { shadow: false }
  );
  antigravRing.position.set(0, -0.205, 0.17);
  antigravRing.rotation.x = Math.PI / 2;

  const flame = mesh(
    new THREE.ConeGeometry(0.08, 0.4, 8),
    materials.flame,
    `sprout-rocket-shoe-${side}-flame`,
    { shadow: false }
  );
  flame.position.set(0, -0.43, 0.17);
  flame.rotation.z = Math.PI;
  flame.visible = false;

  const glow = mesh(
    new THREE.SphereGeometry(0.115, 9, 7),
    materials.glow,
    `sprout-rocket-shoe-${side}-glow`,
    { shadow: false }
  );
  glow.position.set(0, -0.245, 0.17);
  glow.visible = false;

  assembly.add(
    shell,
    shellShade,
    sidePanel,
    orangeBand,
    faceFrame,
    faceScreen,
    expressionEye,
    leafFin,
    finMark,
    energyPanel,
    nozzle,
    antigravRing,
    flame,
    glow
  );

  assembly.position.set(0, 0.16, 0.14);
  assembly.scale.setScalar(0.16);
  assembly.rotation.set(-0.88, 0, sideSign * 0.58);

  return {
    side,
    sideSign,
    root,
    transformPod,
    assembly,
    sidePanel,
    leafFin,
    finMark,
    expressionEye,
    energyPanel,
    antigravRing,
    flame,
    glow
  };
}

export class SproutRocketShoesPresentation {
  constructor({ player } = {}) {
    if (!player) throw new Error('SproutRocketShoesPresentation requires player');

    this.player = player;
    this.elapsed = 0;
    this.transformProgress = 0;
    this.materials = {
      shell: new THREE.MeshStandardMaterial({ color: COLORS.shell, roughness: 0.58, metalness: 0.12 }),
      shellShade: new THREE.MeshStandardMaterial({ color: COLORS.shellShade, roughness: 0.5, metalness: 0.22 }),
      green: new THREE.MeshStandardMaterial({ color: COLORS.green, roughness: 0.5, metalness: 0.18 }),
      greenDark: new THREE.MeshStandardMaterial({ color: COLORS.greenDark, roughness: 0.4, metalness: 0.3 }),
      orange: new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.42, metalness: 0.12 }),
      face: new THREE.MeshStandardMaterial({ color: COLORS.face, roughness: 0.12, metalness: 0.34 }),
      joint: new THREE.MeshStandardMaterial({ color: COLORS.joint, roughness: 0.38, metalness: 0.52 }),
      expression: new THREE.MeshStandardMaterial({
        color: COLORS.cyan,
        emissive: COLORS.cyan,
        emissiveIntensity: 1.55,
        roughness: 0.2,
        metalness: 0.05
      }),
      energy: new THREE.MeshStandardMaterial({
        color: COLORS.cyan,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.92,
        roughness: 0.2,
        metalness: 0.05
      }),
      flame: new THREE.MeshBasicMaterial({
        color: COLORS.flame,
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      glow: new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    };

    this.left = createShoe('left', this.materials);
    this.right = createShoe('right', this.materials);
    this.#mount('left', this.left.root);
    this.#mount('right', this.right.root);
  }

  getTransformProgress() {
    return this.transformProgress;
  }

  update(dt, energyRatio = 1) {
    const safeDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    this.elapsed += safeDt;
    const duration = Math.max(0.01, SPROUT_COMPANION.flightTransformSeconds);
    const progress = clamp01(this.elapsed / duration);
    const formation = easeOutCubic(clamp01((progress - 0.08) / 0.72));
    const podCollapse = easeInCubic(clamp01((progress - 0.28) / 0.58));
    const ignition = easeOutCubic(clamp01(
      (progress - SPROUT_COMPANION.flightThrusterIgnitionRatio)
      / Math.max(0.01, 1 - SPROUT_COMPANION.flightThrusterIgnitionRatio)
    ));
    this.transformProgress = progress;

    const energy = clamp01(Number(energyRatio) || 0);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 18);
    const flameLength = (0.62 + pulse * 0.34 + energy * 0.18) * Math.max(0.08, ignition);
    const glowScale = (0.8 + pulse * 0.22) * Math.max(0.18, ignition);

    for (const shoe of [this.left, this.right]) {
      shoe.transformPod.visible = progress < 0.96;
      shoe.transformPod.position.set(
        shoe.sideSign * THREE.MathUtils.lerp(0.025, 0.005, progress),
        THREE.MathUtils.lerp(0.13, 0.02, podCollapse),
        THREE.MathUtils.lerp(0.11, 0.04, podCollapse)
      );
      shoe.transformPod.rotation.y = shoe.sideSign * progress * 1.4;
      shoe.transformPod.rotation.z = shoe.sideSign * Math.sin(progress * Math.PI) * 0.16;
      shoe.transformPod.scale.setScalar(THREE.MathUtils.lerp(1, 0.04, podCollapse));

      shoe.assembly.visible = progress > 0.05;
      shoe.assembly.position.set(
        0,
        THREE.MathUtils.lerp(0.16, 0, formation),
        THREE.MathUtils.lerp(0.14, 0, formation)
      );
      shoe.assembly.scale.setScalar(THREE.MathUtils.lerp(0.16, 1, formation));
      shoe.assembly.rotation.x = THREE.MathUtils.lerp(-0.88, 0, formation);
      shoe.assembly.rotation.z = THREE.MathUtils.lerp(shoe.sideSign * 0.58, 0, formation);

      shoe.sidePanel.scale.x = THREE.MathUtils.lerp(0.08, 0.24, formation);
      shoe.leafFin.rotation.z = shoe.sideSign * THREE.MathUtils.lerp(1.18, 0.52, formation);
      shoe.finMark.rotation.z = shoe.leafFin.rotation.z;
      shoe.expressionEye.scale.set(
        THREE.MathUtils.lerp(0.1, 1, formation),
        THREE.MathUtils.lerp(0.1, 0.72, formation),
        THREE.MathUtils.lerp(0.1, 1, formation)
      );
      shoe.energyPanel.scale.set(
        THREE.MathUtils.lerp(0.12, 0.52, formation),
        THREE.MathUtils.lerp(0.12, 0.82, formation),
        THREE.MathUtils.lerp(0.12, 0.42, formation)
      );

      shoe.flame.visible = ignition > 0.01;
      shoe.glow.visible = ignition > 0.01;
      shoe.flame.scale.set(1, flameLength, 1);
      shoe.flame.material.opacity = (0.52 + pulse * 0.28) * ignition;
      shoe.glow.scale.setScalar(glowScale);
      shoe.glow.material.opacity = (0.16 + pulse * 0.18) * ignition;
      shoe.antigravRing.scale.setScalar(THREE.MathUtils.lerp(0.7, 1 + pulse * 0.08, ignition));
    }

    this.materials.energy.emissiveIntensity = 0.62 + energy * 0.48 + pulse * 0.12;
    this.materials.expression.emissiveIntensity = 1.2 + pulse * 0.45;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    for (const shoe of [this.left, this.right]) {
      shoe.root?.traverse?.(object => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) if (material) materials.add(material);
      });
      shoe.root?.removeFromParent?.();
    }
    for (const geometry of geometries) geometry.dispose?.();
    for (const material of materials) material.dispose?.();
  }

  #mount(side, object) {
    const mounted = this.player.mountFootObject?.(side, object);
    if (mounted) return;

    this.player.root?.add?.(object);
    object.position.set(side === 'left' ? -0.18 : 0.18, 0.12, 0.08);
    object.rotation.set(0, 0, 0);
  }
}
