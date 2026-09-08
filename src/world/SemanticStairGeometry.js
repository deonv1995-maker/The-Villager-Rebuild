import * as THREE from 'three';
import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  createPhysicalLogVisual,
  createSplitHalfLogVisual
} from './PhysicalLogVisual.js';

const TREAD_COUNT = PHYSICAL_LOG.stairStepCount;
const RUN_LENGTH = PANEL_GRID.cellSize;
const STEP_RUN = RUN_LENGTH / (TREAD_COUNT - 1);
const STEP_RISE = PANEL_GRID.storeyHeight / TREAD_COUNT;
const LOW_Z = -RUN_LENGTH * 0.5;

export const SEMANTIC_STAIR_GEOMETRY = Object.freeze({
  treadCount: TREAD_COUNT,
  runLength: RUN_LENGTH,
  stepRun: STEP_RUN,
  stepRise: STEP_RISE
});

export function createSemanticStairVisual(name = 'PanelStairs') {
  const root = new THREE.Group();
  root.name = name;
  root.userData.panelConstructionKind = 'stairs';

  for (let index = 0; index < TREAD_COUNT; index += 1) {
    const tread = createSplitHalfLogVisual(`SemanticStairTread${index + 1}`);
    tread.position.set(
      0,
      STEP_RISE * (index + 1),
      LOW_Z + STEP_RUN * index
    );
    root.add(tread);
  }

  const sideOffset = PHYSICAL_LOG.halfLength - PHYSICAL_LOG.radius * 0.72;
  const direction = new THREE.Vector3(0, PANEL_GRID.storeyHeight, RUN_LENGTH);
  const supportLength = direction.length();
  direction.normalize();
  const supportQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction
  );

  for (const [side, label] of [[-1, 'Left'], [1, 'Right']]) {
    const support = createPhysicalLogVisual(`SemanticStairSide${label}`);
    support.scale.x = supportLength / PHYSICAL_LOG.length;
    support.position.set(
      side * sideOffset,
      PANEL_GRID.storeyHeight * 0.5 - PHYSICAL_LOG.radius * 0.82,
      0
    );
    support.quaternion.copy(supportQuaternion);
    root.add(support);
  }

  return root;
}

export function semanticStairColliderSpecs({ x, z, yaw, baseY }) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return Array.from({ length: TREAD_COUNT }, (_, index) => {
    const localZ = LOW_Z + STEP_RUN * index;
    const supportY = baseY + STEP_RISE * (index + 1);
    return {
      x: x + s * localZ,
      z: z + c * localZ,
      halfX: PHYSICAL_LOG.halfLength,
      halfZ: Math.max(PHYSICAL_LOG.radius, STEP_RUN * 0.52),
      yaw,
      bottomY: supportY - PHYSICAL_LOG.radius * 2,
      topY: supportY,
      standable: true,
      supportHalfX: PHYSICAL_LOG.halfLength + PHYSICAL_LOG.floorSupportSeamPadding,
      supportHalfZ: STEP_RUN * 0.56 + PHYSICAL_LOG.floorSupportSeamPadding,
      supportY,
      supportOverridesBase: true,
      supportOverrideTolerance: PHYSICAL_LOG.floorSurfaceOverrideTolerance,
      stepHeight: PHYSICAL_LOG.stairMaxStepRise + 0.02
    };
  });
}
