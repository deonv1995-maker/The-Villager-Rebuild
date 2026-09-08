import * as THREE from 'three';
import {
  PANEL_GRID,
  PANEL_STAIR
} from '../data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  createPhysicalLogVisual,
  createSplitHalfLogVisual
} from './PhysicalLogVisual.js';

const localToWorld = ({ x, z, yaw }, localX, localZ) => ({
  x: x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
  z: z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ
});

export function semanticStairStepRise() {
  return PANEL_GRID.storeyHeight / PANEL_STAIR.stepCount;
}

export function createSemanticStairPanelVisual(name = 'SemanticStairs') {
  const group = new THREE.Group();
  group.name = name;
  group.userData.semanticStairs = true;

  const stepRise = semanticStairStepRise();
  const treadWidthScale = PANEL_STAIR.width / PHYSICAL_LOG.length;
  for (let index = 0; index < PANEL_STAIR.stepCount; index += 1) {
    const tread = createSplitHalfLogVisual(`SemanticStairTread${index + 1}`);
    tread.scale.x = treadWidthScale;
    tread.position.set(
      0,
      stepRise * (index + 1),
      -PANEL_STAIR.runLength * 0.5 + PANEL_STAIR.stepRun * (index + 0.5)
    );
    group.add(tread);
  }

  const totalRise = PANEL_GRID.storeyHeight;
  const slope = new THREE.Vector3(0, totalRise, PANEL_STAIR.runLength);
  const slopeLength = slope.length();
  slope.normalize();
  const supportQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    slope
  );
  const sideOffset = PANEL_STAIR.width * 0.5 - PHYSICAL_LOG.radius * 0.72;
  for (const [side, label] of [[-1, 'Left'], [1, 'Right']]) {
    const support = createPhysicalLogVisual(`SemanticStairStringer${label}`);
    support.scale.x = slopeLength / PHYSICAL_LOG.length;
    support.position.set(
      side * sideOffset,
      totalRise * 0.5 - PHYSICAL_LOG.radius * 0.9,
      0
    );
    support.quaternion.copy(supportQuaternion);
    group.add(support);
  }

  return group;
}

export function semanticStairColliderSpecs({ x, z, yaw, baseY }) {
  const stepRise = semanticStairStepRise();
  const specs = [];
  for (let index = 0; index < PANEL_STAIR.stepCount; index += 1) {
    const localZ = -PANEL_STAIR.runLength * 0.5 + PANEL_STAIR.stepRun * (index + 0.5);
    const world = localToWorld({ x, z, yaw }, 0, localZ);
    const supportY = baseY + stepRise * (index + 1) + 0.018;
    specs.push({
      x: world.x,
      z: world.z,
      halfX: PANEL_STAIR.width * 0.5,
      halfZ: PANEL_STAIR.stepRun * 0.52,
      yaw,
      bottomY: supportY - Math.max(0.24, stepRise * 0.68),
      topY: supportY + 0.035,
      standable: true,
      supportHalfX: PANEL_STAIR.width * 0.5,
      supportHalfZ: PANEL_STAIR.stepRun * 0.56,
      supportY,
      supportOverridesBase: true,
      supportOverrideTolerance: PANEL_GRID.storeyHeight,
      stepHeight: PHYSICAL_LOG.stairMaxStepRise
    });
  }
  return specs;
}
