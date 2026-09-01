import * as THREE from 'three';

const CRAWL_CLIP_NAME = 'Cinematic_Exhausted_Crawl';
const CRAWL_CLIP_DURATION = 2.2;
const CRAWL_SAMPLE_TIMES = Object.freeze([0, 0.55, 1.1, 1.65, CRAWL_CLIP_DURATION]);
const LEFT_REACH_SAMPLES = Object.freeze([0.5, 1, 0.5, 0, 0.5]);

export class RangerCrawlPose {
  constructor({ player }) {
    this.player = player;
    this.model = null;
    this.bones = new Map();
    this.clip = null;
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

  play({ timeScale = 0.78 } = {}) {
    if (!this.player?.model || !this.player?.mixer) return false;
    if (this.model !== this.player.model || !this.clip) this.#buildClip();
    if (!this.clip) return false;

    // This is a cinematic-only animation action. It replaces the previous
    // locomotion action instead of tipping Walking_A onto its side, so the
    // hands, elbows and knees visibly pull the exhausted Ranger forward.
    this.player.mixer.stopAllAction();
    this.action = this.player.mixer.clipAction(this.clip, this.player.model);
    this.action
      .reset()
      .setLoop(THREE.LoopRepeat, Infinity)
      .setEffectiveTimeScale(Math.max(0.1, timeScale))
      .setEffectiveWeight(1)
      .play();
    return true;
  }

  stop() {
    this.action?.stop();
    this.action = null;
  }

  #buildClip() {
    this.model = this.player.model;
    this.#indexBones();
    const poseBones = this.#poseBones();
    if (!poseBones.length) {
      this.clip = null;
      return;
    }

    const restPose = new Map(poseBones.map(bone => [bone, bone.quaternion.clone()]));
    const samples = new Map(poseBones.map(bone => [bone, []]));

    for (let index = 0; index < CRAWL_SAMPLE_TIMES.length; index += 1) {
      for (const bone of poseBones) bone.quaternion.copy(restPose.get(bone));
      this.model.updateMatrixWorld(true);

      const leftReach = LEFT_REACH_SAMPLES[index];
      const rightReach = 1 - leftReach;
      this.#poseArm('l', leftReach, 1);
      this.#poseArm('r', rightReach, 1);
      this.#poseLeg('l', rightReach, 1);
      this.#poseLeg('r', leftReach, 1);

      for (const bone of poseBones) samples.get(bone).push(...bone.quaternion.toArray());
    }

    for (const bone of poseBones) bone.quaternion.copy(restPose.get(bone));
    this.model.updateMatrixWorld(true);

    const tracks = poseBones.map(bone => new THREE.QuaternionKeyframeTrack(
      `${bone.uuid}.quaternion`,
      CRAWL_SAMPLE_TIMES,
      samples.get(bone)
    ));
    this.clip = new THREE.AnimationClip(CRAWL_CLIP_NAME, CRAWL_CLIP_DURATION, tracks);
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
      x: sideSign * THREE.MathUtils.lerp(0.34, 0.29, reach),
      y: THREE.MathUtils.lerp(0.17, 0.22, reach),
      z: THREE.MathUtils.lerp(1.12, 1.54, reach)
    };
    const handLocal = {
      x: sideSign * THREE.MathUtils.lerp(0.39, 0.31, reach),
      y: THREE.MathUtils.lerp(0.075, 0.11, reach),
      z: THREE.MathUtils.lerp(1.34, 2.02, reach)
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
      x: sideSign * 0.25,
      y: THREE.MathUtils.lerp(0.12, 0.19, advance),
      z: THREE.MathUtils.lerp(0.42, 0.88, advance)
    };
    const footLocal = {
      x: sideSign * 0.22,
      y: 0.065,
      z: THREE.MathUtils.lerp(0.05, 0.25, advance)
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
