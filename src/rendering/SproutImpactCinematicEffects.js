import * as THREE from 'three';
import { SPROUT_ARRIVAL } from '../data/SproutArrivalDefinitions.js';

const IMPACT_LIGHT_COLOR = 0x70ddff;
const IMPACT_DUST_COLOR = 0xb99b72;
const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const copyFinitePosition = (target, source) => {
  if (!source) return false;
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  target.set(x, y, z);
  return true;
};

export class SproutImpactCinematicEffects {
  constructor({ game } = {}) {
    if (!game?.sceneSystem?.scene) {
      throw new Error('SproutImpactCinematicEffects requires GameApp SceneSystem');
    }

    this.game = game;
    this.sceneSystem = game.sceneSystem;
    this.scene = game.sceneSystem.scene;
    this.shadowSystem = game.celestialShadows ?? null;
    this.config = SPROUT_ARRIVAL.impactEffects;
    this.site = new THREE.Vector3();
    this.elapsed = 0;
    this.descentActive = false;
    this.lastShadowRefreshElapsed = Number.NEGATIVE_INFINITY;
    this.dustAge = Number.POSITIVE_INFINITY;

    this.#createDescentLight();
    this.#createDust();
  }

  begin({ site, position = null } = {}) {
    if (!copyFinitePosition(this.site, site)) return false;

    this.elapsed = 0;
    this.descentActive = true;
    this.lastShadowRefreshElapsed = Number.NEGATIVE_INFINITY;
    this.descentTarget.position.set(this.site.x, this.site.y + 0.3, this.site.z);
    this.descentLight.visible = true;
    this.descentLight.intensity = this.config.shadowLight.startIntensity;
    if (!copyFinitePosition(this.descentLight.position, position)) {
      this.descentLight.position.set(this.site.x, this.site.y + SPROUT_ARRIVAL.incoming.startHeight, this.site.z);
    }
    this.#requestShadowRefresh(true);
    return true;
  }

  updateDescent(progress, position) {
    if (!this.descentActive) return;
    const t = clamp01(progress);
    copyFinitePosition(this.descentLight.position, position);

    const lightConfig = this.config.shadowLight;
    const intensity = THREE.MathUtils.lerp(
      lightConfig.startIntensity,
      lightConfig.endIntensity,
      THREE.MathUtils.smootherstep(t, 0, 1)
    );
    const flicker = Math.sin(this.elapsed * 23.5) * 0.9 + Math.sin(this.elapsed * 41.3 + 0.8) * 0.45;
    this.descentLight.intensity = Math.max(0, intensity + flicker);
    this.#requestShadowRefresh(t >= 0.985);
  }

  triggerImpact() {
    this.descentActive = false;
    this.descentLight.visible = false;
    this.descentLight.intensity = 0;

    this.dustAge = 0;
    this.dust.position.copy(this.site);
    this.dust.visible = true;
    this.dust.material.opacity = this.config.dust.opacity;
    this.#resetDustParticles();

    this.sceneSystem.triggerCameraShake?.(this.config.cameraShake);
    return true;
  }

  update(dt) {
    const step = Math.min(0.05, Math.max(0, Number(dt) || 0));
    this.elapsed += step;
    this.#updateDust(step);
  }

  reset() {
    this.descentActive = false;
    this.descentLight.visible = false;
    this.descentLight.intensity = 0;
    this.lastShadowRefreshElapsed = Number.NEGATIVE_INFINITY;
    this.dustAge = Number.POSITIVE_INFINITY;
    this.dust.visible = false;
    this.dust.material.opacity = 0;
  }

  dispose() {
    this.reset();
    this.descentLight.parent?.remove(this.descentLight);
    this.descentTarget.parent?.remove(this.descentTarget);
    this.dust.parent?.remove(this.dust);
    this.descentLight.shadow.map?.dispose?.();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
  }

  #createDescentLight() {
    const config = this.config.shadowLight;
    this.descentLight = new THREE.SpotLight(
      IMPACT_LIGHT_COLOR,
      0,
      config.distance,
      config.angle,
      config.penumbra,
      config.decay
    );
    this.descentLight.name = 'sprout-incoming-shadow-light';
    this.descentLight.visible = false;
    this.descentLight.castShadow = true;
    this.descentLight.shadow.autoUpdate = false;
    this.descentLight.shadow.mapSize.set(config.mapSize, config.mapSize);
    this.descentLight.shadow.camera.near = config.near;
    this.descentLight.shadow.camera.far = config.far;
    this.descentLight.shadow.bias = config.bias;
    this.descentLight.shadow.normalBias = config.normalBias;
    this.descentLight.shadow.camera.updateProjectionMatrix();

    this.descentTarget = new THREE.Object3D();
    this.descentTarget.name = 'sprout-incoming-shadow-target';
    this.descentLight.target = this.descentTarget;
    this.scene.add(this.descentLight, this.descentTarget);
  }

  #requestShadowRefresh(force = false) {
    const interval = 1 / Math.max(1, this.config.shadowLight.refreshHz);
    if (!force && this.elapsed - this.lastShadowRefreshElapsed < interval) return;
    this.lastShadowRefreshElapsed = this.elapsed;

    if (this.shadowSystem?.requestLightRefresh?.(this.descentLight)) return;
    this.descentLight.shadow.needsUpdate = true;
    if (this.sceneSystem.renderer?.shadowMap) {
      this.sceneSystem.renderer.shadowMap.needsUpdate = true;
    }
  }

  #createDust() {
    const config = this.config.dust;
    const count = Math.max(1, Math.floor(config.particleCount));
    this.dustBasePositions = new Float32Array(count * 3);
    this.dustVelocities = new Float32Array(count * 3);
    this.dustPositions = new Float32Array(count * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    const material = new THREE.PointsMaterial({
      color: IMPACT_DUST_COLOR,
      size: config.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true
    });

    this.dust = new THREE.Points(geometry, material);
    this.dust.name = 'sprout-impact-dust-burst';
    this.dust.visible = false;
    this.scene.add(this.dust);
    this.#seedDustParticles();
    this.#resetDustParticles();
  }

  #seedDustParticles() {
    const random = createRandom(0x5d057);
    const count = this.dustPositions.length / 3;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const angle = random() * Math.PI * 2;
      const radius = 0.35 + Math.pow(random(), 0.7) * 2.15;
      const speed = 1.2 + random() * 3.4;
      this.dustBasePositions[offset] = Math.cos(angle) * radius;
      this.dustBasePositions[offset + 1] = 0.12 + random() * 0.52;
      this.dustBasePositions[offset + 2] = Math.sin(angle) * radius;
      this.dustVelocities[offset] = Math.cos(angle) * speed * (0.76 + random() * 0.34);
      this.dustVelocities[offset + 1] = 0.55 + random() * 2.15;
      this.dustVelocities[offset + 2] = Math.sin(angle) * speed * (0.76 + random() * 0.34);
    }
  }

  #resetDustParticles() {
    this.dustPositions.set(this.dustBasePositions);
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  #updateDust(dt) {
    if (!Number.isFinite(this.dustAge)) return;
    const config = this.config.dust;
    this.dustAge += dt;
    const progress = clamp01(this.dustAge / config.durationSeconds);

    if (progress >= 1) {
      this.dustAge = Number.POSITIVE_INFINITY;
      this.dust.visible = false;
      this.dust.material.opacity = 0;
      return;
    }

    const age = this.dustAge;
    for (let offset = 0; offset < this.dustPositions.length; offset += 3) {
      this.dustPositions[offset] = this.dustBasePositions[offset] + this.dustVelocities[offset] * age;
      this.dustPositions[offset + 1] = Math.max(
        0.08,
        this.dustBasePositions[offset + 1]
          + this.dustVelocities[offset + 1] * age
          - 0.5 * config.gravity * age * age
      );
      this.dustPositions[offset + 2] = this.dustBasePositions[offset + 2] + this.dustVelocities[offset + 2] * age;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.material.opacity = config.opacity * (1 - progress) ** 1.45;
    this.dust.material.size = config.size * (1 + progress * 0.72);
  }
}
