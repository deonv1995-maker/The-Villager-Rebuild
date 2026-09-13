import * as THREE from 'three';
import { ScoutCharacterPresentation } from './ScoutCharacterPresentation.js';

const POLISH_REVISION = 'scout-polish-v2';

const MOCKUP_SILHOUETTE = Object.freeze({
  headRadius: 0.31,
  torsoShoulderRadius: 0.39,
  torsoWaistRadius: 0.31,
  scarfOuterRadius: 0.46,
  capeLength: 0.58,
  bootDepth: 0.48
});

const DETAIL_PALETTE = Object.freeze({
  tunicLight: 0x82915f,
  scarfLight: 0x5a7140,
  creamShadow: 0xd1c7b0,
  leatherLight: 0x8a5e3d,
  leatherEdge: 0x513629,
  sole: 0x342b25,
  eyeWhite: 0xf2ead9,
  pupil: 0x242220,
  mouth: 0x7d4b40,
  metal: 0xbdb5a4,
});

function material(color, { metalness = 0, side = THREE.FrontSide } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: metalness > 0 ? 0.72 : 0.96,
    metalness,
    flatShading: true,
    side
  });
}

function detailMesh(geometry, mat, name) {
  const result = new THREE.Mesh(geometry, mat);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function replaceGeometry(object, geometry) {
  if (!object) return;
  object.geometry?.dispose?.();
  object.geometry = geometry;
}

function addBox(parent, mat, name, size, position, rotation = [0, 0, 0]) {
  if (!parent) return null;
  const result = detailMesh(new THREE.BoxGeometry(...size), mat, name);
  result.position.set(...position);
  result.rotation.set(...rotation);
  parent.add(result);
  return result;
}

function addCone(parent, mat, name, radius, height, position, rotation = [0, 0, 0], radialSegments = 4) {
  if (!parent) return null;
  const result = detailMesh(new THREE.ConeGeometry(radius, height, radialSegments), mat, name);
  result.position.set(...position);
  result.rotation.set(...rotation);
  parent.add(result);
  return result;
}

function addCylinder(parent, mat, name, radiusTop, radiusBottom, height, position, rotation = [0, 0, 0], radialSegments = 6) {
  if (!parent) return null;
  const result = detailMesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1),
    mat,
    name
  );
  result.position.set(...position);
  result.rotation.set(...rotation);
  parent.add(result);
  return result;
}

function addTriangle(parent, mat, name, points) {
  if (!parent) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const result = detailMesh(geometry, mat, name);
  parent.add(result);
  return result;
}

function tuneBasePalette(presentation) {
  const mats = presentation.materials;
  if (!mats) return;
  mats.tunic.color.setHex(0x748254);
  mats.scarf.color.setHex(0x4c6338);
  mats.shirt.color.setHex(0xe2d9c6);
  mats.trousers.color.setHex(0x51443b);
  mats.leather.color.setHex(0x765039);
  mats.leatherDark.color.setHex(0x43332b);
  mats.skin.color.setHex(0xe1a077);
  mats.hair.color.setHex(0x5a3a28);
  mats.buckle.color.setHex(0xbdb5a4);
}

function rebuildHair(root, mats) {
  const head = root.getObjectByName('scout-head');
  const hairCap = root.getObjectByName('scout-hair-cap');
  if (!head || !hairCap) return;

  replaceGeometry(hairCap, new THREE.DodecahedronGeometry(0.33, 0));
  hairCap.scale.set(1.05, 0.64, 1.03);
  hairCap.position.set(0, 0.205, -0.015);

  for (const child of [...head.children]) {
    if (child.name !== 'scout-hair-spike') continue;
    child.removeFromParent();
    child.geometry?.dispose?.();
  }

  const locks = [
    [-0.19, 0.27, 0.18, 0.88, 0, -0.5, 0.12, 0.31],
    [-0.06, 0.31, 0.22, 1.02, 0, -0.16, 0.125, 0.33],
    [0.09, 0.31, 0.2, 0.9, 0, 0.24, 0.12, 0.31],
    [-0.2, 0.37, 0.03, 0.38, 0, -0.55, 0.115, 0.3],
    [0.18, 0.36, 0.02, 0.34, 0, 0.55, 0.115, 0.3]
  ];

  for (const [x, y, z, rx, ry, rz, radius, height] of locks) {
    addCone(head, mats.hair, 'scout-hair-spike', radius, height, [x, y, z], [rx, ry, rz], 4);
  }
}

function tuneBaseSilhouette(presentation, mats) {
  const root = presentation.visualRoot;
  const torso = root.getObjectByName('scout-tunic');
  const scarf = root.getObjectByName('scout-scarf');
  const strap = root.getObjectByName('scout-crossbody-strap');
  const chestPanel = root.getObjectByName('scout-shirt-collar');

  replaceGeometry(
    torso,
    new THREE.CylinderGeometry(
      MOCKUP_SILHOUETTE.torsoShoulderRadius,
      MOCKUP_SILHOUETTE.torsoWaistRadius,
      0.72,
      6,
      1
    )
  );

  if (presentation.head) {
    replaceGeometry(presentation.head, new THREE.DodecahedronGeometry(MOCKUP_SILHOUETTE.headRadius, 0));
    presentation.head.scale.set(0.98, 1.06, 0.92);
  }

  const leftEye = root.getObjectByName('scout-eye-left');
  const rightEye = root.getObjectByName('scout-eye-right');
  if (leftEye && rightEye) {
    leftEye.geometry?.dispose?.();
    const eyeGeometry = new THREE.BoxGeometry(0.075, 0.1, 0.028);
    leftEye.geometry = eyeGeometry;
    rightEye.geometry = eyeGeometry;
    leftEye.position.set(-0.1, 0.015, 0.286);
    rightEye.position.set(0.1, 0.015, 0.286);
  }

  rebuildHair(root, mats);

  replaceGeometry(
    scarf,
    new THREE.CylinderGeometry(0.4, MOCKUP_SILHOUETTE.scarfOuterRadius, 0.26, 6, 1)
  );

  if (chestPanel) replaceGeometry(chestPanel, new THREE.BoxGeometry(0.38, 0.115, 0.07));
  if (strap) replaceGeometry(strap, new THREE.BoxGeometry(0.09, 0.98, 0.06));

  if (presentation.satchelGroup) presentation.satchelGroup.scale.set(1.12, 1.08, 1.1);
  const bag = root.getObjectByName('scout-satchel-bag');
  const flap = root.getObjectByName('scout-satchel-flap');
  const buckle = root.getObjectByName('scout-satchel-buckle');
  if (bag) {
    replaceGeometry(bag, new THREE.BoxGeometry(0.38, 0.44, 0.2));
    bag.position.z = 0.08;
  }
  if (flap) {
    replaceGeometry(flap, new THREE.BoxGeometry(0.4, 0.16, 0.215));
    flap.position.set(0, 0.15, 0.08);
  }
  if (buckle) {
    replaceGeometry(buckle, new THREE.BoxGeometry(0.09, 0.08, 0.032));
    buckle.position.set(0, 0.12, 0.205);
  }

  const cape = root.getObjectByName('scout-cape');
  if (cape) {
    const capeGeometry = new THREE.BufferGeometry();
    capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.36, 0, 0,
      0.36, 0, 0,
      -0.42, -0.3, -0.02,
      0.42, -0.3, -0.02,
      -0.24, -MOCKUP_SILHOUETTE.capeLength, -0.045,
      0.24, -MOCKUP_SILHOUETTE.capeLength, -0.045
    ], 3));
    capeGeometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
    capeGeometry.computeVertexNormals();
    replaceGeometry(cape, capeGeometry);
  }

  for (const side of ['left', 'right']) {
    const boot = root.getObjectByName(`scout-${side}-boot`);
    if (boot) {
      replaceGeometry(boot, new THREE.BoxGeometry(0.29, 0.3, MOCKUP_SILHOUETTE.bootDepth));
      boot.scale.set(1.1, 1.04, 1.15);
    }
    const cuff = root.getObjectByName(`scout-${side}-boot-cuff`);
    if (cuff) replaceGeometry(cuff, new THREE.CylinderGeometry(0.16, 0.18, 0.19, 5, 1));
  }
}

function addFaceDetails(root, mats) {
  const head = root.getObjectByName('scout-head');
  if (!head) return;

  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    const eye = root.getObjectByName(`scout-eye-${side}`);
    if (eye) {
      eye.material = mats.eyeWhite;
      eye.scale.set(1, 1, 0.8);
    }
    addBox(head, mats.pupil, `scout-${side}-pupil`, [0.036, 0.064, 0.018], [sign * 0.1, 0.012, 0.307]);
    addBox(
      head,
      mats.hair,
      `scout-${side}-eyebrow`,
      [0.105, 0.02, 0.022],
      [sign * 0.1, 0.105, 0.296],
      [0, 0, sign * -0.08]
    );
  }

  addCone(head, mats.skin, 'scout-nose', 0.048, 0.09, [0, -0.025, 0.315], [Math.PI / 2, 0, 0], 4);
  addBox(head, mats.mouth, 'scout-mouth', [0.095, 0.014, 0.015], [0, -0.112, 0.294], [0, 0, -0.03]);

  addCone(head, mats.hair, 'scout-hair-side-left', 0.105, 0.27, [-0.27, 0.16, 0.015], [0.16, 0, -0.82], 4);
  addCone(head, mats.hair, 'scout-hair-side-right', 0.105, 0.27, [0.27, 0.16, 0.015], [0.16, 0, 0.82], 4);
  addCone(head, mats.hair, 'scout-hair-back-lock', 0.12, 0.31, [0.02, 0.13, -0.27], [-0.78, 0, 0.04], 5);
}

function addTorsoDetails(root, mats) {
  const torso = root.getObjectByName('scout-tunic');
  const belt = root.getObjectByName('scout-belt');
  const strap = root.getObjectByName('scout-crossbody-strap');

  addBox(torso, mats.creamShadow, 'scout-collar-left', [0.22, 0.06, 0.05], [-0.085, 0.26, 0.35], [0.06, 0, -0.5]);
  addBox(torso, mats.creamShadow, 'scout-collar-right', [0.22, 0.06, 0.05], [0.085, 0.26, 0.35], [0.06, 0, 0.5]);

  addBox(torso, mats.tunicLight, 'scout-tunic-front-flap', [0.22, 0.3, 0.06], [0, -0.41, 0.245], [-0.06, 0, 0]);
  addBox(torso, mats.tunicLight, 'scout-tunic-left-flap', [0.2, 0.29, 0.055], [-0.25, -0.4, 0.12], [0.02, -0.34, -0.12]);
  addBox(torso, mats.tunicLight, 'scout-tunic-right-flap', [0.2, 0.29, 0.055], [0.25, -0.4, 0.12], [0.02, 0.34, 0.12]);

  addBox(belt, mats.metal, 'scout-belt-buckle', [0.145, 0.145, 0.05], [0, 0, 0.385]);
  addBox(belt, mats.leatherLight, 'scout-belt-pouch', [0.2, 0.2, 0.15], [-0.31, -0.035, 0.12], [0, 0.2, -0.08]);

  addBox(strap, mats.metal, 'scout-strap-clasp', [0.1, 0.12, 0.075], [0, -0.12, 0.01], [0, 0, 0.03]);
}

function addScarfDetails(root, mats) {
  const scarf = root.getObjectByName('scout-scarf');
  if (!scarf) return;

  addBox(scarf, mats.scarfLight, 'scout-scarf-knot', [0.2, 0.14, 0.14], [0, -0.035, 0.405], [0.08, 0, 0.04]);
  addBox(scarf, mats.scarfLight, 'scout-scarf-tail-left', [0.14, 0.28, 0.075], [-0.12, -0.18, 0.31], [0.1, 0.04, -0.2]);
  addBox(scarf, mats.scarfLight, 'scout-scarf-tail-right', [0.12, 0.24, 0.07], [0.13, -0.17, 0.305], [0.08, -0.04, 0.2]);
  addCylinder(scarf, mats.metal, 'scout-cape-clasp-left', 0.04, 0.04, 0.025, [-0.25, 0, 0.34], [Math.PI / 2, 0, 0], 6);
  addCylinder(scarf, mats.metal, 'scout-cape-clasp-right', 0.04, 0.04, 0.025, [0.25, 0, 0.34], [Math.PI / 2, 0, 0], 6);
}

function addLimbDetails(root, mats) {
  for (const side of ['left', 'right']) {
    const upperArm = root.getObjectByName(`scout-${side}-upper-arm`);
    const lowerArm = root.getObjectByName(`scout-${side}-lower-arm`);
    const boot = root.getObjectByName(`scout-${side}-boot`);
    const cuff = root.getObjectByName(`scout-${side}-boot-cuff`);

    addCylinder(upperArm, mats.tunicLight, `scout-${side}-tunic-sleeve`, 0.15, 0.135, 0.44, [0, -0.28, 0], [0, 0, 0], 5);
    addCylinder(lowerArm, mats.leatherLight, `scout-${side}-forearm-wrap`, 0.115, 0.102, 0.34, [0, 0.31, 0], [0, 0, 0], 5);

    if (cuff) cuff.material = mats.creamShadow;
    if (boot) {
      addBox(boot, mats.sole, `scout-${side}-boot-sole`, [0.32, 0.08, 0.53], [0, -0.17, 0.025]);
      addBox(boot, mats.leatherLight, `scout-${side}-boot-toe`, [0.3, 0.18, 0.23], [0, -0.025, 0.235], [-0.08, 0, 0]);
    }
  }
}

function addSatchelDetails(root, mats) {
  const satchel = root.getObjectByName('scout-satchel');
  if (!satchel) return;
  addBox(satchel, mats.leatherEdge, 'scout-satchel-bottom-band', [0.39, 0.06, 0.21], [0, -0.2, 0.08]);
  addBox(satchel, mats.metal, 'scout-satchel-rivet', [0.04, 0.04, 0.028], [0, 0.065, 0.205]);
}

function addCapeDetails(root, mats) {
  const cape = root.getObjectByName('scout-cape');
  if (!cape) return;
  addBox(cape, mats.scarfLight, 'scout-cape-center-seam', [0.035, 0.48, 0.018], [0, -0.28, 0.012], [0, 0, 0.02]);
  addBox(cape, mats.scarfLight, 'scout-cape-left-hem', [0.2, 0.05, 0.02], [-0.2, -0.545, 0.008], [0, 0, -0.08]);
  addBox(cape, mats.scarfLight, 'scout-cape-right-hem', [0.2, 0.05, 0.02], [0.2, -0.545, 0.008], [0, 0, 0.08]);

  addTriangle(cape, mats.emblem, 'scout-cape-emblem-large', [
    [-0.1, -0.22, 0.02],
    [0, -0.06, 0.02],
    [0.09, -0.22, 0.02]
  ]);
  addTriangle(cape, mats.emblem, 'scout-cape-emblem-small', [
    [0.02, -0.22, 0.021],
    [0.09, -0.12, 0.021],
    [0.145, -0.22, 0.021]
  ]);
}

export function applyScoutVisualPolish(presentation) {
  const root = presentation?.visualRoot;
  if (!presentation?.rigReady || !root || root.userData.visualRevision === POLISH_REVISION) return;

  tuneBasePalette(presentation);

  const mats = {
    tunicLight: material(DETAIL_PALETTE.tunicLight),
    scarfLight: material(DETAIL_PALETTE.scarfLight),
    creamShadow: material(DETAIL_PALETTE.creamShadow),
    leatherLight: material(DETAIL_PALETTE.leatherLight),
    leatherEdge: material(DETAIL_PALETTE.leatherEdge),
    sole: material(DETAIL_PALETTE.sole),
    eyeWhite: material(DETAIL_PALETTE.eyeWhite),
    pupil: material(DETAIL_PALETTE.pupil),
    mouth: material(DETAIL_PALETTE.mouth),
    metal: material(DETAIL_PALETTE.metal, { metalness: 0.12 }),
    emblem: material(DETAIL_PALETTE.creamShadow, { side: THREE.DoubleSide }),
    skin: presentation.materials?.skin ?? material(0xe1a077),
    hair: presentation.materials?.hair ?? material(0x5a3a28)
  };

  tuneBaseSilhouette(presentation, mats);
  addFaceDetails(root, mats);
  addTorsoDetails(root, mats);
  addScarfDetails(root, mats);
  addLimbDetails(root, mats);
  addSatchelDetails(root, mats);
  addCapeDetails(root, mats);

  presentation.visualPolishMaterials = mats;
  root.userData.visualRevision = POLISH_REVISION;
  root.userData.visualMeshBudget = 72;
  root.userData.mockupTarget = 'approved-scout-sheet';
  root.userData.mockupSilhouette = { ...MOCKUP_SILHOUETTE };
}

export class PolishedScoutCharacterPresentation extends ScoutCharacterPresentation {
  constructor(options) {
    super(options);
    applyScoutVisualPolish(this);
  }
}
