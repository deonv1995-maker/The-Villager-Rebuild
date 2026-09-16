import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';

const HERO_PARTS = [
  'public/assets/player/hero_m.glb.gz.part0.b64',
  'public/assets/player/hero_m.glb.gz.part1.b64',
  'public/assets/player/hero_m.glb.gz.part2.b64'
];

const compressed = Buffer.concat(
  HERO_PARTS.map(path => Buffer.from(readFileSync(path, 'utf8').trim(), 'base64'))
);
const glb = gunzipSync(compressed);
const body = await parseHeroMGlb(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
body.updateMatrixWorld(true);

const rootInverse = body.getWorldQuaternion(new THREE.Quaternion()).invert();
const rootOrigin = body.getWorldPosition(new THREE.Vector3());
const temp = new THREE.Vector3();
const world = new THREE.Vector3();

const bones = [];
body.traverse(object => {
  if (!object.isBone) return;
  const position = object.getWorldPosition(new THREE.Vector3())
    .sub(rootOrigin)
    .applyQuaternion(rootInverse);
  bones.push({ bone: object, position });
});

for (const { bone, position } of bones) {
  const points = [];
  let influenced = 0;
  let dominant = 0;

  body.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const jointIndex = object.skeleton.bones.indexOf(bone);
    if (jointIndex < 0) return;
    const positions = object.geometry?.getAttribute?.('position');
    const skinIndex = object.geometry?.getAttribute?.('skinIndex');
    const skinWeight = object.geometry?.getAttribute?.('skinWeight');
    if (!positions || !skinIndex || !skinWeight) return;

    for (let index = 0; index < positions.count; index += 1) {
      let weight = 0;
      for (let component = 0; component < 4; component += 1) {
        if (skinIndex.getComponent(index, component) === jointIndex) {
          weight += skinWeight.getComponent(index, component);
        }
      }
      if (weight <= 0.001) continue;
      influenced += 1;
      if (weight < 0.5) continue;
      dominant += 1;
      temp.fromBufferAttribute(positions, index);
      object.localToWorld(world.copy(temp));
      points.push(body.worldToLocal(world.clone()));
    }
  });

  const box = new THREE.Box3();
  for (const point of points) box.expandByPoint(point);
  const center = box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  console.log(JSON.stringify({
    bone: bone.name,
    parent: bone.parent?.isBone ? bone.parent.name : bone.parent?.name ?? null,
    pivot: position.toArray(),
    influenced,
    dominant,
    dominantCenter: center?.toArray() ?? null,
    dominantSize: size?.toArray() ?? null,
    dominantMin: box.isEmpty() ? null : box.min.toArray(),
    dominantMax: box.isEmpty() ? null : box.max.toArray()
  }));
}
