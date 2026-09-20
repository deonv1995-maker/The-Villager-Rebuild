export const TERRAIN_SCULPT_MODES = Object.freeze([
  'raise',
  'lower',
  'dig',
  'smooth',
  'level'
]);

export const TERRAIN_SCULPT_DEFAULT_MODE = 'dig';

export const TERRAIN_SCULPTING = Object.freeze({
  schemaVersion: 1,
  stateKind: 'terrain-sculpting-v1',
  reach: 5.4,
  brushRadius: 2.4,
  raiseAmount: 0.38,
  lowerAmount: 0.38,
  smoothStrength: 0.58,
  levelStrength: 0.72,
  maxSurfaceOffset: 8,
  editBucketSize: 6,
  targetRayStep: 0.18,
  targetRefineSteps: 7
});

export const TERRAIN_SCULPT_DEFINITIONS = Object.freeze({
  raise: Object.freeze({
    id: 'raise',
    label: 'Raise ground',
    caption: 'RAISE',
    help: 'Lift the ground inside the brush.'
  }),
  lower: Object.freeze({
    id: 'lower',
    label: 'Lower ground',
    caption: 'LOWER',
    help: 'Lower the surface without creating an underground tunnel.'
  }),
  dig: Object.freeze({
    id: 'dig',
    label: 'Dig',
    caption: 'DIG',
    help: 'Excavate real 3D tunnels, caves and underground rooms.'
  }),
  smooth: Object.freeze({
    id: 'smooth',
    label: 'Smoothen',
    caption: 'SMOOTH',
    help: 'Blend sharp terrain changes toward the surrounding ground.'
  }),
  level: Object.freeze({
    id: 'level',
    label: 'Level',
    caption: 'LEVEL',
    help: 'Flatten the brush toward the height under the white dot.'
  })
});
