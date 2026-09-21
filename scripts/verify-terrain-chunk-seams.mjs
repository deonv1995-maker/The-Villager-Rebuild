import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExpandedIslandTerrainSystem } from '../src/world/ExpandedIslandTerrainSystem.js';

const EPSILON = 0.00002;

const edgeSamples = (mesh, localX) => {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const color = mesh.geometry.getAttribute('color');
  const samples = [];

  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getX(index) - localX) > 0.00001) continue;
    samples.push({
      z: mesh.position.z + position.getZ(index),
      y: position.getY(index),
      normal: new THREE.Vector3(
        normal.getX(index),
        normal.getY(index),
        normal.getZ(index)
      ),
      color: new THREE.Color(
        color.getX(index),
        color.getY(index),
        color.getZ(index)
      )
    });
  }

  samples.sort((left, right) => left.z - right.z);
  return samples;
};

const interpolatedSample = (coarse, z) => {
  if (z <= coarse[0].z + EPSILON) return coarse[0];
  if (z >= coarse.at(-1).z - EPSILON) return coarse.at(-1);

  let upperIndex = coarse.findIndex(sample => sample.z >= z - EPSILON);
  if (upperIndex <= 0) upperIndex = 1;
  const lower = coarse[upperIndex - 1];
  const upper = coarse[upperIndex];
  const span = Math.max(EPSILON, upper.z - lower.z);
  const t = THREE.MathUtils.clamp((z - lower.z) / span, 0, 1);

  return {
    z,
    y: THREE.MathUtils.lerp(lower.y, upper.y, t),
    normal: lower.normal.clone().lerp(upper.normal, t).normalize(),
    color: lower.color.clone().lerp(upper.color, t)
  };
};

const assertMixedDetailSeam = ({
  refined,
  coarse,
  refinedSegments,
  coarseSegments,
  sharedLocalXRefined,
  sharedLocalXCoarse,
  label
}) => {
  assert.ok(refined, `${label}: refined chunk must exist`);
  assert.ok(coarse, `${label}: coarse neighbor must exist`);
  assert.equal(
    refined.userData.terrainSegments,
    refinedSegments,
    `${label}: source chunk must use the expected refined tessellation`
  );
  assert.equal(
    coarse.userData.terrainSegments,
    coarseSegments,
    `${label}: neighbor must remain on the base tessellation`
  );

  const refinedEdge = edgeSamples(refined, sharedLocalXRefined);
  const coarseEdge = edgeSamples(coarse, sharedLocalXCoarse);
  assert.equal(
    refinedEdge.length,
    refinedSegments + 1,
    `${label}: refined edge must expose every expected edge vertex`
  );
  assert.equal(
    coarseEdge.length,
    coarseSegments + 1,
    `${label}: coarse edge must expose every expected edge vertex`
  );

  for (const sample of refinedEdge) {
    const expected = interpolatedSample(coarseEdge, sample.z);
    assert.ok(
      Math.abs(sample.y - expected.y) <= EPSILON,
      `${label}: refined edge height must stay on the coarse neighbor polyline at z=${sample.z}`
    );
    assert.ok(
      sample.color.distanceTo(expected.color) <= EPSILON,
      `${label}: refined edge colour must interpolate from the same canonical coarse samples`
    );
    assert.ok(
      sample.normal.distanceTo(expected.normal) <= 0.00008,
      `${label}: refined edge normals must match canonical coarse-edge shading`
    );
  }
};

const group = new THREE.Group();
const terrain = new ExpandedIslandTerrainSystem(group);
terrain.create();

const chunkSize = 72;
const halfChunk = chunkSize * 0.5;

terrain.setTunnelingOpenings([
  {
    x: halfChunk,
    z: halfChunk,
    radius: 3,
    radiusX: 3,
    radiusZ: 3,
    rotation: 0
  }
]);

assertMixedDetailSeam({
  refined: group.getObjectByName('terrain-chunk-0-0'),
  coarse: group.getObjectByName('terrain-chunk-1-0'),
  refinedSegments: terrain.tunnelTerrainSegments,
  coarseSegments: terrain.chunkTerrainSegments,
  sharedLocalXRefined: halfChunk,
  sharedLocalXCoarse: -halfChunk,
  label: 'tunnel-detail seam'
});

const sculptRegion = {
  x: chunkSize * 2 + halfChunk,
  z: halfChunk,
  radius: 2
};
terrain.setSurfaceSculptRegions([sculptRegion]);
terrain.rebuildTerrainForCircles([sculptRegion]);

assertMixedDetailSeam({
  refined: group.getObjectByName('terrain-chunk-2-0'),
  coarse: group.getObjectByName('terrain-chunk-3-0'),
  refinedSegments: terrain.sculptTerrainSegments,
  coarseSegments: terrain.chunkTerrainSegments,
  sharedLocalXRefined: halfChunk,
  sharedLocalXCoarse: -halfChunk,
  label: 'surface-sculpt seam'
});

console.log('Terrain chunk seam regression checks passed.');
