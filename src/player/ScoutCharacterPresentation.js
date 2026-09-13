import * as THREE from 'three';

const QUIVER_NODE_NAME = 'Ranger_Quiver';
const UNIT_Y = new THREE.Vector3(0, 1, 0);

const PALETTE = Object.freeze({
  tunic: 0x667548,
  scarf: 0x455a31,
  shirt: 0xd8d0bc,
  trousers: 0x4b4038,
  leather: 0x65462f,
  leatherDark: 0x3e3028,
  skin: 0xd59b72,
  hair: 0x563824,
  eye: 0x242321,
  buckle: 0xa7a08f
});

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function material(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.96,
    metalness: 0,
    flatShading: true
  });
}

function mesh(geometry, mat, name) {
  const result = new THREE.Mesh(geometry, mat);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function findBone(root, patterns) {
  let best = null;
  let bestScore = -Infinity;
  root?.traverse?.(object => {
    if (!object.isBone || !object.name) return;
    const name = normalize(object.name);
    for (const pattern of patterns) {
      const tokens = pattern.tokens.map(normalize);
      if (!tokens.every(token => name.includes(token))) continue;
      if ((pattern.reject ?? []).some(token => name.includes(normalize(token)))) continue;
      let score = pattern.score ?? 0;
      if (tokens.some(token => name === token)) score += 8;
      score -= Math.max(0, name.length - tokens.join('').length) * 0.02;
      if (score > bestScore) {
        best = object;
        bestScore = score;
      }
    }
  });
  return best;
}

function sidePatterns(side, part) {
  const long = side === 'left' ? 'left' : 'right';
  const short = side === 'left' ? 'l' : 'r';
  const opposite = side === 'left' ? ['right'] : ['left'];
  const partAliases = {
    upperArm: ['upperarm', 'arm'],
    lowerArm: ['lowerarm', 'forearm'],
    hand: ['hand'],
    upperLeg: ['upperleg', 'thigh'],
    lowerLeg: ['lowerleg', 'calf', 'shin'],
    foot: ['foot']
  }[part];

  const patterns = [];
  for (const alias of partAliases) {
    const reject = [...opposite];
    if (part === 'upperArm' && alias === 'arm') reject.push('lower', 'fore');
    patterns.push({ tokens: [long, alias], reject, score: 12 });
    patterns.push({ tokens: [alias, short], reject, score: 8 });
    patterns.push({ tokens: [short, alias], reject, score: 7 });
  }
  return patterns;
}

export class ScoutCharacterPresentation {
  constructor({ player }) {
    this.player = player;
    this.model = player?.model ?? null;
    this.visualRoot = new THREE.Group();
    this.visualRoot.name = 'scout-low-poly-presentation';
    this.visualRoot.userData.characterIdentity = 'scout';
    this.sourceMeshes = [];
    this.bones = this.#resolveRig();
    this.rigReady = this.#isRigUsable();
    this.mode = this.rigReady ? 'scout-rigged' : 'legacy-ranger';

    this.rootWorldQuaternion = new THREE.Quaternion();
    this.tempWorldQuaternion = new THREE.Quaternion();
    this.tempLocalQuaternion = new THREE.Quaternion();
    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempMid = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.lastPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.capeTrail = 0;
    this.capeLift = 0;

    this.#removeUnusedQuiver();
    if (this.rigReady) {
      this.#hideSourceMeshes();
      this.#buildScout();
      this.player?.root?.add?.(this.visualRoot);
      this.player?.getPosition?.(this.lastPosition);
    }

    this.cameraModeUnsubscribe = this.player?.onCameraModeChange?.(() => this.#syncVisibility()) ?? null;
    this.#syncVisibility();
  }

  update(dt) {
    if (!this.rigReady || !Number.isFinite(dt) || dt <= 0) return;
    this.model?.updateMatrixWorld?.(true);
    this.player?.root?.updateMatrixWorld?.(true);
    this.player?.root?.getWorldQuaternion?.(this.rootWorldQuaternion);
    this.rootWorldQuaternion.invert();

    this.#updateTorso();
    this.#updateHead();
    this.#updateArm('left');
    this.#updateArm('right');
    this.#updateLeg('left');
    this.#updateLeg('right');
    this.#updateAccessories(dt);
  }

  #resolveRig() {
    const root = this.model;
    return {
      hips: findBone(root, [
        { tokens: ['pelvis'], score: 20 },
        { tokens: ['hips'], score: 18 },
        { tokens: ['hip'], reject: ['left', 'right'], score: 8 }
      ]),
      chest: findBone(root, [
        { tokens: ['chest'], score: 20 },
        { tokens: ['spine03'], score: 18 },
        { tokens: ['spine3'], score: 17 },
        { tokens: ['spine02'], score: 16 },
        { tokens: ['spine2'], score: 15 },
        { tokens: ['spine'], score: 6 }
      ]),
      head: findBone(root, [
        { tokens: ['head'], reject: ['slot'], score: 20 },
        { tokens: ['neck'], score: 5 }
      ]),
      left: {
        upperArm: findBone(root, sidePatterns('left', 'upperArm')),
        lowerArm: findBone(root, sidePatterns('left', 'lowerArm')),
        hand: findBone(root, sidePatterns('left', 'hand')),
        upperLeg: findBone(root, sidePatterns('left', 'upperLeg')),
        lowerLeg: findBone(root, sidePatterns('left', 'lowerLeg')),
        foot: findBone(root, sidePatterns('left', 'foot'))
      },
      right: {
        upperArm: findBone(root, sidePatterns('right', 'upperArm')),
        lowerArm: findBone(root, sidePatterns('right', 'lowerArm')),
        hand: findBone(root, sidePatterns('right', 'hand')),
        upperLeg: findBone(root, sidePatterns('right', 'upperLeg')),
        lowerLeg: findBone(root, sidePatterns('right', 'lowerLeg')),
        foot: findBone(root, sidePatterns('right', 'foot'))
      }
    };
  }

  #isRigUsable() {
    const { hips, chest, head, left, right } = this.bones;
    return Boolean(
      hips && chest && head
      && left.upperArm && left.lowerArm && left.hand
      && right.upperArm && right.lowerArm && right.hand
      && left.upperLeg && left.lowerLeg && left.foot
      && right.upperLeg && right.lowerLeg && right.foot
    );
  }

  #removeUnusedQuiver() {
    const quiver = this.model?.getObjectByName?.(QUIVER_NODE_NAME);
    quiver?.removeFromParent();
  }

  #hideSourceMeshes() {
    this.model?.traverse?.(object => {
      if (!object.isMesh) return;
      this.sourceMeshes.push(object);
      object.visible = false;
    });
  }

  #buildScout() {
    const mats = {
      tunic: material(PALETTE.tunic),
      scarf: material(PALETTE.scarf),
      shirt: material(PALETTE.shirt),
      trousers: material(PALETTE.trousers),
      leather: material(PALETTE.leather),
      leatherDark: material(PALETTE.leatherDark),
      skin: material(PALETTE.skin),
      hair: material(PALETTE.hair),
      eye: material(PALETTE.eye),
      buckle: material(PALETTE.buckle)
    };
    this.materials = mats;

    this.torso = mesh(new THREE.CylinderGeometry(0.31, 0.42, 0.72, 6, 1), mats.tunic, 'scout-tunic');
    this.belt = mesh(new THREE.CylinderGeometry(0.375, 0.375, 0.105, 6, 1), mats.leatherDark, 'scout-belt');
    this.chestPanel = mesh(new THREE.BoxGeometry(0.48, 0.1, 0.08), mats.shirt, 'scout-shirt-collar');
    this.visualRoot.add(this.torso, this.belt, this.chestPanel);

    this.headGroup = new THREE.Group();
    this.headGroup.name = 'scout-head';
    this.head = mesh(new THREE.IcosahedronGeometry(0.275, 1), mats.skin, 'scout-head-mesh');
    this.head.scale.set(0.92, 1.05, 0.9);
    this.headGroup.add(this.head);

    const leftEye = mesh(new THREE.BoxGeometry(0.055, 0.075, 0.025), mats.eye, 'scout-eye-left');
    const rightEye = leftEye.clone();
    rightEye.name = 'scout-eye-right';
    leftEye.position.set(-0.09, 0.025, 0.247);
    rightEye.position.set(0.09, 0.025, 0.247);
    this.headGroup.add(leftEye, rightEye);

    const hairCap = mesh(new THREE.IcosahedronGeometry(0.29, 1), mats.hair, 'scout-hair-cap');
    hairCap.scale.set(1.02, 0.58, 1.02);
    hairCap.position.y = 0.19;
    this.headGroup.add(hairCap);
    const spikeOffsets = [
      [-0.19, 0.32, 0.04, -0.32],
      [-0.07, 0.38, 0.08, -0.12],
      [0.08, 0.37, 0.07, 0.12],
      [0.2, 0.3, 0.02, 0.34],
      [0.02, 0.32, -0.17, 0.08]
    ];
    for (const [x, y, z, rz] of spikeOffsets) {
      const spike = mesh(new THREE.ConeGeometry(0.11, 0.3, 5), mats.hair, 'scout-hair-spike');
      spike.position.set(x, y, z);
      spike.rotation.z = rz;
      spike.rotation.x = -0.22;
      this.headGroup.add(spike);
    }
    this.visualRoot.add(this.headGroup);

    this.scarf = mesh(new THREE.CylinderGeometry(0.34, 0.39, 0.22, 6, 1), mats.scarf, 'scout-scarf');
    this.visualRoot.add(this.scarf);

    this.limbs = {
      left: this.#createLimbSet('left', mats),
      right: this.#createLimbSet('right', mats)
    };

    this.satchelGroup = new THREE.Group();
    this.satchelGroup.name = 'scout-satchel';
    const bag = mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), mats.leather, 'scout-satchel-bag');
    bag.rotation.z = 0.05;
    const flap = mesh(new THREE.BoxGeometry(0.36, 0.15, 0.195), mats.leatherDark, 'scout-satchel-flap');
    flap.position.y = 0.14;
    const buckle = mesh(new THREE.BoxGeometry(0.08, 0.07, 0.025), mats.buckle, 'scout-satchel-buckle');
    buckle.position.set(0, 0.12, 0.11);
    this.satchelGroup.add(bag, flap, buckle);
    this.visualRoot.add(this.satchelGroup);

    this.strap = mesh(new THREE.BoxGeometry(0.075, 0.96, 0.055), mats.leather, 'scout-crossbody-strap');
    this.strap.rotation.z = -0.5;
    this.visualRoot.add(this.strap);

    this.capePivot = new THREE.Group();
    this.capePivot.name = 'scout-cape-pivot';
    const capeGeometry = new THREE.BufferGeometry();
    capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.33, 0, 0,
      0.33, 0, 0,
      -0.44, -0.72, -0.045,
      0.44, -0.72, -0.045
    ], 3));
    capeGeometry.setIndex([0, 2, 1, 1, 2, 3]);
    capeGeometry.computeVertexNormals();
    this.cape = mesh(capeGeometry, mats.scarf, 'scout-cape');
    this.capePivot.add(this.cape);
    this.visualRoot.add(this.capePivot);
  }

  #createLimbSet(side, mats) {
    const upperArm = mesh(new THREE.CylinderGeometry(0.105, 0.125, 1, 5), mats.shirt, `scout-${side}-upper-arm`);
    const lowerArm = mesh(new THREE.CylinderGeometry(0.085, 0.105, 1, 5), mats.skin, `scout-${side}-lower-arm`);
    const glove = mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.2, 5), mats.leatherDark, `scout-${side}-glove`);
    const hand = mesh(new THREE.IcosahedronGeometry(0.115, 0), mats.skin, `scout-${side}-hand`);
    const thigh = mesh(new THREE.CylinderGeometry(0.145, 0.17, 1, 5), mats.trousers, `scout-${side}-thigh`);
    const shin = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1, 5), mats.trousers, `scout-${side}-shin`);
    const boot = mesh(new THREE.BoxGeometry(0.25, 0.28, 0.42), mats.leatherDark, `scout-${side}-boot`);
    const cuff = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 5), mats.leather, `scout-${side}-boot-cuff`);
    this.visualRoot.add(upperArm, lowerArm, glove, hand, thigh, shin, boot, cuff);
    return { upperArm, lowerArm, glove, hand, thigh, shin, boot, cuff };
  }

  #boneLocalPosition(bone, target) {
    bone.getWorldPosition(target);
    return this.player.root.worldToLocal(target);
  }

  #boneLocalQuaternion(bone, target) {
    bone.getWorldQuaternion(this.tempWorldQuaternion);
    return target.copy(this.rootWorldQuaternion).multiply(this.tempWorldQuaternion);
  }

  #placeSegment(object, startBone, endBone, radiusScale = 1) {
    this.#boneLocalPosition(startBone, this.tempA);
    this.#boneLocalPosition(endBone, this.tempB);
    this.tempDirection.copy(this.tempB).sub(this.tempA);
    const length = Math.max(0.06, this.tempDirection.length());
    this.tempMid.copy(this.tempA).add(this.tempB).multiplyScalar(0.5);
    object.position.copy(this.tempMid);
    object.quaternion.setFromUnitVectors(UNIT_Y, this.tempDirection.normalize());
    object.scale.set(radiusScale, length, radiusScale);
  }

  #updateTorso() {
    this.#boneLocalPosition(this.bones.hips, this.tempA);
    this.#boneLocalPosition(this.bones.chest, this.tempB);
    const torsoLength = Math.max(0.52, this.tempA.distanceTo(this.tempB) * 1.25);
    this.tempMid.copy(this.tempA).lerp(this.tempB, 0.48);
    this.#boneLocalQuaternion(this.bones.chest, this.tempLocalQuaternion);

    this.torso.position.copy(this.tempMid);
    this.torso.quaternion.copy(this.tempLocalQuaternion);
    this.torso.scale.set(1, torsoLength / 0.72, 1);

    this.belt.position.copy(this.tempA).lerp(this.tempB, 0.18);
    this.belt.quaternion.copy(this.tempLocalQuaternion);

    this.chestPanel.position.copy(this.tempA).lerp(this.tempB, 0.82);
    this.chestPanel.quaternion.copy(this.tempLocalQuaternion);
    this.chestPanel.translateZ(0.31);

    this.strap.position.copy(this.tempMid);
    this.strap.quaternion.copy(this.tempLocalQuaternion);
    this.strap.translateZ(0.325);

    this.satchelGroup.position.copy(this.tempA).lerp(this.tempB, 0.14);
    this.satchelGroup.quaternion.copy(this.tempLocalQuaternion);
    this.satchelGroup.translateX(0.43);
    this.satchelGroup.translateZ(-0.18);
  }

  #updateHead() {
    this.#boneLocalPosition(this.bones.head, this.tempA);
    this.#boneLocalQuaternion(this.bones.head, this.tempLocalQuaternion);
    this.headGroup.position.copy(this.tempA);
    this.headGroup.quaternion.copy(this.tempLocalQuaternion);
    this.headGroup.translateY(0.22);

    this.scarf.position.copy(this.tempA);
    this.scarf.quaternion.copy(this.tempLocalQuaternion);
    this.scarf.translateY(-0.04);
  }

  #updateArm(side) {
    const bones = this.bones[side];
    const limb = this.limbs[side];
    this.#placeSegment(limb.upperArm, bones.upperArm, bones.lowerArm, 1);
    this.#placeSegment(limb.lowerArm, bones.lowerArm, bones.hand, 1);
    this.#boneLocalPosition(bones.hand, limb.hand.position);
    this.#boneLocalQuaternion(bones.hand, limb.hand.quaternion);
    limb.glove.position.copy(limb.hand.position);
    limb.glove.quaternion.copy(limb.hand.quaternion);
    limb.glove.translateY(0.11);
  }

  #updateLeg(side) {
    const bones = this.bones[side];
    const limb = this.limbs[side];
    this.#placeSegment(limb.thigh, bones.upperLeg, bones.lowerLeg, 1);
    this.#placeSegment(limb.shin, bones.lowerLeg, bones.foot, 1);
    this.#boneLocalPosition(bones.foot, limb.boot.position);
    this.#boneLocalQuaternion(bones.foot, limb.boot.quaternion);
    limb.boot.translateY(-0.08);
    limb.boot.translateZ(0.1);
    limb.cuff.position.copy(limb.boot.position);
    limb.cuff.quaternion.copy(limb.boot.quaternion);
    limb.cuff.translateY(0.18);
    limb.cuff.translateZ(-0.05);
  }

  #updateAccessories(dt) {
    this.player?.getPosition?.(this.currentPosition);
    const safeDt = THREE.MathUtils.clamp(dt, 1 / 240, 1 / 20);
    const dx = this.currentPosition.x - this.lastPosition.x;
    const dz = this.currentPosition.z - this.lastPosition.z;
    const dy = this.currentPosition.y - this.lastPosition.y;
    const horizontalSpeed = Math.hypot(dx, dz) / safeDt;
    const verticalSpeed = dy / safeDt;
    const trailTarget = THREE.MathUtils.clamp(horizontalSpeed / 6, 0, 1) * 0.36;
    const liftTarget = THREE.MathUtils.clamp(-verticalSpeed * 0.035, -0.2, 0.28);
    this.capeTrail = THREE.MathUtils.damp(this.capeTrail, trailTarget, 8, safeDt);
    this.capeLift = THREE.MathUtils.damp(this.capeLift, liftTarget, 10, safeDt);

    this.#boneLocalPosition(this.bones.chest, this.capePivot.position);
    this.#boneLocalQuaternion(this.bones.chest, this.capePivot.quaternion);
    this.capePivot.translateY(0.13);
    this.capePivot.translateZ(-0.29 - this.capeTrail * 0.12);
    this.capePivot.rotateX(-0.16 - this.capeTrail * 0.4 + this.capeLift);

    this.lastPosition.copy(this.currentPosition);
  }

  #syncVisibility() {
    if (!this.rigReady) return;
    this.visualRoot.visible = !Boolean(this.player?.isFirstPerson?.());
  }
}
