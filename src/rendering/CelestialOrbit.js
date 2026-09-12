import * as THREE from 'three';
import { CELESTIAL_PRESENTATION } from '../data/CelestialDefinitions.js';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';

const TAU = Math.PI * 2;
const MOON_PHASE_OFFSET = Math.PI;

const normalizeMinute = value => {
  const number = Number(value) || 0;
  const minute = number % WORLD_DAY_MINUTES;
  return minute < 0 ? minute + WORLD_DAY_MINUTES : minute;
};

export function celestialDirectionAt(minuteOfDay, { moon = false, target = new THREE.Vector3() } = {}) {
  const minute = normalizeMinute(minuteOfDay);
  const orbitAngle = ((minute - 6 * 60) / WORLD_DAY_MINUTES) * TAU
    + (moon ? MOON_PHASE_OFFSET : 0);
  const horizontal = Math.cos(orbitAngle);
  const elevation = Math.sin(orbitAngle);
  const azimuth = CELESTIAL_PRESENTATION.orbitAzimuthRadians;

  return target.set(
    horizontal * Math.cos(azimuth),
    elevation,
    horizontal * Math.sin(azimuth)
  ).normalize();
}

export function celestialVisibilityForDirection(direction) {
  return THREE.MathUtils.smoothstep(
    direction?.y ?? -1,
    CELESTIAL_PRESENTATION.horizonFadeStart,
    CELESTIAL_PRESENTATION.horizonFadeEnd
  );
}
