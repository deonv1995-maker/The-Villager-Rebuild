import * as THREE from 'three';

const POLISH_REVISION = 'scout-polish-v2';

const DETAIL_PALETTE = Object.freeze({
  tunicLight: 0x78885a,
  scarfLight: 0x566f3c,
  creamShadow: 0xbeb6a3,
  leatherLight: 0x7a5638,
  leatherEdge: 0x4b3326,
  sole: 0x2e2824,
  eyeWhite: 0xe7e0d2,
  pupil: 0x252321,
  mouth: 0x70483d,
  metal: 0xb1aa98
});

function material(color, { metalness = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: metalness > 0 ? 0.72 : 0.96,
    metalness,
    flatShading: true
  });
}

function detailMesh(geometry, mat, name) {
  const result = new THREE.Mesh(geometry, mat);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
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

function addFaceDetails(root, mats) {
  const head = root.getObjectByName('scout-head');
  if (!head) return;

  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    const eye = root.getObjectByName(`scout-eye-${side}`);
    if (eye) {
      eye.material = mats.eyeWhite;
      eye.scale.set(1.08, 0.92, 0.7);
    }
    addBox(head, mats.pupil, `scout-${side}-pupil`, [0.03, 0.045, 0.018], [sign * 0.09, 0.02, 0.265]);
    addBox(
      head,
      mats.hair,
      `scout-${side}-eyebrow`,
      [0.09, 0.018, 0.02],
      [sign * 0.09, 0.105, 0.258],
      [0, 0, sign * -0.08]
    );
  }

  addCone(head, mats.skin, 'scout-nose', 0.045, 0.085, [0, -0.018, 0.277], [Math.PI / 2, 0, 0], 4);
  addBox(head, mats.mouth, 'scout-mouth', [0.085, 0.014, 0.014], [0, -0.105, 0.255], [0, 0, -0.04]);

  addCone(head, mats.hair, 'scout-hair-side-left', 0.1, 0.24, [-0.255, 0.145, 0.015], [0.12, 0, -0.75], 4);
  addCone(head, mats.hair, 'scout-hair-side-right', 0.1, 0.24, [0.255, 0.145, 0.015], [0.12, 0, 0.75], 4);
  addCone(head, mats.hair, 'scout-hair-back-lock', 0.115, 0.3, [0.02, 0.12, -0.255], [-0.7, 0, 0.04], 5);
}

function addTorsoDetails(root, mats) {
  const torso = root.getObjectByName('scout-tunic');
  const belt = root.getObjectByName('scout-belt');
  const strap = root.getObjectByName('scout-crossbody-strap');

  addBox(torso, mats.creamShadow, 'scout-collar-left', [0.2, 0.055, 0.045], [-0.075, 0.255, 0.295], [0.05, 0, -0.52]);
  addBox(torso, mats.creamShadow, 'scout-collar-right', [0.2, 0.055, 0.045], [0.075, 0.255, 0.295], [0.05, 0, 0.52]);

  addBox(torso, mats.tunicLight, 'scout-tunic-front-flap', [0.24, 0.28, 0.055], [0, -0.405, 0.19], [-0.05, 0, 0]);
  addBox(torso, mats.tunicLight, 'scout-tunic-left-flap', [0.18, 0.25, 0.05], [-0.255, -0.39, 0.04], [0, -0.4, -0.12]);
  addBox(torso, mats.tunicLight, 'scout-tunic-right-flap', [0.18, 0.25, 0.05], [0.255, -0.39, 0.04], [0, 0.4, 0.12]);

  addBox(belt, mats.metal, 'scout-belt-buckle', [0.13, 0.13, 0.045], [0, 0, 0.385]);
  addBox(belt, mats.leatherLight, 'scout-belt-pouch', [0.19, 0.19, 0.14], [-0.3, -0.035, 0.12], [0, 0.2, -0.08]);

  addBox(strap, mats.metal, 'scout-strap-clasp', [0.1, 0.12, 0.075], [0, -0.12, 0.01], [0, 0, 0.03]);
}

function addScarfDetails(root, mats) {
  const scarf = root.getObjectByName('scout-scarf');
  if (!scarf) return;

  addBox(scarf, mats.scarfLight, 'scout-scarf-knot', [0.17, 0.15, 0.13], [0, -0.04, 0.325], [0.08, 0, 0.08]);
  addBox(scarf, mats.scarfLight, 'scout-scarf-tail-left', [0.12, 0.34, 0.07], [-0.075, -0.22, 0.25], [0.12, 0.02, -0.12]);
  addBox(scarf, mats.scarfLight, 'scout-scarf-tail-right', [0.1, 0.29, 0.065], [0.085, -0.205, 0.245], [0.08, -0.02, 0.16]);
  addCylinder(scarf, mats.metal, 'scout-cape-clasp-left', 0.04, 0.04, 0.025, [-0.235, 0.015, 0.285], [Math.PI / 2, 0, 0], 6);
  addCylinder(scarf, mats.metal, 'scout-cape-clasp-right', 0.04, 0.04, 0.025, [0.235, 0.015, 0.285], [Math.PI / 2, 0, 0], 6);
}

function addLimbDetails(root, mats) {
  for (const side of ['left', 'right']) {
    const upperArm = root.getObjectByName(`scout-${side}-upper-arm`);
    const lowerArm = root.getObjectByName(`scout-${side}-lower-arm`);
    const boot = root.getObjectByName(`scout-${side}-boot`);
    const cuff = root.getObjectByName(`scout-${side}-boot-cuff`);

    addCylinder(upperArm, mats.tunicLight, `scout-${side}-tunic-sleeve`, 0.145, 0.135, 0.42, [0, -0.29, 0], [0, 0, 0], 5);
    addCylinder(lowerArm, mats.leatherLight, `scout-${side}-forearm-wrap`, 0.112, 0.1, 0.34, [0, 0.32, 0], [0, 0, 0], 5);

    if (cuff && mats.creamShadow) cuff.material = mats.creamShadow;
    if (boot) {
      addBox(boot, mats.sole, `scout-${side}-boot-sole`, [0.29, 0.08, 0.48], [0, -0.17, 0.025]);
      addBox(boot, mats.leatherLight, `scout-${side}-boot-toe`, [0.27, 0.17, 0.2], [0, -0.025, 0.22], [-0.08, 0, 0]);
      boot.scale.set(1.08, 1.03, 1.12);
    }
  }
}

function addSatchelDetails(root, mats) {
  const satchel = root.getObjectByName('scout-satchel');
  if (!satchel) return;
  addBox(satchel, mats.leatherEdge, 'scout-satchel-bottom-band', [0.35, 0.055, 0.19], [0, -0.19, 0]);
  addBox(satchel, mats.metal, 'scout-satchel-rivet', [0.035, 0.035, 0.025], [0, 0.065, 0.112]);
}

function addCapeDetails(root, mats) {
  const cape = root.getObjectByName('scout-cape');
  if (!cape) return;
  addBox(cape, mats.scarfLight, 'scout-cape-center-seam', [0.035, 0.61, 0.018], [0, -0.34, 0.012], [0, 0, 0.02]);
  addBox(cape, mats.scarfLight, 'scout-cape-left-hem', [0.22, 0.055, 0.02], [-0.255, -0.68, 0.008], [0, 0, -0.11]);
  addBox(cape, mats.scarfLight, 'scout-cape-right-hem', [0.22, 0.055, 0.02], [0.255, -0.68, 0.008], [0, 0, 0.11]);
}

export function applyScoutVisualPolish(presentation) {
  const root = presentation?.visualRoot;
  if (!presentation?.rigReady || !root || root.userData.visualRevision === POLISH_REVISION) return;

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
    skin: presentation.materials?.skin ?? material(0xd59b72),
    hair: presentation.materials?.hair ?? material(0x563824)
  };

  addFaceDetails(root, mats);
  addTorsoDetails(root, mats);
  addScarfDetails(root, mats);
  addLimbDetails(root, mats);
  addSatchelDetails(root, mats);
  addCapeDetails(root, mats);

  presentation.visualPolishMaterials = mats;
  root.userData.visualRevision = POLISH_REVISION;
  root.userData.visualMeshBudget = 72;
}

export class PolishedScoutCharacterPresentation {
  constructor({ basePresentation }) {
    this.basePresentation = basePresentation;
    applyScoutVisualPolish(basePresentation);
  }
}
