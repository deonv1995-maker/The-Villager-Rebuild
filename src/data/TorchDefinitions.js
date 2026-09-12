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
    angle: Math.PI * 0.34,
    penumbra: 0.82,
    aimDistance: 5.5,
    aimDrop: 1.35
  }),
  visual: Object.freeze({
    handleLength: 0.7,
    handleRadius: 0.035,
    flameHeight: 0.22,
    fallbackPosition: Object.freeze({ x: 0.48, y: 1.18, z: 0.1 })
  })
});
