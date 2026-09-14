import assert from 'node:assert/strict';
import { constants as zlibConstants, gunzipSync } from 'node:zlib';
import part01 from '../src/player/prisma-native/generated/part-01.js';
import part02 from '../src/player/prisma-native/generated/part-02.js';
import part03 from '../src/player/prisma-native/generated/part-03.js';
import part04 from '../src/player/prisma-native/generated/part-04.js';
import part05 from '../src/player/prisma-native/generated/part-05.js';
import part06 from '../src/player/prisma-native/generated/part-06.js';
import part07 from '../src/player/prisma-native/generated/part-07.js';
import part08 from '../src/player/prisma-native/generated/part-08.js';
import part09 from '../src/player/prisma-native/generated/part-09.js';
import part10 from '../src/player/prisma-native/generated/part-10.js';
import part11 from '../src/player/prisma-native/generated/part-11.js';
import part12 from '../src/player/prisma-native/generated/part-12.js';
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

const packedParts = [part01, part02, part03, part04, part05, part06, part07, part08, part09, part10, part11, part12];
const packedText = packedParts.join('');
const historicalPart8Prefix = 'NAosCy4LKwspCywLKwstCy8LLgssCy0L';

console.log('Prisma packed part diagnostics:');
packedParts.forEach((part, index) => {
  const invalid = [...new Set(part.replace(/[A-Za-z0-9+/=]/g, ''))].join('');
  console.log(
    `part-${String(index + 1).padStart(2, '0')}: length=${part.length} mod4=${part.length % 4}`
      + ` start=${part.slice(0, 12)} end=${part.slice(-12)} padding=${(part.match(/=/g) ?? []).length}`
      + ` invalid=${JSON.stringify(invalid)}`
  );
});
console.log(
  `packed-total: length=${packedText.length} mod4=${packedText.length % 4}`
    + ` padding=${(packedText.match(/=/g) ?? []).length}`
    + ` historical-part8-prefix-index=${packedText.indexOf(historicalPart8Prefix)}`
);

const relaxedCompressed = Buffer.from(packedText, 'base64');
console.log(
  `relaxed-decode: bytes=${relaxedCompressed.length}`
    + ` first4=${relaxedCompressed.subarray(0, 4).toString('hex')}`
    + ` last16=${relaxedCompressed.subarray(-16).toString('hex')}`
);
try {
  const relaxedUnpacked = gunzipSync(relaxedCompressed, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
  console.log(
    `relaxed-gunzip: bytes=${relaxedUnpacked.length}`
      + ` first4=${relaxedUnpacked.subarray(0, 4).toString('ascii')}`
      + ` last16=${relaxedUnpacked.subarray(-16).toString('hex')}`
  );
} catch (error) {
  console.log(`relaxed-gunzip-error: ${error?.code ?? error?.name}: ${error?.message}`);
}

assert.notEqual(
  packedText.length % 4,
  1,
  'bundled Prisma base64 is structurally truncated; repair the generated chunks before native-body verification can proceed'
);

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
