import * as THREE from 'three';

export const PRISMA_NATIVE_BODY_SHAPE_REVISION = 'device-humanoid-v2';

export const PRISMA_NATIVE_BODY_SHAPE_PROFILE = Object.freeze({
  torso: Object.freeze({
    hipWidth: 0.94,
    hipDepth: 0.96,
    waistWidth: 0.78,
    waistDepth: 0.88,
    chestWidth: 0.94,
    chestDepth: 0.97,
    shoulderWidth: 1.08,
    shoulderDepth: 1.01
  }),
  neck: Object.freeze({ width: 1.12, depth: 1.1, height: 1.2 }),
  upperArm: Object.freeze({ start: 1.06, end: 0.9, bulge: 0.02 }),
  forearm: Object.freeze({ start: 0.98, end: 0.82, bulge: 0.09 }),
  hand: Object.freeze({ scale: 0.92 }),
  thigh: Object.freeze({ start: 1.03, end: 0.84, bulge: 0.03 }),
  calf: Object.freeze({ start: 0.88, end: 0.72, bulge: 0.18 }),
  foot: Object.freeze({ forward: 1.06, lateral: 0.9, height: 0.72 })
});

const BODY_CENTER_X = 0;
const BODY_CENTER_Z = 0;
const EPSILON = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);

function bonePosition(bonesByName, name) {
  return bonesByName.get(name)?.getWorldPosition(new THREE.Vector3()) ?? null;
}

function interpolateLandmarks(y, landmarks, key) {
  if (landmarks.length === 0) return 1;
  if (y <= landmarks[0].y) return landmarks[0][key];
  const last = landmarks[landmarks.length - 1];
  if (y >= last.y) return last[key];

  for (let index = 1; index < landmarks.length; index += 1) {
    const upper = landmarks[index];
    if (y > upper.y) continue;
    const lower = landmarks[index - 1];
    const range = Math.max(EPSILON, upper.y - lower.y);
    const t = THREE.MathUtils.clamp((y - lower.y) / range, 0, 1);
    return THREE.MathUtils.lerp(lower[key], upper[key], t);
  }

  return last[key];
}

function buildTorsoLandmarks(bonesByName) {
  const profile = PRISMA_NATIVE_BODY_SHAPE_PROFILE.torso;
  const landmarks = [
    ['hip', profile.hipWidth, profile.hipDepth],
    ['waist', profile.waistWidth, profile.waistDepth],
    ['chest', profile.chestWidth, profile.chestDepth],
    ['shoulder', profile.shoulderWidth, profile.shoulderDepth]
  ]
    .map(([name, width, depth]) => {
      const position = bonePosition(bonesByName, name);
      return position ? { y: position.y, width, depth } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);

  return landmarks;
}

function shapeTorso(point, target, landmarks) {
  const width = interpolateLandmarks(point.y, landmarks, 'width');
  const depth = interpolateLandmarks(point.y, landmarks, 'depth');
  target.set(
    BODY_CENTER_X + (point.x - BODY_CENTER_X) * width,
    point.y,
    BODY_CENTER_Z + (point.z - BODY_CENTER_Z) * depth
  );
  return target;
}

function shapeAround(point, target, center, scaleX, scaleY, scaleZ) {
  target.copy(point).sub(center);
  target.set(target.x * scaleX, target.y * scaleY, target.z * scaleZ);
  target.add(center);
  return target;
}

function radialSegmentShape(point, target, start, end, startScale, endScale, bulge = 0) {
  const axis = new THREE.Vector3().subVectors(end, start);
  const length = axis.length();
  if (length <= EPSILON) return target.copy(point);
  axis.multiplyScalar(1 / length);

  const relative = new THREE.Vector3().subVectors(point, start);
  const axialDistance = relative.dot(axis);
  const t = THREE.MathUtils.clamp(axialDistance / length, 0, 1);
  const axial = axis.clone().multiplyScalar(axialDistance);
  const radial = relative.clone().sub(axial);
  const scale = THREE.MathUtils.lerp(startScale, endScale, t) + Math.sin(Math.PI * t) * bulge;

  target.copy(start).add(axial).add(radial.multiplyScalar(scale));
  return target;
}

function footShape(point, target, foot, toe) {
  const profile = PRISMA_NATIVE_BODY_SHAPE_PROFILE.foot;
  const forward = new THREE.Vector3().subVectors(toe, foot);
  forward.y = 0;
  if (forward.lengthSq() <= EPSILON) forward.set(0, 0, 1);
  else forward.normalize();

  const lateral = new THREE.Vector3().crossVectors(UP, forward);
  if (lateral.lengthSq() <= EPSILON) lateral.set(1, 0, 0);
  else lateral.normalize();

  const relative = new THREE.Vector3().subVectors(point, foot);
  const forwardAmount = relative.dot(forward) * profile.forward;
  const lateralAmount = relative.dot(lateral) * profile.lateral;
  const heightAmount = relative.dot(UP) * profile.height;

  target.copy(foot)
    .addScaledVector(forward, forwardAmount)
    .addScaledVector(lateral, lateralAmount)
    .addScaledVector(UP, heightAmount);
  return target;
}

function createJointShaper(bonesByName, torsoLandmarks) {
  const profile = PRISMA_NATIVE_BODY_SHAPE_PROFILE;
  const positions = new Map();
  for (const name of bonesByName.keys()) {
    const position = bonePosition(bonesByName, name);
    if (position) positions.set(name, position);
  }

  const segment = (point, target, startName, endName, config) => {
    const start = positions.get(startName);
    const end = positions.get(endName);
    if (!start || !end) return target.copy(point);
    return radialSegmentShape(point, target, start, end, config.start, config.end, config.bulge);
  };

  const hand = (point, target, name) => {
    const center = positions.get(name);
    if (!center) return target.copy(point);
    return shapeAround(point, target, center, profile.hand.scale, profile.hand.scale, profile.hand.scale);
  };

  const foot = (point, target, side) => {
    const footPosition = positions.get(`${side}Foot`);
    const toePosition = positions.get(`${side}FootToe`);
    if (!footPosition || !toePosition) return target.copy(point);
    return footShape(point, target, footPosition, toePosition);
  };

  return (jointName, point, target) => {
    switch (jointName) {
      case 'hip':
      case 'waist':
      case 'chest':
      case 'shoulder':
        return shapeTorso(point, target, torsoLandmarks);
      case 'neck': {
        const center = positions.get('neck');
        return center
          ? shapeAround(point, target, center, profile.neck.width, profile.neck.height, profile.neck.depth)
          : target.copy(point);
      }
      case 'leftShoulder':
      case 'leftUpperArm':
      case 'leftUpperArmTwist':
        return segment(point, target, 'leftUpperArm', 'leftForearm', profile.upperArm);
      case 'rightShoulder':
      case 'rightUpperArm':
      case 'rightUpperArmTwist':
        return segment(point, target, 'rightUpperArm', 'rightForearm', profile.upperArm);
      case 'leftForearm':
      case 'leftForearmTwist':
        return segment(point, target, 'leftForearm', 'leftHand', profile.forearm);
      case 'rightForearm':
      case 'rightForearmTwist':
        return segment(point, target, 'rightForearm', 'rightHand', profile.forearm);
      case 'leftHand':
        return hand(point, target, 'leftHand');
      case 'rightHand':
        return hand(point, target, 'rightHand');
      case 'leftThigh':
      case 'leftThighTwist':
        return segment(point, target, 'leftThigh', 'leftCalf', profile.thigh);
      case 'rightThigh':
      case 'rightThighTwist':
        return segment(point, target, 'rightThigh', 'rightCalf', profile.thigh);
      case 'leftCalf':
        return segment(point, target, 'leftCalf', 'leftFoot', profile.calf);
      case 'rightCalf':
        return segment(point, target, 'rightCalf', 'rightFoot', profile.calf);
      case 'leftFoot':
      case 'leftFootToe':
      case 'leftFootTip':
        return foot(point, target, 'left');
      case 'rightFoot':
      case 'rightFootToe':
      case 'rightFootTip':
        return foot(point, target, 'right');
      default:
        return target.copy(point);
    }
  };
}

export function applyPrismaNativeBodyShape({ geometry, bones }) {
  const position = geometry?.getAttribute?.('position');
  const skinIndex = geometry?.getAttribute?.('skinIndex');
  const skinWeight = geometry?.getAttribute?.('skinWeight');
  if (!position || !skinIndex || !skinWeight || !Array.isArray(bones) || bones.length === 0) {
    throw new Error('Prisma native body shaping requires skinned geometry and its bind-pose bones');
  }

  const bonesByName = new Map(bones.map(bone => [bone.name, bone]));
  const torsoLandmarks = buildTorsoLandmarks(bonesByName);
  if (torsoLandmarks.length !== 4) throw new Error('Prisma native body shaping is missing torso landmarks');

  const shapeForJoint = createJointShaper(bonesByName, torsoLandmarks);
  const original = new THREE.Vector3();
  const shaped = new THREE.Vector3();
  const influenced = new THREE.Vector3();

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    original.fromBufferAttribute(position, vertex);
    shaped.set(0, 0, 0);
    let totalWeight = 0;

    const base = vertex * skinIndex.itemSize;
    for (let influence = 0; influence < skinIndex.itemSize; influence += 1) {
      const jointIndex = skinIndex.array[base + influence];
      const weight = skinWeight.array[base + influence];
      if (!Number.isFinite(weight) || weight <= 0) continue;
      const jointName = bones[jointIndex]?.name;
      if (!jointName) continue;
      shapeForJoint(jointName, original, influenced);
      shaped.addScaledVector(influenced, weight);
      totalWeight += weight;
    }

    if (totalWeight < 1 - EPSILON) shaped.addScaledVector(original, Math.max(0, 1 - totalWeight));
    if (totalWeight > 1 + EPSILON) shaped.multiplyScalar(1 / totalWeight);
    position.setXYZ(vertex, shaped.x, shaped.y, shaped.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.bodyShapeRevision = PRISMA_NATIVE_BODY_SHAPE_REVISION;
  geometry.userData.bodyShapeProfile = PRISMA_NATIVE_BODY_SHAPE_PROFILE;
  geometry.userData.bodyShapeKeepsJointEndpoints = true;

  return geometry;
}
