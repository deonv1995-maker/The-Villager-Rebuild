import * as THREE from 'three';
import part01 from './prisma-native/generated/part-01.js';
import part02 from './prisma-native/generated/part-02.js';
import part03 from './prisma-native/generated/part-03.js';
import part04 from './prisma-native/generated/part-04.js';
import part05 from './prisma-native/generated/part-05.js';
import part06 from './prisma-native/generated/part-06.js';
import part07 from './prisma-native/generated/part-07.js';
import part08 from './prisma-native/generated/part-08.js';
import part09 from './prisma-native/generated/part-09.js';
import part10 from './prisma-native/generated/part-10.js';
import part11 from './prisma-native/generated/part-11.js';
import part12 from './prisma-native/generated/part-12.js';

export const PRISMA_HUMANOID_VERTEX_COUNT = 3779;
export const PRISMA_HUMANOID_INDEX_COUNT = 22662;
export const PRISMA_HUMANOID_TRIANGLE_COUNT = PRISMA_HUMANOID_INDEX_COUNT / 3;
export const PRISMA_HUMANOID_PACKED_SHA256 = 'bee4031cce3df315462e8ebf984b833a42f75de463adf2852e4795356c84d64c';
export const PRISMA_HUMANOID_JOINT_NAMES = Object.freeze([
  'hip',
  'waist',
  'chest',
  'shoulder',
  'neck',
  'head',
  'top',
  'leftThigh',
  'leftCalf',
  'leftFoot',
  'rightThigh',
  'rightCalf',
  'rightFoot',
  'leftShoulder',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightForearm',
  'rightHand',
  'leftFootToe',
  'leftFootTip',
  'rightFootToe',
  'rightFootTip',
  'leftUpperArmTwist',
  'leftForearmTwist',
  'rightUpperArmTwist',
  'rightForearmTwist',
  'leftThighTwist',
  'rightThighTwist'
]);

const PRISMA_HUMANOID_PACKED_PARTS = Object.freeze([
  part01,
  part02,
  part03,
  part04,
  part05,
  part06,
  part07,
  part08,
  part09,
  part10,
  part11,
  part12
]);

const MAGIC = 'PRH2';
const HEADER_BYTES = 20;
const FLAGS = 1;
const MATRIX_FLOATS = 16;
const POSITION_COMPONENTS = 3;
const NORMAL_COMPONENTS = 3;
const SKIN_INFLUENCES = 4;

function readMagic(bytes) {
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

function base64ToBytes(base64) {
  const decode = globalThis.atob;
  if (typeof decode !== 'function') throw new Error('Base64 decoder is unavailable');
  const binary = decode(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readFloat32Array(view, offset, count) {
  const result = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    result[index] = view.getFloat32(offset + index * 4, true);
  }
  return result;
}

function readUint16Array(view, offset, count) {
  const result = new Uint16Array(count);
  for (let index = 0; index < count; index += 1) {
    result[index] = view.getUint16(offset + index * 2, true);
  }
  return result;
}

function exactPackedLength(vertexCount, indexCount, jointCount) {
  return HEADER_BYTES
    + jointCount
    + jointCount * MATRIX_FLOATS * 4
    + vertexCount * POSITION_COMPONENTS * 4
    + vertexCount * NORMAL_COMPONENTS * 4
    + vertexCount * SKIN_INFLUENCES
    + vertexCount * SKIN_INFLUENCES * 4
    + indexCount * 2;
}

export function buildPrismaHumanoidScene(sourceBytes) {
  const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
  if (bytes.byteLength < HEADER_BYTES) throw new Error('Prisma humanoid asset is too small');
  if (readMagic(bytes) !== MAGIC) throw new Error('Prisma humanoid asset has an invalid signature');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const jointCount = view.getUint32(12, true);
  const flags = view.getUint32(16, true);

  if (vertexCount !== PRISMA_HUMANOID_VERTEX_COUNT) {
    throw new Error(`Expected ${PRISMA_HUMANOID_VERTEX_COUNT} Prisma vertices, found ${vertexCount}`);
  }
  if (indexCount !== PRISMA_HUMANOID_INDEX_COUNT || indexCount % 3 !== 0) {
    throw new Error(`Expected ${PRISMA_HUMANOID_INDEX_COUNT} Prisma triangle indices, found ${indexCount}`);
  }
  if (jointCount !== PRISMA_HUMANOID_JOINT_NAMES.length) {
    throw new Error(`Expected ${PRISMA_HUMANOID_JOINT_NAMES.length} Prisma joints, found ${jointCount}`);
  }
  if (flags !== FLAGS) throw new Error(`Unsupported Prisma humanoid asset flags: ${flags}`);

  const expectedLength = exactPackedLength(vertexCount, indexCount, jointCount);
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`Prisma humanoid asset length mismatch: expected ${expectedLength}, found ${bytes.byteLength}`);
  }

  let offset = HEADER_BYTES;
  const parents = new Int8Array(jointCount);
  for (let index = 0; index < jointCount; index += 1) parents[index] = view.getInt8(offset + index);
  offset += jointCount;

  const localMatrices = [];
  for (let jointIndex = 0; jointIndex < jointCount; jointIndex += 1) {
    localMatrices.push(readFloat32Array(view, offset, MATRIX_FLOATS));
    offset += MATRIX_FLOATS * 4;
  }

  const positions = readFloat32Array(view, offset, vertexCount * POSITION_COMPONENTS);
  offset += positions.byteLength;
  const normals = readFloat32Array(view, offset, vertexCount * NORMAL_COMPONENTS);
  offset += normals.byteLength;

  const skinIndices = new Uint8Array(vertexCount * SKIN_INFLUENCES);
  skinIndices.set(bytes.subarray(offset, offset + skinIndices.length));
  offset += skinIndices.length;

  const skinWeights = readFloat32Array(view, offset, vertexCount * SKIN_INFLUENCES);
  offset += skinWeights.byteLength;

  const indices = readUint16Array(view, offset, indexCount);
  offset += indexCount * 2;
  if (offset !== bytes.byteLength) throw new Error('Prisma humanoid parser did not consume the whole asset');

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, POSITION_COMPONENTS));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, NORMAL_COMPONENTS));
  geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skinIndices, SKIN_INFLUENCES));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, SKIN_INFLUENCES));
  geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.source = 'prisma3d-native-rig-v1';
  geometry.userData.triangleCount = PRISMA_HUMANOID_TRIANGLE_COUNT;

  const bones = PRISMA_HUMANOID_JOINT_NAMES.map((name, jointIndex) => {
    const bone = new THREE.Bone();
    bone.name = name;
    const matrix = new THREE.Matrix4().fromArray(localMatrices[jointIndex]);
    matrix.decompose(bone.position, bone.quaternion, bone.scale);
    return bone;
  });

  const root = new THREE.Group();
  root.name = 'prisma-human-native-rig';
  root.userData.source = 'prisma3d-native-rig-v1';

  for (let jointIndex = 0; jointIndex < jointCount; jointIndex += 1) {
    const parentIndex = parents[jointIndex];
    if (parentIndex < 0) root.add(bones[jointIndex]);
    else {
      if (parentIndex >= jointCount) throw new Error(`Prisma joint ${jointIndex} has invalid parent ${parentIndex}`);
      bones[parentIndex].add(bones[jointIndex]);
    }
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xc79575,
    roughness: 0.92,
    metalness: 0,
    flatShading: false
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'prisma-human-skinned-mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.source = 'prisma3d-native-rig-v1';
  root.add(mesh);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.normalizeSkinWeights();
  root.updateMatrixWorld(true);

  return { scene: root, mesh, bones };
}

async function gunzipBytes(compressed) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('Gzip decompression is unavailable');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function loadPrismaHumanoidScene(partPaths = null, fetchImpl = globalThis.fetch) {
  let parts = PRISMA_HUMANOID_PACKED_PARTS;

  if (Array.isArray(partPaths) && partPaths.length > 0) {
    if (typeof fetchImpl !== 'function') throw new Error('Prisma humanoid asset fetch is unavailable');

    const responses = await Promise.all(partPaths.map(path => fetchImpl(path)));
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      if (!response || response.ok === false) {
        throw new Error(`Failed to load Prisma humanoid asset part ${index + 1}`);
      }
    }
    parts = await Promise.all(responses.map(response => response.text()));
  }

  const base64 = parts.join('').replace(/\s+/g, '');
  const packed = await gunzipBytes(base64ToBytes(base64));
  return buildPrismaHumanoidScene(packed);
}
