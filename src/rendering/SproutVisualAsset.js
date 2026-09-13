import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const COLORS = Object.freeze({
  shell: 0xe7e1cf,
  shellShade: 0xbab7aa,
  green: 0x365d46,
  greenDark: 0x213b2f,
  orange: 0xd8833d,
  face: 0x11191b,
  cyan: 0x67d7f0,
  joint: 0x6d7470
});

const PRESENTATION_SCALE = 0.75;
const MOTION = Object.freeze({
  bodyBobAmplitude: 0.085,
  bodyBobSecondaryAmplitude: 0.018,
  bodyBobFrequency: 1.9,
  bodySwayAmplitude: 0.035,
  bodyPitchAmplitude: 0.025,
  hoverSpinSpeed: 0.62,
  ringBobAmplitude: 0.042,
  innerRingBobAmplitude: 0.034,
  ringTiltAmplitude: 0.06,
  innerRingTiltAmplitude: 0.08,
  podPrimaryAmplitude: 0.058,
  podSecondaryAmplitude: 0.024,
  podTiltAmplitude: 0.085,
  finSwingAmplitude: 0.075,
  finPitchAmplitude: 0.035,
  armSwingAmplitude: 0.085,
  armRollAmplitude: 0.055,
  armBobAmplitude: 0.052,
  armSecondaryBobAmplitude: 0.014
});

const makeStandard = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? 0.48,
  metalness: options.metalness ?? 0.2,
  emissive: options.emissive ?? 0x000000,
  emissiveIntensity: options.emissiveIntensity ?? 0,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1
});

const markMesh = mesh => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const addMesh = (parent, geometry, material, {
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  shadow = true
} = {}) => {
  const mesh = new THREE.Mesh(geometry, material);
  if (name) mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  if (shadow) markMesh(mesh);
  parent.add(mesh);
  return mesh;
};

const createArm = ({ side, materials }) => {
  const root = new THREE.Group();
  root.name = side < 0 ? 'sprout-left-helper-arm' : 'sprout-right-helper-arm';
  root.position.set(side * 0.47, -0.02, 0.03);
  root.rotation.z = side * -0.18;
  root.userData.baseY = root.position.y;
  root.userData.baseZRotation = root.rotation.z;

  addMesh(root, new THREE.SphereGeometry(0.105, 10, 7), materials.joint, {
    name: `${root.name}-shoulder`
  });

  addMesh(root, new THREE.CylinderGeometry(0.055, 0.07, 0.3, 7), materials.shellShade, {
    name: `${root.name}-upper`,
    position: [side * 0.075, -0.14, 0.025],
    rotation: [0.06, 0, side * 0.48]
  });

  const elbow = addMesh(root, new THREE.SphereGeometry(0.08, 9, 6), materials.greenDark, {
    name: `${root.name}-elbow`,
    position: [side * 0.145, -0.27, 0.04]
  });

  addMesh(root, new THREE.CylinderGeometry(0.045, 0.06, 0.3, 7), materials.green, {
    name: `${root.name}-forearm`,
    position: [side * 0.205, -0.39, 0.105],
    rotation: [0.28, 0, side * 0.28]
  });

  const wrist = new THREE.Group();
  wrist.name = `${root.name}-wrist`;
  wrist.position.set(side * 0.245, -0.52, 0.165);
  root.add(wrist);
  addMesh(wrist, new THREE.SphereGeometry(0.07, 8, 6), materials.joint, {
    name: `${root.name}-wrist-joint`
  });

  if (side < 0) {
    addMesh(wrist, new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8), materials.greenDark, {
      name: 'sprout-utility-lamp-housing',
      position: [0, -0.055, 0.04],
      rotation: [Math.PI / 2, 0, 0]
    });
    const lamp = addMesh(wrist, new THREE.CircleGeometry(0.057, 10), materials.lamp, {
      name: 'sprout-utility-lamp',
      position: [0, -0.06, 0.112],
      rotation: [0, 0, 0],
      shadow: false
    });
    root.userData.utilityLamp = lamp;
  } else {
    const palm = addMesh(wrist, new THREE.SphereGeometry(0.075, 8, 6), materials.shellShade, {
      name: 'sprout-multitool-palm',
      position: [0, -0.025, 0]
    });
    palm.scale.set(1, 0.8, 0.85);
    for (const clawSide of [-1, 1]) {
      addMesh(wrist, new THREE.ConeGeometry(0.025, 0.13, 6), materials.orange, {
        name: `sprout-multitool-claw-${clawSide < 0 ? 'left' : 'right'}`,
        position: [clawSide * 0.045, -0.11, 0.035],
        rotation: [0.12, 0, clawSide * -0.22]
      });
    }
  }

  root.userData.elbow = elbow;
  return root;
};

export function createSproutVisual() {
  const root = new THREE.Group();
  root.name = 'sprout-production-companion';
  root.userData.sproutProductionVisual = true;
  root.userData.visualVersion = 4;
  root.userData.presentationScale = PRESENTATION_SCALE;

  const emissiveBase = {
    roughness: 0.2,
    metalness: 0.05,
    emissive: COLORS.cyan,
    transparent: true,
    opacity: 0.94
  };
  const materials = {
    shell: makeStandard(COLORS.shell, { roughness: 0.58, metalness: 0.12 }),
    shellShade: makeStandard(COLORS.shellShade, { roughness: 0.5, metalness: 0.22 }),
    green: makeStandard(COLORS.green, { roughness: 0.5, metalness: 0.18 }),
    greenDark: makeStandard(COLORS.greenDark, { roughness: 0.4, metalness: 0.3 }),
    orange: makeStandard(COLORS.orange, { roughness: 0.42, metalness: 0.12 }),
    face: makeStandard(COLORS.face, { roughness: 0.12, metalness: 0.34 }),
    joint: makeStandard(COLORS.joint, { roughness: 0.38, metalness: 0.52 }),
    expression: makeStandard(COLORS.cyan, { ...emissiveBase, emissiveIntensity: 1.55, transparent: false, opacity: 1 }),
    scanner: makeStandard(0x8ce7f5, { ...emissiveBase, emissiveIntensity: 0.72 }),
    hover: makeStandard(0x8ce7f5, { ...emissiveBase, emissiveIntensity: 0.92 }),
    lamp: makeStandard(0xbaf4ff, { ...emissiveBase, emissiveIntensity: 0.82 })
  };

  const body = addMesh(root, new THREE.SphereGeometry(0.5, 20, 14), materials.shell, {
    name: 'sprout-spherical-shell',
    position: [0, 0.04, 0],
    scale: [1.06, 1, 1]
  });

  for (const side of [-1, 1]) {
    const panel = addMesh(root, new THREE.SphereGeometry(0.515, 12, 8), materials.green, {
      name: `sprout-side-panel-${side < 0 ? 'left' : 'right'}`,
      position: [side * 0.39, 0.055, -0.015],
      scale: [0.2, 0.62, 0.47]
    });
    panel.rotation.z = side * -0.08;
  }

  const lowerBand = addMesh(root, new THREE.TorusGeometry(0.425, 0.035, 7, 20), materials.orange, {
    name: 'sprout-orange-shell-band',
    position: [0, -0.205, 0],
    rotation: [Math.PI / 2, 0, 0]
  });
  lowerBand.scale.z = 0.92;

  // The face is nested into the spherical shell instead of reading as a separate box.
  addMesh(root, new RoundedBoxGeometry(0.75, 0.49, 0.12, 4, 0.135), materials.shellShade, {
    name: 'sprout-face-frame',
    position: [0, 0.115, 0.405],
    rotation: [-0.035, 0, 0],
    scale: [1, 0.98, 0.78]
  });
  addMesh(root, new RoundedBoxGeometry(0.69, 0.43, 0.075, 4, 0.12), materials.greenDark, {
    name: 'sprout-face-liner',
    position: [0, 0.115, 0.447],
    rotation: [-0.035, 0, 0],
    shadow: false
  });
  addMesh(root, new RoundedBoxGeometry(0.635, 0.375, 0.04, 4, 0.105), materials.face, {
    name: 'sprout-face-screen',
    position: [0, 0.115, 0.49],
    rotation: [-0.035, 0, 0],
    shadow: false
  });

  // Arc-shaped eyes carry more character than circular dots and echo the approved concept.
  const eyeLeft = addMesh(root, new THREE.TorusGeometry(0.064, 0.017, 6, 12, Math.PI), materials.expression, {
    name: 'sprout-eye-left',
    position: [-0.145, 0.18, 0.518],
    scale: [1, 0.72, 0.6],
    shadow: false
  });
  const eyeRight = addMesh(root, new THREE.TorusGeometry(0.064, 0.017, 6, 12, Math.PI), materials.expression, {
    name: 'sprout-eye-right',
    position: [0.145, 0.18, 0.518],
    scale: [1, 0.72, 0.6],
    shadow: false
  });
  const mouth = addMesh(root, new THREE.TorusGeometry(0.055, 0.01, 5, 12, Math.PI), materials.expression, {
    name: 'sprout-expression-mouth',
    position: [0, 0.055, 0.52],
    rotation: [0, 0, Math.PI],
    scale: [1, 0.66, 1],
    shadow: false
  });

  const finLeft = addMesh(root, new THREE.SphereGeometry(0.11, 10, 8), materials.green, {
    name: 'sprout-leaf-fin-left',
    position: [-0.18, 0.56, -0.015],
    rotation: [0.05, 0.18, -0.38],
    scale: [0.85, 1.85, 0.4]
  });
  const finRight = addMesh(root, new THREE.SphereGeometry(0.11, 10, 8), materials.green, {
    name: 'sprout-leaf-fin-right',
    position: [0.18, 0.56, -0.015],
    rotation: [0.05, -0.18, 0.38],
    scale: [0.85, 1.85, 0.4]
  });
  addMesh(root, new THREE.BoxGeometry(0.08, 0.035, 0.018), materials.orange, {
    name: 'sprout-fin-02-mark',
    position: [0.22, 0.605, 0.065],
    rotation: [0.02, -0.18, 0.38],
    shadow: false
  });

  // Mount the scanner high on the front-left quarter so it reads clearly from gameplay camera angles.
  const scannerMount = new THREE.Group();
  scannerMount.name = 'sprout-scanner-mount';
  scannerMount.position.set(-0.36, 0.33, 0.31);
  scannerMount.rotation.set(-0.05, -0.48, -0.12);
  root.add(scannerMount);
  addMesh(scannerMount, new THREE.CylinderGeometry(0.125, 0.135, 0.155, 10), materials.greenDark, {
    name: 'sprout-scanning-lens-housing',
    rotation: [Math.PI / 2, 0, 0]
  });
  addMesh(scannerMount, new THREE.TorusGeometry(0.091, 0.018, 6, 12), materials.orange, {
    name: 'sprout-scanning-lens-ring',
    position: [0, 0, 0.085],
    shadow: false
  });
  const scannerLens = addMesh(scannerMount, new THREE.CircleGeometry(0.072, 12), materials.scanner, {
    name: 'sprout-scanning-lens',
    position: [0, 0, 0.105],
    shadow: false
  });
  addMesh(scannerMount, new THREE.CylinderGeometry(0.035, 0.045, 0.14, 7), materials.joint, {
    name: 'sprout-scanner-hinge',
    position: [0.055, -0.1, -0.055],
    rotation: [0.25, 0, -0.42]
  });

  const backpack = addMesh(root, new RoundedBoxGeometry(0.36, 0.36, 0.2, 2, 0.07), materials.greenDark, {
    name: 'sprout-removable-back-module',
    position: [0, 0.015, -0.49],
    rotation: [0.02, 0, 0]
  });
  backpack.scale.x = 0.92;
  addMesh(root, new THREE.BoxGeometry(0.18, 0.07, 0.025), materials.orange, {
    name: 'sprout-back-module-latch',
    position: [0, 0.105, -0.584]
  });

  for (const [width, height] of [[0.12, 0.035], [0.035, 0.12]]) {
    addMesh(root, new THREE.BoxGeometry(width, height, 0.012), materials.shell, {
      name: `sprout-medical-mark-${width > height ? 'horizontal' : 'vertical'}`,
      position: [0, -0.035, -0.597],
      shadow: false
    });
  }
  addMesh(root, new THREE.SphereGeometry(0.035, 8, 6), materials.shell, {
    name: 'sprout-screen-glint',
    position: [-0.245, 0.255, 0.515],
    scale: [1.2, 0.36, 0.12],
    shadow: false
  });

  const leftArm = createArm({ side: -1, materials });
  const rightArm = createArm({ side: 1, materials });
  root.add(leftArm, rightArm);

  const hoverAssembly = new THREE.Group();
  hoverAssembly.name = 'sprout-hover-assembly';
  hoverAssembly.position.y = -0.47;
  root.add(hoverAssembly);

  const hoverRing = addMesh(hoverAssembly, new THREE.TorusGeometry(0.34, 0.055, 8, 22), materials.hover, {
    name: 'sprout-antigrav-ring',
    rotation: [Math.PI / 2, 0, 0],
    shadow: false
  });
  const hoverInnerRing = addMesh(hoverAssembly, new THREE.TorusGeometry(0.235, 0.025, 6, 18), materials.hover, {
    name: 'sprout-antigrav-inner-ring',
    position: [0, -0.03, 0],
    rotation: [Math.PI / 2, 0, 0],
    shadow: false
  });
  addMesh(hoverAssembly, new THREE.CylinderGeometry(0.22, 0.27, 0.105, 12), materials.greenDark, {
    name: 'sprout-hover-core',
    position: [0, 0.03, 0]
  });

  const stabilizerPods = [];
  for (let index = 0; index < 3; index += 1) {
    const angle = index * (Math.PI * 2 / 3) + Math.PI / 6;
    const podRoot = new THREE.Group();
    podRoot.name = `sprout-stabilizer-root-${index + 1}`;
    podRoot.position.set(Math.cos(angle) * 0.43, -0.02, Math.sin(angle) * 0.43);
    podRoot.userData.baseY = podRoot.position.y;
    podRoot.userData.phase = 0.55 + index * 2.17;
    hoverAssembly.add(podRoot);

    addMesh(podRoot, new THREE.SphereGeometry(0.095, 8, 6), materials.shellShade, {
      name: `sprout-stabilizer-pod-${index + 1}`,
      scale: [1, 0.75, 1]
    });
    addMesh(podRoot, new THREE.TorusGeometry(0.074, 0.014, 5, 12), materials.hover, {
      name: `sprout-stabilizer-ring-${index + 1}`,
      position: [0, -0.075, 0],
      rotation: [Math.PI / 2, 0, 0],
      shadow: false
    });
    addMesh(podRoot, new THREE.SphereGeometry(0.042, 7, 5), materials.hover, {
      name: `sprout-stabilizer-glow-${index + 1}`,
      position: [0, -0.09, 0],
      shadow: false
    });
    stabilizerPods.push(podRoot);
  }

  // Keep the stronger body bob presentation-only by moving the authored model under
  // an internal motion root. The outer companion root remains owned by gameplay.
  const motionRoot = new THREE.Group();
  motionRoot.name = 'sprout-presentation-motion-root';
  const presentationChildren = [...root.children];
  for (const child of presentationChildren) motionRoot.add(child);
  root.add(motionRoot);

  root.userData.faceGlow = eyeLeft;
  root.userData.expressionMaterial = materials.expression;
  root.userData.scannerMaterial = materials.scanner;
  root.userData.hoverMaterial = materials.hover;
  root.userData.utilityLamp = leftArm.userData.utilityLamp ?? null;
  root.userData.leftArm = leftArm;
  root.userData.rightArm = rightArm;
  root.userData.finLeft = finLeft;
  root.userData.finRight = finRight;
  root.userData.motionRoot = motionRoot;
  root.userData.hoverAssembly = hoverAssembly;
  root.userData.hoverRing = hoverRing;
  root.userData.hoverInnerRing = hoverInnerRing;
  root.userData.stabilizerPods = stabilizerPods;
  root.userData.scannerMount = scannerMount;
  root.userData.scannerLens = scannerLens;
  root.userData.eyeLeft = eyeLeft;
  root.userData.eyeRight = eyeRight;
  root.userData.mouth = mouth;
  root.userData.body = body;

  return root;
}

export function updateSproutVisual(root, elapsed, {
  powered = true,
  scanning = false
} = {}) {
  if (!root?.userData?.sproutProductionVisual) return;

  const expression = root.userData.expressionMaterial;
  const scanner = root.userData.scannerMaterial;
  const hover = root.userData.hoverMaterial;
  const powerPulse = 0.5 + 0.5 * Math.sin(elapsed * 4.4);
  const scanPulse = 0.5 + 0.5 * Math.sin(elapsed * 10.5);

  if (expression) expression.emissiveIntensity = powered ? 1.45 + powerPulse * 0.5 : 0.08;
  if (hover) hover.emissiveIntensity = powered ? 0.9 + powerPulse * 0.55 : 0.12;
  if (scanner) scanner.emissiveIntensity = powered
    ? (scanning ? 1.55 + scanPulse * 0.8 : 0.62 + powerPulse * 0.3)
    : 0.05;

  const utilityLamp = root.userData.utilityLamp;
  if (utilityLamp?.material) {
    utilityLamp.material.emissiveIntensity = powered
      ? (scanning ? 1.9 : 0.8 + powerPulse * 0.35)
      : 0.04;
  }

  const motionRoot = root.userData.motionRoot;
  if (motionRoot) {
    motionRoot.position.y = Math.sin(elapsed * MOTION.bodyBobFrequency) * MOTION.bodyBobAmplitude
      + Math.sin(elapsed * 0.73 + 0.8) * MOTION.bodyBobSecondaryAmplitude;
    motionRoot.rotation.z = Math.sin(elapsed * 0.95 + 0.2) * MOTION.bodySwayAmplitude;
    motionRoot.rotation.x = Math.sin(elapsed * 0.71 + 1.2) * MOTION.bodyPitchAmplitude;
  }

  const hoverAssembly = root.userData.hoverAssembly;
  if (hoverAssembly) {
    hoverAssembly.rotation.y = elapsed * MOTION.hoverSpinSpeed;
    hoverAssembly.rotation.z = Math.sin(elapsed * 0.88 + 0.4) * 0.025;
  }

  const hoverRing = root.userData.hoverRing;
  const hoverInnerRing = root.userData.hoverInnerRing;
  if (hoverRing) {
    hoverRing.position.y = Math.sin(elapsed * 1.43) * MOTION.ringBobAmplitude;
    hoverRing.rotation.z = Math.sin(elapsed * 0.96 + 0.3) * MOTION.ringTiltAmplitude;
  }
  if (hoverInnerRing) {
    hoverInnerRing.position.y = -0.03 + Math.sin(elapsed * 1.19 + 1.7) * MOTION.innerRingBobAmplitude;
    hoverInnerRing.rotation.z = -Math.sin(elapsed * 1.08 + 1.1) * MOTION.innerRingTiltAmplitude;
  }

  const stabilizerPods = root.userData.stabilizerPods ?? [];
  stabilizerPods.forEach((pod, index) => {
    const phase = pod.userData.phase ?? index * 2.17;
    const irregular = Math.sin(elapsed * (1.18 + index * 0.09) + phase) * MOTION.podPrimaryAmplitude
      + Math.sin(elapsed * (2.61 + index * 0.13) + phase * 1.7) * MOTION.podSecondaryAmplitude;
    pod.position.y = (pod.userData.baseY ?? -0.02) + irregular;
    pod.rotation.z = Math.sin(elapsed * 0.72 + phase) * MOTION.podTiltAmplitude;
    pod.rotation.x = Math.sin(elapsed * 0.61 + phase * 1.35) * MOTION.podTiltAmplitude * 0.62;
  });

  const finLeft = root.userData.finLeft;
  const finRight = root.userData.finRight;
  if (finLeft) {
    finLeft.rotation.z = -0.38 - Math.sin(elapsed * 1.7) * MOTION.finSwingAmplitude;
    finLeft.rotation.x = 0.05 + Math.sin(elapsed * 1.13 + 0.5) * MOTION.finPitchAmplitude;
  }
  if (finRight) {
    finRight.rotation.z = 0.38 + Math.sin(elapsed * 1.7) * MOTION.finSwingAmplitude;
    finRight.rotation.x = 0.05 + Math.sin(elapsed * 1.13 + 1.15) * MOTION.finPitchAmplitude;
  }

  const leftArm = root.userData.leftArm;
  const rightArm = root.userData.rightArm;
  if (leftArm) {
    leftArm.rotation.x = Math.sin(elapsed * 1.45) * MOTION.armSwingAmplitude;
    leftArm.rotation.z = (leftArm.userData.baseZRotation ?? 0.18)
      + Math.sin(elapsed * 1.12 - 0.4) * MOTION.armRollAmplitude;
    leftArm.position.y = (leftArm.userData.baseY ?? -0.02)
      - Math.sin(elapsed * 2.05 - 0.56) * MOTION.armBobAmplitude
      + Math.sin(elapsed * 0.83 + 0.4) * MOTION.armSecondaryBobAmplitude;
  }
  if (rightArm) {
    rightArm.rotation.x = -Math.sin(elapsed * 1.45) * MOTION.armSwingAmplitude;
    rightArm.rotation.z = (rightArm.userData.baseZRotation ?? -0.18)
      - Math.sin(elapsed * 1.08 - 0.72) * MOTION.armRollAmplitude;
    rightArm.position.y = (rightArm.userData.baseY ?? -0.02)
      - Math.sin(elapsed * 2.05 - 0.74) * MOTION.armBobAmplitude * 0.92
      + Math.sin(elapsed * 0.91 + 1.2) * MOTION.armSecondaryBobAmplitude;
  }

  const eyeLeft = root.userData.eyeLeft;
  const eyeRight = root.userData.eyeRight;
  const eyeSquint = powered ? (scanning ? 0.58 : 0.72 + Math.sin(elapsed * 1.1) * 0.035) : 0.18;
  if (eyeLeft) {
    eyeLeft.scale.y = eyeSquint;
    eyeLeft.rotation.z = scanning ? 0.08 : 0;
  }
  if (eyeRight) {
    eyeRight.scale.y = eyeSquint;
    eyeRight.rotation.z = scanning ? -0.08 : 0;
  }

  const mouth = root.userData.mouth;
  if (mouth) {
    mouth.scale.x = scanning ? 0.78 : 1;
    mouth.scale.y = powered ? (scanning ? 0.45 : 0.66 + powerPulse * 0.045) : 0.22;
  }
}

export function disposeSproutVisual(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  root.parent?.remove(root);
}
