import * as THREE from 'three';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const DEFAULT_FOV = 48;

const pulseAt = (value, center, width) => {
  const distance = Math.abs(value - center) / Math.max(0.0001, width);
  if (distance >= 1) return 0;
  return (1 - distance) ** 2;
};

export class TitleCinematicCamera {
  constructor({ camera, ship, celestialEvent } = {}) {
    if (!camera || !ship || !celestialEvent) {
      throw new Error('TitleCinematicCamera requires camera, ship, and celestial event');
    }

    this.camera = camera;
    this.ship = ship;
    this.celestialEvent = celestialEvent;
    this.basePosition = new THREE.Vector3();
    this.focusPosition = new THREE.Vector3();
    this.baseLookTarget = new THREE.Vector3();
    this.celestialTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
  }

  apply({ active = false, introProgress = 0, elapsed = 0 } = {}) {
    if (!active) {
      this.#setFov(DEFAULT_FOV);
      return { attention: 0, flashKick: 0 };
    }

    const focusIn = THREE.MathUtils.smootherstep(
      introProgress,
      TITLE_SCENE.celestialFocusStart,
      TITLE_SCENE.celestialFocusFull
    );
    const focusOut = 1 - THREE.MathUtils.smootherstep(
      introProgress,
      TITLE_SCENE.celestialFocusRelease,
      TITLE_SCENE.celestialFocusEnd
    );
    const attention = THREE.MathUtils.clamp(focusIn * focusOut, 0, 1);
    const flashKick = pulseAt(
      introProgress,
      TITLE_SCENE.blueFlashAt,
      TITLE_SCENE.blueFlashWidth * 1.65
    );

    this.basePosition.copy(this.camera.position);
    this.focusPosition.copy(this.basePosition);
    this.focusPosition.x += TITLE_SCENE.celestialFocusCameraSide * attention;
    this.focusPosition.y += TITLE_SCENE.celestialFocusCameraLift * attention;
    this.focusPosition.z -= TITLE_SCENE.celestialFocusCameraPush * attention;

    const handHeldDrift = attention * 0.045;
    this.focusPosition.x += Math.sin(elapsed * 1.7) * handHeldDrift;
    this.focusPosition.y += Math.cos(elapsed * 1.45) * handHeldDrift * 0.55;
    this.camera.position.lerp(this.focusPosition, attention);

    this.baseLookTarget.set(
      this.ship.position.x,
      1.45,
      this.ship.position.z - 9.5
    );
    this.celestialEvent.getFocusPosition(this.celestialTarget);
    this.lookTarget.lerpVectors(this.baseLookTarget, this.celestialTarget, attention);
    this.lookTarget.y += flashKick * 0.8;
    this.camera.lookAt(this.lookTarget);

    const focusFov = THREE.MathUtils.lerp(
      DEFAULT_FOV,
      TITLE_SCENE.celestialFocusFov,
      attention
    );
    this.#setFov(focusFov - flashKick * 1.4);

    return { attention, flashKick };
  }

  #setFov(value) {
    const next = THREE.MathUtils.clamp(value, 30, DEFAULT_FOV);
    if (Math.abs(this.camera.fov - next) < 0.001) return;
    this.camera.fov = next;
    this.camera.updateProjectionMatrix();
  }
}
