import * as THREE from 'three';

const SIT_CLIP_NAME = 'Cinematic_Campfire_Sit';
const STAND_CLIP_NAME = 'Cinematic_Campfire_Stand';
const SIT_TRANSITION_SECONDS = 0.62;
const SIT_HOLD_SECONDS = 10;
const STAND_TRANSITION_SECONDS = 0.74;

export class RangerSeatedPose {
  constructor({ player }) {
    this.player = player;
    this.model = null;
    this.bones = new Map();
    this.sitClip = null;
    this.standClip = null;
    this.action = null;
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

  playSit() {
    if (!this.#ensureClips()) return false;
    return this.#play(this.sitClip);
  }

  playStand() {
    if (!this.#ensureClips()) return false;
    return this.#play(this.standClip);
  }

  stop() {
    this.action?.stop();
    this.action = null;
  }

  #play(clip) {
    if (!clip || !this.player?.mixer || !this.player?.model) return false;
    this.player.mixer.stopAllAction();
    this.action = this.player.mixer.clipAction(clip, this.player.model);
    this.action
      .reset()
      .setLoop(THREE.LoopOnce, 1)
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1);
    this.action.clampWhenFinished = true;
    this.action.play();
    return true;
  }

  #ensureClips() {
    if (!this.player?.model || !this.player?.mixer) return false;
    if (this.model === this.player.model && this.sitClip && this.standClip) return true;
    this.#buildClips();
    return Boolean(this.sitClip && this.standClip);
  }

  #buildClips() {
    this.model = this.player.model;
    this.#indexBones();
    const poseBones = this.#poseBones();
    if (!poseBones.length) {
      this.sitClip = null;
      this.standClip = null;
      return;
    }

    const standingPose = new Map(poseBones.map(bone => [bone, bone.quaternion.clone()]));
    for (const bone of poseBones) bone.quaternion.copy(standingPose.get(bone));
    this.model.updateMatrixWorld(true);
    this.#poseArm('l');
    this.#poseArm('r');
    this.#poseLeg('l');
    this.#poseLeg('r');
    const seatedPose = new Map(poseBones.map(bone => [bone, bone.quaternion.clone()]));

    for (const bone of poseBones) bone.quaternion.copy(standingPose.get(bone));
    this.model.updateMatrixWorld(true);

    const sitTracks = poseBones.map(bone => new THREE.QuaternionKeyframeTrack(
      `${bone.uuid}.quaternion`,
      [0, SIT_TRANSITION_SECONDS, SIT_HOLD_SECONDS],
      [
        ...standingPose.get(bone).toArray(),
        ...seatedPose.get(bone).toArray(),
        ...seatedPose.get(bone).toArray()
      ]
    ));
    const standTracks = poseBones.map(bone => new THREE.QuaternionKeyframeTrack(
      `${bone.uuid}.quaternion`,
      [0, STAND_TRANSITION_SECONDS],
      [
        ...seatedPose.get(bone).toArray(),
        ...standingPose.get(bone).toArray()
      ]
    ));

    this.sitClip = new THREE.AnimationClip(SIT_CLIP_NAME, SIT_HOLD_SECONDS, sitTracks);
    this.standClip = new THREE.AnimationClip(STAND_CLIP_NAME, STAND_TRANSITION_SECONDS, standTracks);
  }

  #indexBones() {
    this.bones.clear();
    this.model?.traverse(object => {
      if (!object.isBone || !object.name) return;
      this.bones.set(this.#normalize(object.name), object);
    });
  }

  #poseBones() {
    return [
      this.#bone('upperarm.l', 'leftupperarm', 'upperarmleft'),
      this.#bone('lowerarm.l', 'leftlowerarm', 'lowerarmleft'),
      this.#bone('upperarm.r', 'rightupperarm', 'upperarmright'),
      this.#bone('lowerarm.r', 'rightlowerarm', 'lowerarmright'),
      this.#bone('upperleg.l', 'leftupperleg', 'upperlegleft'),
      this.#bone('lowerleg.l', 'leftlowerleg', 'lowerlegleft'),
      this.#bone('upperleg.r', 'rightupperleg', 'upperlegright'),
      this.#bone('lowerleg.r', 'rightlowerleg', 'lowerlegright')
    ].filter((bone, index, bones) => bone && bones.indexOf(bone) === index);
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

  #poseArm(side) {
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

    this.#aimBoneAt(upper, lower, this.#playerLocalPoint({
      x: sideSign * 0.3,
      y: 1.18,
      z: 0.13
    }));
    this.#aimBoneAt(lower, hand, this.#playerLocalPoint({
      x: sideSign * 0.22,
      y: 1.03,
      z: 0.4
    }));
  }

  #poseLeg(side) {
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

    this.#aimBoneAt(upper, lower, this.#playerLocalPoint({
      x: sideSign * 0.23,
      y: 0.92,
      z: 0.4
    }));
    this.#aimBoneAt(lower, foot, this.#playerLocalPoint({
      x: sideSign * 0.24,
      y: 0.48,
      z: 0.68
    }));
  }

  #aimBoneAt(bone, child, targetWorld) {
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
    bone.quaternion.copy(this.tempTargetQuaternion);
    bone.updateWorldMatrix(true, true);
  }
}
