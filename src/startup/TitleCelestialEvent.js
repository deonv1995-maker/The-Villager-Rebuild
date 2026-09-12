import * as THREE from 'three';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const NIGHT_SKY = new THREE.Color(0x071729);
const BLUE_FLASH = new THREE.Color(0x8de9ff);

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pulseAt = (value, center, width) => {
  const distance = Math.abs(value - center) / Math.max(0.0001, width);
  if (distance >= 1) return 0;
  return (1 - distance) ** 2;
};

export class TitleCelestialEvent {
  constructor({ scene, renderer, hemi, sun, ambient, lightning }) {
    this.scene = scene;
    this.renderer = renderer;
    this.hemi = hemi;
    this.sun = sun;
    this.ambient = ambient;
    this.lightning = lightning;
    this.elapsed = 0;
    this.shootingStarPosition = new THREE.Vector3();
    this.shootingStarStart = new THREE.Vector3(32, 31, -92);
    this.shootingStarEnd = new THREE.Vector3(-7, 10.5, -81);
    this.trailDirection = new THREE.Vector3();
    this.#createStars();
    this.#createShootingStar();
  }

  update(dt, { active = false, introProgress = 0 } = {}) {
    this.elapsed += dt;
    if (!active) {
      this.starField.visible = false;
      this.shootingStar.visible = false;
      this.shootingStarLight.intensity = 0;
      return { night: 0, flash: 0, shootingStarProgress: 0 };
    }

    const night = THREE.MathUtils.smoothstep(
      introProgress,
      TITLE_SCENE.nightStart,
      TITLE_SCENE.nightFull
    );
    const flash = pulseAt(
      introProgress,
      TITLE_SCENE.blueFlashAt,
      TITLE_SCENE.blueFlashWidth
    );
    const shootingStarProgress = THREE.MathUtils.clamp(
      (introProgress - TITLE_SCENE.shootingStarStart)
        / Math.max(0.001, TITLE_SCENE.shootingStarEnd - TITLE_SCENE.shootingStarStart),
      0,
      1
    );

    this.#updateNight(night, flash);
    this.#updateShootingStar(introProgress, shootingStarProgress);
    return { night, flash, shootingStarProgress };
  }

  #createStars() {
    const random = createRandom(0x5a7a11);
    const count = 190;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = (random() * 2 - 1) * 95;
      positions[offset + 1] = 10 + random() * 60;
      positions[offset + 2] = -68 - random() * 90;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xdff5ff,
      size: 0.48,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    this.starField = new THREE.Points(geometry, material);
    this.starField.name = 'title-night-stars';
    this.starField.visible = false;
    this.scene.add(this.starField);
  }

  #createShootingStar() {
    this.shootingStar = new THREE.Group();
    this.shootingStar.name = 'title-sprout-shooting-star';
    this.shootingStar.visible = false;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xb9f4ff, fog: false })
    );
    core.name = 'title-sprout-shooting-star-core';
    this.shootingStar.add(core);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x42c9ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    glow.name = 'title-sprout-shooting-star-glow';
    this.shootingStar.add(glow);

    const trailPositions = new Float32Array(6);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x68ddff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.shootingStarTrail = new THREE.Line(trailGeometry, trailMaterial);
    this.shootingStarTrail.name = 'title-sprout-shooting-star-trail';
    this.scene.add(this.shootingStarTrail);
    this.shootingStarTrail.visible = false;

    this.shootingStarLight = new THREE.PointLight(0x68ddff, 0, 72, 2);
    this.shootingStar.add(this.shootingStarLight);
    this.scene.add(this.shootingStar);
  }

  #updateNight(night, flash) {
    this.starField.visible = night > 0.02;
    this.starField.material.opacity = THREE.MathUtils.clamp(night * 0.9, 0, 0.9);

    this.scene.background.lerp(NIGHT_SKY, night * 0.82);
    this.scene.fog.color.lerp(NIGHT_SKY, night * 0.7);
    if (flash > 0) {
      this.scene.background.lerp(BLUE_FLASH, flash * 0.8);
      this.scene.fog.color.lerp(BLUE_FLASH, flash * 0.68);
    }

    this.sun.intensity *= THREE.MathUtils.lerp(1, 0.34, night);
    this.hemi.intensity *= THREE.MathUtils.lerp(1, 0.58, night);
    this.ambient.intensity *= THREE.MathUtils.lerp(1, 0.62, night);
    this.sun.intensity += flash * 3.8;
    this.hemi.intensity += flash * 2.6;
    this.ambient.intensity += flash * 1.15;
    this.lightning.intensity = Math.max(this.lightning.intensity, flash * 10.5);
    this.renderer.toneMappingExposure = Math.max(
      0.72,
      this.renderer.toneMappingExposure * THREE.MathUtils.lerp(1, 0.82, night) + flash * 0.32
    );
  }

  #updateShootingStar(introProgress, progress) {
    const visible = introProgress >= TITLE_SCENE.shootingStarStart;
    this.shootingStar.visible = visible;
    this.shootingStarTrail.visible = visible;
    if (!visible) {
      this.shootingStarLight.intensity = 0;
      return;
    }

    const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
    this.shootingStarPosition.lerpVectors(this.shootingStarStart, this.shootingStarEnd, eased);
    this.shootingStar.position.copy(this.shootingStarPosition);
    this.shootingStar.rotation.z = this.elapsed * 2.8;
    this.shootingStarLight.intensity = 5.8 + Math.sin(this.elapsed * 19) * 0.7;

    this.trailDirection.subVectors(this.shootingStarEnd, this.shootingStarStart).normalize();
    const tail = this.shootingStarPosition.clone().addScaledVector(this.trailDirection, -8.5);
    const positions = this.shootingStarTrail.geometry.attributes.position;
    positions.setXYZ(0, tail.x, tail.y, tail.z);
    positions.setXYZ(1, this.shootingStarPosition.x, this.shootingStarPosition.y, this.shootingStarPosition.z);
    positions.needsUpdate = true;
    this.shootingStarTrail.material.opacity = THREE.MathUtils.lerp(0.92, 0.48, progress);
  }
}
