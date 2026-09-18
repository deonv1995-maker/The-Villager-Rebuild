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

export function semanticStairColliderSpecs({ x, z, yaw, baseY, topY = null }) {
  const stepRise = semanticStairStepRise();
  const resolvedTopY = Number.isFinite(topY)
    ? topY
    : baseY + PANEL_GRID.storeyHeight;
  const specs = [];
  for (let index = 0; index < PANEL_STAIR.stepCount; index += 1) {
    const localZ = -PANEL_STAIR.runLength * 0.5 + PANEL_STAIR.stepRun * (index + 0.5);
    const world = localToWorld({ x, z, yaw }, 0, localZ);
    // Keep the established tiny tread clearance on the intermediate steps, but seat
    // tread six on the exact upper-floor walking surface. The final support must hand
    // off to a Floor without creating a false drop at the top of the flight.
    const supportY = index === PANEL_STAIR.stepCount - 1
      ? resolvedTopY
      : baseY + stepRise * (index + 1) + 0.018;
    specs.push({
      role: 'tread',
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

  // A semantic Stair reserves the whole target upper-floor cell as its stairwell opening,
  // while the compact six-tread visual ends short of that cell's far edge. Bridge only
  // that remaining top-level strip so the Ranger can stand at the head of the stairs,
  // turn onto a side Floor, or continue onto the next Floor instead of stepping into the
  // reserved opening. This remains part of the Stair's shared collision authority.
  const lastTreadLocalZ = -PANEL_STAIR.runLength * 0.5 +
    PANEL_STAIR.stepRun * (PANEL_STAIR.stepCount - 0.5);
  const lastTreadSupportEnd = lastTreadLocalZ + PANEL_STAIR.stepRun * 0.56;
  const landingStart = lastTreadSupportEnd - PHYSICAL_LOG.floorSupportSeamPadding;
  const landingEnd = PANEL_GRID.cellSize;
  if (landingEnd > landingStart) {
    const localZ = (landingStart + landingEnd) * 0.5;
    const world = localToWorld({ x, z, yaw }, 0, localZ);
    const halfZ = (landingEnd - landingStart) * 0.5;
    specs.push({
      role: 'landing',
      x: world.x,
      z: world.z,
      halfX: PANEL_STAIR.width * 0.5,
      halfZ,
      yaw,
      bottomY: resolvedTopY - Math.max(0.1, PHYSICAL_LOG.floorUndersideDepth * 0.5),
      topY: resolvedTopY + 0.035,
      standable: true,
      supportHalfX: PANEL_STAIR.width * 0.5 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportHalfZ: halfZ + PHYSICAL_LOG.floorSupportSeamPadding,
      supportY: resolvedTopY,
      supportOverridesBase: true,
      supportOverrideTolerance: PANEL_GRID.storeyHeight,
      stepHeight: PHYSICAL_LOG.stairMaxStepRise
    });
  }

  return specs;
}
