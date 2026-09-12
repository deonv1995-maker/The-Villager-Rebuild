import { WORLD_DAY_MINUTES, WORLD_TIME } from './WorldTimeDefinitions.js';

const nightDurationGameMinutes =
  (WORLD_DAY_MINUTES - WORLD_TIME.phases.nightStart) + WORLD_TIME.phases.dawnStart;

export const TORCH = Object.freeze({
  itemId: 'torch',
  burnDurationGameMinutes: nightDurationGameMinutes * 0.5,
  light: Object.freeze({
    color: 0xffb45f,
    intensity: 72,
    distance: 11,
    decay: 2,
    height: 1.45
  }),
  visual: Object.freeze({
    handleLength: 0.7,
    handleRadius: 0.035,
    flameHeight: 0.22
  })
});
