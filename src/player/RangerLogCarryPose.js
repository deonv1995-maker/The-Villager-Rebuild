import * as THREE from 'three';

export class RangerLogCarryPose {
  constructor({ player }) {
    this.player = player;
    this.active = false;
    this.bones = new Map();
    this.model = null;
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

  setActive(active) {
    this.active = Boolean(active);
  }

  update() {
    if (!this.active || !this.player?.model) return;
    if (this.model !== this.player.model) this.#indexBones();
    if (!this.bones.size) return;

    // Apply after RangerController updates the AnimationMixer. This keeps normal
    // locomotion in charge of the body while the arms visibly support the load.
    this.player.model.updateMatrixWorld(true);
    this.#poseArm('l',
      { x: 0.64, y: 1.46, z: -0.02 },
      { x: 0.54, y: 1.74, z: -0.17 },
      0.98
    );
    this.#poseArm('r',
      { x: -0.55, y: 1.43, z: -0.08 },
      { x: -0.30, y: 1.68, z: -0.28 },
      0.98
    );
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

  #poseArm(side, elbowLocal, handLocal, weight) {
    const left = side === 'l';
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

    this.#aimBoneAt(upper, lower, this.#playerLocalPoint(elbowLocal), weight);
    this.#aimBoneAt(lower, hand, this.#playerLocalPoint(handLocal), weight);
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
