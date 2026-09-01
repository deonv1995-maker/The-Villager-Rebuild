import * as THREE from 'three';

export class RangerCrawlPose {
  constructor({ player }) {
    this.player = player;
    this.model = null;
    this.bones = new Map();
    this.tempBonePosition = new THREE.Vector3();
    this.tempChildPosition = new THREE.Vector3();
    this.tempTarget = new THREE.Vector3();
    this.tempCurrentDirection = new THREE.Vector3();
    this.tempDesiredDirection = new THREE.Vector3();
    this.tempDelta = new THREE.Quaternion();
    this.tempWorldQuaternion = new THREE.Quaternion();
    this.tempParentQuaternion = new THREE.Quaternion();
    this.tempTargetQuaternion = new THREE.Quaternion();
  }

  update({ time = 0, resting = false } = {}) {
    if (!this.player?.model) return;
    if (this.model !== this.player.model) this.#indexBones();
    if (!this.bones.size) return;

    // RangerController applies this after the AnimationMixer. The base Idle_A
    // animation supplies subtle breathing while this overlay turns the limbs
    // into a low, alternating drag instead of rotating a walk cycle sideways.
    this.player.model.updateMatrixWorld(true);

    if (resting) {
      this.#poseArm('l', 0.72, 0.94);
      this.#poseArm('r', 0.28, 0.94);
      this.#poseLeg('l', 0.34, 0.9);
      this.#poseLeg('r', 0.58, 0.9);
    } else {
      const cycle = Math.sin(time * 2.55);
      const leftReach = 0.5 + cycle * 0.5;
      const rightReach = 1 - leftReach;
      this.#poseArm('l', leftReach, 0.98);
      this.#poseArm('r', rightReach, 0.98);
      // Contralateral knees advance with the opposite arm, which reads as a
      // tired crawl rather than both legs continuing a walking stride.
      this.#poseLeg('l', rightReach, 0.94);
      this.#poseLeg('r', leftReach, 0.94);
    }

    this.player.model.updateMatrixWorld(true);
  }

  #indexBones() {
    this.model = this.player.model;
    this.bones.clear();
    this.model?.traverse(object => {
      if (!object.isBone || !object.name) return;
      this.bones.set(this.#normalize(object.name), object);
    });
  }

  #normalize(value) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  #bone(...names) {
    for (const name of names) {
      const wanted = this.#normalize(name);
      const exact = this.bones.get(wanted);
      if (exact) return exact;
      for (const [key, bone] of this.bones) {
        if (key.endsWith(wanted) || key.includes(wanted)) return bone;
      }
    }
    return null;
  }

  #playerLocalPoint(point) {
    this.tempTarget.set(point.x, point.y, point.z);
    this.player.root.updateMatrixWorld(true);
    return this.player.root.localToWorld(this.tempTarget).clone();
  }

  #poseArm(side, reach, weight) {
    const left = side === 'l';
    const sideSign = left ? 1 : -1;
    const upper = this.#bone(
      `upperarm.${side}`,
      left ? 'leftupperarm' : 'rightupperarm',
      left ? 'upperarmleft' : 'upperarmright'
    );
    const lower = this.#bone(
      `lowerarm.${side}`,
      left ? 'leftlowerarm' : 'rightlowerarm',
      left ? 'lowerarmleft' : 'lowerarmright'
    );
    const hand = this.#bone(
      `wrist.${side}`,
      `hand.${side}`,
      left ? 'lefthand' : 'righthand',
      left ? 'handl' : 'handr'
    );
    if (!upper || !lower || !hand) return;

    const elbowLocal = {
      x: sideSign * THREE.MathUtils.lerp(0.33, 0.29, reach),
      y: THREE.MathUtils.lerp(0.19, 0.23, reach),
      z: THREE.MathUtils.lerp(1.22, 1.58, reach)
    };
    const handLocal = {
      x: sideSign * THREE.MathUtils.lerp(0.37, 0.32, reach),
      y: THREE.MathUtils.lerp(0.09, 0.12, reach),
      z: THREE.MathUtils.lerp(1.43, 2.06, reach)
    };

    this.#aimBoneAt(upper, lower, this.#playerLocalPoint(elbowLocal), weight);
    this.#aimBoneAt(lower, hand, this.#playerLocalPoint(handLocal), weight);
  }

  #poseLeg(side, advance, weight) {
    const left = side === 'l';
    const sideSign = left ? 1 : -1;
    const upper = this.#bone(
      `upperleg.${side}`,
      left ? 'leftupperleg' : 'rightupperleg',
      left ? 'upperlegleft' : 'upperlegright'
    );
    const lower = this.#bone(
      `lowerleg.${side}`,
      left ? 'leftlowerleg' : 'rightlowerleg',
      left ? 'lowerlegleft' : 'lowerlegright'
    );
    const foot = this.#bone(
      `foot.${side}`,
      left ? 'leftfoot' : 'rightfoot',
      left ? 'footl' : 'footr'
    );
    if (!upper || !lower || !foot) return;

    const kneeLocal = {
      x: sideSign * 0.24,
      y: THREE.MathUtils.lerp(0.13, 0.2, advance),
      z: THREE.MathUtils.lerp(0.46, 0.9, advance)
    };
    const footLocal = {
      x: sideSign * 0.22,
      y: 0.07,
      z: THREE.MathUtils.lerp(0.08, 0.28, advance)
    };

    this.#aimBoneAt(upper, lower, this.#playerLocalPoint(kneeLocal), weight);
    this.#aimBoneAt(lower, foot, this.#playerLocalPoint(footLocal), weight);
  }

  #aimBoneAt(bone, child, targetWorld, weight) {
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(this.tempBonePosition);
    child.getWorldPosition(this.tempChildPosition);
    this.tempCurrentDirection.copy(this.tempChildPosition).sub(this.tempBonePosition).normalize();
    this.tempDesiredDirection.copy(targetWorld).sub(this.tempBonePosition).normalize();
    if (this.tempCurrentDirection.lengthSq() < 0.001 || this.tempDesiredDirection.lengthSq() < 0.001) return;

    this.tempDelta.setFromUnitVectors(this.tempCurrentDirection, this.tempDesiredDirection);
    bone.getWorldQuaternion(this.tempWorldQuaternion);
    this.tempTargetQuaternion.copy(this.tempDelta).multiply(this.tempWorldQuaternion);
    if (bone.parent) bone.parent.getWorldQuaternion(this.tempParentQuaternion);
    else this.tempParentQuaternion.identity();
    this.tempParentQuaternion.invert();
    this.tempTargetQuaternion.premultiply(this.tempParentQuaternion);
    bone.quaternion.slerp(this.tempTargetQuaternion, THREE.MathUtils.clamp(weight, 0, 1));
    bone.updateWorldMatrix(true, true);
  }
}
