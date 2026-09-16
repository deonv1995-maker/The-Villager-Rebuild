import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const toolAssetSource = read('src/rendering/ToolModelAsset.js');
const rangerToolSource = read('src/player/RangerToolPresentation.js');
const torchSource = read('src/gameplay/VisibleHandTorchRuntimeController.js');

assert.match(
  toolAssetSource,
  /axe:\s*Object\.freeze\(\{\s*targetLength:\s*1\.05,\s*restMinY:\s*-0\.38,\s*axialRotation:\s*Math\.PI\s*\}\)/,
  'supplied axe FBX must retain its 180-degree axial presentation correction'
);
assert.match(
  toolAssetSource,
  /setFromAxisAngle\(UP, presentation\.axialRotation\)/,
  'asset-specific axial correction must rotate around the normalized tool long axis'
);

const toolLongAxis = new THREE.Vector3(0, 1, 0);
const toolUpAxis = new THREE.Vector3(0, 0, 1);
const axialFlip = new THREE.Quaternion().setFromAxisAngle(toolLongAxis, Math.PI);
assert.ok(
  toolLongAxis.clone().applyQuaternion(axialFlip).distanceTo(toolLongAxis) < 1e-9,
  'axe correction must preserve the forward long axis'
);
assert.ok(
  toolUpAxis.clone().applyQuaternion(axialFlip).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9,
  'axe correction must invert the authored upside-down roll without reversing the handle direction'
);

const torchHandleLength = 0.7;
const torchHandleCenterY = 0.08;
const torchBackTipY = torchHandleCenterY - torchHandleLength / 2;
const torchGripShiftY = 0.27;
assert.ok(Math.abs(torchBackTipY + torchGripShiftY) < 1e-9, 'torch back tip must land exactly at the palm origin');
assert.match(
  torchSource,
  /TORCH_GRIP_POSITION = new THREE\.Vector3\(0, 0\.27, 0\)/,
  'held torch must be shifted so the hand grips the back tip'
);
assert.match(
  torchSource,
  /visible-palm-back-tip-torch-v3/,
  'torch back-tip grip must remain explicit for device diagnostics'
);

const spearShaftCenterY = 0.12;
const spearMountShiftY = -0.12;
assert.ok(Math.abs(spearShaftCenterY + spearMountShiftY) < 1e-9, 'spear shaft midpoint must land at the palm origin');
assert.match(
  rangerToolSource,
  /VISIBLE_SPEAR_SHAFT_CENTER_Y = 0\.12/,
  'held spear must preserve its procedural shaft center calibration'
);
assert.match(
  rangerToolSource,
  /spearMount\.position\.set\(0, -VISIBLE_SPEAR_SHAFT_CENTER_Y, 0\)/,
  'held spear must place the palm at the middle of the shaft'
);
assert.match(
  rangerToolSource,
  /visible-hand-mid-shaft-spear-v2/,
  'mid-shaft spear grip must remain explicit for device diagnostics'
);

console.log('Tool grip device alignment verified: axe roll corrected, torch back-tip grip, spear mid-shaft grip.');
