import * as THREE from 'three';
import { CELESTIAL_PRESENTATION } from '../data/CelestialDefinitions.js';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { celestialDirectionAt } from './CelestialOrbit.js';

const KEYFRAMES = Object.freeze([
  Object.freeze({ minute: 0, sky: 0x071624, fog: 0x142631, hemiSky: 0x243a55, hemiGround: 0x0d1512, hemiIntensity: 0.62, sunColor: 0xb6cae8, sunIntensity: 0.05, fillColor: 0x7498ce, fillIntensity: 0.44, ambientColor: 0x91aac4, ambientIntensity: 0.13, exposure: 0.78 }),
  Object.freeze({ minute: 300, sky: 0x17314b, fog: 0x344453, hemiSky: 0x526a85, hemiGround: 0x263028, hemiIntensity: 0.82, sunColor: 0xc8d8ef, sunIntensity: 0.12, fillColor: 0x789bcb, fillIntensity: 0.42, ambientColor: 0xa8bdd1, ambientIntensity: 0.13, exposure: 0.82 }),
  Object.freeze({ minute: 360, sky: 0x8197b4, fog: 0x8a8992, hemiSky: 0xbecbd8, hemiGround: 0x4a5046, hemiIntensity: 1.2, sunColor: 0xffb77b, sunIntensity: 0.78, fillColor: 0x9fb5cb, fillIntensity: 0.4, ambientColor: 0xd5dbe0, ambientIntensity: 0.13, exposure: 0.9 }),
  Object.freeze({ minute: 480, sky: 0xaeddec, fog: 0xa9c7bc, hemiSky: 0xe7f4f7, hemiGround: 0x42533c, hemiIntensity: 2.2, sunColor: 0xffe3b4, sunIntensity: 2.85, fillColor: 0x8fc1d4, fillIntensity: 0.48, ambientColor: 0xffffff, ambientIntensity: 0.12, exposure: 1.06 }),
  Object.freeze({ minute: 720, sky: 0xbfe7f3, fog: 0xb6d1c7, hemiSky: 0xf1fbff, hemiGround: 0x52654a, hemiIntensity: 2.35, sunColor: 0xfff1d2, sunIntensity: 3.05, fillColor: 0x95c7dc, fillIntensity: 0.46, ambientColor: 0xffffff, ambientIntensity: 0.13, exposure: 1.08 }),
  Object.freeze({ minute: 1020, sky: 0xb8d7df, fog: 0xc5bba4, hemiSky: 0xe9e3d0, hemiGround: 0x5a5944, hemiIntensity: 1.95, sunColor: 0xffbd78, sunIntensity: 2.15, fillColor: 0x8eafc0, fillIntensity: 0.42, ambientColor: 0xf7ead9, ambientIntensity: 0.13, exposure: 1.0 }),
  Object.freeze({ minute: 1140, sky: 0x806d87, fog: 0x786c72, hemiSky: 0xa99cad, hemiGround: 0x3a3d35, hemiIntensity: 1.05, sunColor: 0xff8d5e, sunIntensity: 0.72, fillColor: 0x8197ba, fillIntensity: 0.42, ambientColor: 0xc6b8bd, ambientIntensity: 0.13, exposure: 0.88 }),
  Object.freeze({ minute: 1200, sky: 0x26324b, fog: 0x303742, hemiSky: 0x526482, hemiGround: 0x1e2822, hemiIntensity: 0.72, sunColor: 0xb9c9e4, sunIntensity: 0.12, fillColor: 0x7898c5, fillIntensity: 0.48, ambientColor: 0xa2b3c8, ambientIntensity: 0.14, exposure: 0.8 }),
  Object.freeze({ minute: 1320, sky: 0x0b1b2b, fog: 0x192933, hemiSky: 0x2d425d, hemiGround: 0x111a16, hemiIntensity: 0.62, sunColor: 0xb6cae8, sunIntensity: 0.05, fillColor: 0x7498ce, fillIntensity: 0.44, ambientColor: 0x91aac4, ambientIntensity: 0.13, exposure: 0.78 }),
  Object.freeze({ minute: WORLD_DAY_MINUTES, sky: 0x071624, fog: 0x142631, hemiSky: 0x243a55, hemiGround: 0x0d1512, hemiIntensity: 0.62, sunColor: 0xb6cae8, sunIntensity: 0.05, fillColor: 0x7498ce, fillIntensity: 0.44, ambientColor: 0x91aac4, ambientIntensity: 0.13, exposure: 0.78 })
]);

const lerp = (a, b, t) => a + (b - a) * t;

function keyframePair(minuteOfDay) {
  const minute = Math.max(0, Math.min(WORLD_DAY_MINUTES, Number(minuteOfDay) || 0));
  for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
    const from = KEYFRAMES[index];
    const to = KEYFRAMES[index + 1];
    if (minute <= to.minute) {
      const span = Math.max(1, to.minute - from.minute);
      return { from, to, t: THREE.MathUtils.smoothstep((minute - from.minute) / span, 0, 1) };
    }
  }
  return { from: KEYFRAMES.at(-2), to: KEYFRAMES.at(-1), t: 1 };
}

export class DayNightLightingSystem {
  constructor({ sceneSystem } = {}) {
    if (!sceneSystem?.scene || !sceneSystem?.lighting || !sceneSystem?.renderer) {
      throw new Error('DayNightLightingSystem requires a SceneSystem with named lighting');
    }
    this.scene = sceneSystem.scene;
    this.renderer = sceneSystem.renderer;
    this.lighting = sceneSystem.lighting;
    this.colorScratch = new THREE.Color();
    this.sunDirection = new THREE.Vector3();
  }

  apply(snapshot) {
    const minuteOfDay = Number(snapshot?.minuteOfDay) || 0;
    const { from, to, t } = keyframePair(minuteOfDay);

    this.#lerpColor(this.scene.background, from.sky, to.sky, t);
    if (this.scene.fog?.color) this.#lerpColor(this.scene.fog.color, from.fog, to.fog, t);

    this.#lerpColor(this.lighting.hemi.color, from.hemiSky, to.hemiSky, t);
    this.#lerpColor(this.lighting.hemi.groundColor, from.hemiGround, to.hemiGround, t);
    this.lighting.hemi.intensity = lerp(from.hemiIntensity, to.hemiIntensity, t);

    this.#lerpColor(this.lighting.sun.color, from.sunColor, to.sunColor, t);
    this.lighting.sun.intensity = lerp(from.sunIntensity, to.sunIntensity, t);
    this.#positionSun(minuteOfDay);

    this.#lerpColor(this.lighting.skyFill.color, from.fillColor, to.fillColor, t);
    this.lighting.skyFill.intensity = lerp(from.fillIntensity, to.fillIntensity, t);

    this.#lerpColor(this.lighting.ambient.color, from.ambientColor, to.ambientColor, t);
    this.lighting.ambient.intensity = lerp(from.ambientIntensity, to.ambientIntensity, t);
    this.renderer.toneMappingExposure = lerp(from.exposure, to.exposure, t);
  }

  #lerpColor(target, fromHex, toHex, amount) {
    target.setHex(fromHex);
    this.colorScratch.setHex(toHex);
    target.lerp(this.colorScratch, amount);
  }

  #positionSun(minuteOfDay) {
    celestialDirectionAt(minuteOfDay, { target: this.sunDirection });
    this.lighting.sun.position.set(
      this.sunDirection.x * CELESTIAL_PRESENTATION.lightDistance,
      Math.max(4, this.sunDirection.y * CELESTIAL_PRESENTATION.lightDistance),
      this.sunDirection.z * CELESTIAL_PRESENTATION.lightDistance
    );
  }
}
