import { WORLD_DAY_MINUTES, WORLD_TIME } from './WorldTimeDefinitions.js';

const nightDurationGameMinutes =
  (WORLD_DAY_MINUTES - WORLD_TIME.phases.nightStart) + WORLD_TIME.phases.dawnStart;

export const TORCH = Object.freeze({
  itemId: 'torch',
  burnDurationGameMinutes: nightDurationGameMinutes * 0.5,
  light: Object.freeze({
    color: 0xffa24f,
    intensity: 72,
    distance: 11,
    decay: 2,
    flicker: Object.freeze({
      intensityVariance: 0.18,
      distanceVariance: 0.045,
      flameScaleVariance: 0.16
    }),
    shadow: Object.freeze({
      mapSize: 256,
      near: 0.12,
      far: 11,
      bias: -0.0015,
      normalBias: 0.035,
      refreshHz: 10
    })
  }),
  visual: Object.freeze({
    handleLength: 0.7,
    handleRadius: 0.035,
    flameHeight: 0.22,
    fallbackPosition: Object.freeze({ x: 0.48, y: 1.18, z: 0.1 })
  })
});
