import assert from 'node:assert/strict';
import {
  loadPrismaHumanoidScene,
  PRISMA_HUMANOID_INDEX_COUNT,
  PRISMA_HUMANOID_JOINT_NAMES,
  PRISMA_HUMANOID_TRIANGLE_COUNT,
  PRISMA_HUMANOID_VERTEX_COUNT
} from '../src/player/PrismaHumanoidAsset.js';
import {
  PRISMA_NATIVE_BODY_SHAPE_PROFILE,
  PRISMA_NATIVE_BODY_SHAPE_REVISION
} from '../src/player/PrismaNativeBodyShape.js';

const { scene, mesh, bones } = await loadPrismaHumanoidScene();
const geometry = mesh?.geometry;

assert.ok(scene?.isGroup, 'Prisma native body should load as a group');
assert.ok(mesh?.isSkinnedMesh, 'Prisma native body should contain its skinned mesh');
assert.equal(bones?.length, PRISMA_HUMANOID_JOINT_NAMES.length, 'native body should keep the established 31-joint skeleton');
assert.equal(geometry?.getAttribute('position')?.count, PRISMA_HUMANOID_VERTEX_COUNT, 'body shaping must not change the native vertex count');
assert.equal(geometry?.index?.count, PRISMA_HUMANOID_INDEX_COUNT, 'body shaping must not change the native index count');
assert.equal(geometry?.userData?.triangleCount, PRISMA_HUMANOID_TRIANGLE_COUNT, 'body shaping must preserve native topology metadata');
assert.equal(geometry?.userData?.bodyShapeRevision, PRISMA_NATIVE_BODY_SHAPE_REVISION, 'device-refined shape revision should be applied at asset construction');
assert.equal(geometry?.userData?.bodyShapeKeepsJointEndpoints, true, 'native body shaping should preserve the rig joint endpoints');

const { torso, neck, upperArm, forearm, thigh, calf, foot } = PRISMA_NATIVE_BODY_SHAPE_PROFILE;
assert.ok(torso.waistWidth < torso.hipWidth, 'waist should be narrower than the pelvis');
assert.ok(torso.waistWidth < torso.chestWidth, 'waist should be narrower than the ribcage');
assert.ok(torso.shoulderWidth > torso.chestWidth, 'shoulder line should broaden above the chest');
assert.ok(torso.waistDepth < torso.chestDepth, 'waist should also narrow front-to-back');
assert.ok(neck.height > 1 && neck.width > 1, 'neck bridge should gain enough height and width to connect head and shoulders');
assert.ok(upperArm.end < upperArm.start, 'upper arms should taper toward the elbow');
assert.ok(forearm.end < forearm.start && forearm.bulge > 0, 'forearms should taper toward the wrist while retaining mid-forearm volume');
assert.ok(thigh.end < thigh.start, 'thighs should taper toward the knee');
assert.ok(calf.end < calf.start && calf.bulge > forearm.bulge, 'calves should taper toward the ankle with a readable calf bulge');
assert.ok(foot.height < 0.8 && foot.lateral < 1 && foot.forward > 1, 'feet should be lower, narrower, and slightly longer heel-to-toe');

for (const attributeName of ['position', 'normal', 'skinIndex', 'skinWeight']) {
  const attribute = geometry.getAttribute(attributeName);
  assert.ok(attribute, `native body should preserve ${attributeName}`);
  for (let index = 0; index < attribute.array.length; index += 1) {
    assert.ok(Number.isFinite(attribute.array[index]), `${attributeName} should remain finite after body shaping`);
  }
}

assert.ok(geometry.boundingBox && geometry.boundingSphere, 'body shaping should refresh geometry bounds');
assert.ok(geometry.boundingSphere.radius > 0, 'refined body should retain a non-zero visible bound');

console.log('Prisma native body shape verification passed.');
