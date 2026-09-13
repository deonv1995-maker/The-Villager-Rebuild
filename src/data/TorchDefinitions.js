import { WORLD_DAY_MINUTES, WORLD_TIME } from './WorldTimeDefinitions.js';

const nightDurationGameMinutes =
  (WORLD_DAY_MINUTES - WORLD_TIME.phases.nightStart) + WORLD_TIME.phases.dawnStart;

export const TORCH = Object.freeze({
  itemId: 'torch',
  burnDurationGameMinutes: nightDurationGameMinutes * 0.5,
  light: Object.freeze({
    color: 0xffa24f,
    intensity: 58,
    distance: 10.5,
    decay: 2,
    follow: Object.freeze({
      response: 11,
      maxDeltaSeconds: 0.05,
      snapDistance: 1.5
    }),
    flicker: Object.freeze({
      intensityVariance: 0.08,
      distanceVariance: 0.02,
      flameScaleVariance: 0.12,
      slowHz: 2.2,
      middleHz: 4.1,
      highHz: 7.3,
      smoothingResponse: 9
    }),
    shadow: Object.freeze({
      mapSize: 128,
      near: 0.12,
      far: 11,
      bias: -0.0015,
      normalBias: 0.035,
      intensity: 0.72,
      refreshHz: 30
    })
  }),
  visual: Object.freeze({
    handleLength: 0.7,
    handleRadius: 0.035,
    flameHeight: 0.22,
    fallbackPosition: Object.freeze({ x: 0.48, y: 1.18, z: 0.1 })
  })
});
