import * as THREE from 'three';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const NIGHT_SKY = new THREE.Color(0x071729);
const BLUE_FLASH = new THREE.Color(0x8de9ff);
const FLIGHT_AXIS = new THREE.Vector3(0, 1, 0);

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
    this.shootingStarStart = new THREE.Vector3(38, 34, -96);
    this.shootingStarEnd = new THREE.Vector3(-7, 10.5, -81);
    this.travelDirection = new THREE.Vector3()
      .subVectors(this.shootingStarEnd, this.shootingStarStart)
      .normalize();
    this.flightQuaternion = new THREE.Quaternion().setFromUnitVectors(
      FLIGHT_AXIS,
      this.travelDirection
    );
    this.shootingStarPosition.copy(this.shootingStarStart);
    this.#createStars();
    this.#createShootingStar();
  }

  update(dt, { active = false, introProgress = 0 } = {}) {
    this.elapsed += dt;
    if (!active) {
      this.starField.visible = false;
      this.shootingStar.visible = false;
      this.shootingStarTrail.visible = false;
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

  getFocusPosition(target = new THREE.Vector3()) {
    return target.copy(this.shootingStarPosition);
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
      new THREE.MeshBasicMaterial({ color: 0xd8fbff, fog: false })
    );
    core.name = 'title-sprout-shooting-star-core';
    this.shootingStar.add(core);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x42c9ff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    glow.name = 'title-sprout-shooting-star-glow';
    this.shootingStarGlow = glow;
    this.shootingStar.add(glow);

    this.velocityFrame = new THREE.Group();
    this.velocityFrame.name = 'title-sprout-flight-frame';
    this.velocityFrame.quaternion.copy(this.flightQuaternion);
    this.shootingStar.add(this.velocityFrame);

    this.outerPlasmaTail = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 17, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x1aa8ff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.outerPlasmaTail.name = 'title-sprout-outer-plasma-tail';
    this.outerPlasmaTail.position.y = -8.5;
    this.velocityFrame.add(this.outerPlasmaTail);

    this.innerPlasmaTail = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 12.5, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x87eaff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.innerPlasmaTail.name = 'title-sprout-inner-plasma-tail';
    this.innerPlasmaTail.position.y = -6.25;
    this.velocityFrame.add(this.innerPlasmaTail);

    this.heatBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0xc9f7ff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.heatBubble.name = 'title-sprout-bow-shock-heat-bubble';
    this.heatBubble.position.y = 1.25;
    this.heatBubble.scale.set(1.05, 1.5, 1.05);
    this.velocityFrame.add(this.heatBubble);

    this.heatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.105, 8, 20),
      new THREE.MeshBasicMaterial({
        color: 0xe6fdff,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.heatRim.name = 'title-sprout-bow-shock-rim';
    this.heatRim.position.y = 2.1;
    this.heatRim.rotation.x = Math.PI / 2;
    this.heatRim.scale.set(1.18, 0.9, 1);
    this.velocityFrame.add(this.heatRim);

    const trailPositions = new Float32Array(6);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x9aebff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.shootingStarTrail = new THREE.Line(trailGeometry, trailMaterial);
    this.shootingStarTrail.name = 'title-sprout-shooting-star-trail';
    this.scene.add(this.shootingStarTrail);
    this.shootingStarTrail.visible = false;

    this.shootingStarLight = new THREE.PointLight(0x68ddff, 0, 82, 2);
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
      this.shootingStarPosition.copy(this.shootingStarStart);
      this.shootingStarLight.intensity = 0;
      return;
    }

    const accelerated = Math.pow(progress, 1.18);
    this.shootingStarPosition.lerpVectors(
      this.shootingStarStart,
      this.shootingStarEnd,
      accelerated
    );
    this.shootingStar.position.copy(this.shootingStarPosition);
    this.shootingStar.rotation.z = Math.sin(this.elapsed * 7.5) * 0.035;

    const plasmaFlicker = 1 + Math.sin(this.elapsed * 24) * 0.08;
    const heatPulse = 1 + Math.sin(this.elapsed * 18 + 0.6) * 0.06;
    this.shootingStarGlow.scale.setScalar(plasmaFlicker);
    this.outerPlasmaTail.scale.set(plasmaFlicker, 0.92 + progress * 0.22, plasmaFlicker);
    this.innerPlasmaTail.scale.set(heatPulse, 0.95 + progress * 0.3, heatPulse);
    this.heatBubble.scale.set(1.05 * heatPulse, 1.5 * heatPulse, 1.05 * heatPulse);
    this.heatRim.scale.set(1.18 * heatPulse, 0.9 * heatPulse, heatPulse);
    this.heatRim.material.opacity = 0.45 + Math.sin(this.elapsed * 20) * 0.08;
    this.shootingStarLight.intensity = 6.5 + progress * 2.6 + Math.sin(this.elapsed * 19) * 0.9;

    const trailLength = 14 + progress * 8;
    const tail = this.shootingStarPosition.clone().addScaledVector(
      this.travelDirection,
      -trailLength
    );
    const positions = this.shootingStarTrail.geometry.attributes.position;
    positions.setXYZ(0, tail.x, tail.y, tail.z);
    positions.setXYZ(1, this.shootingStarPosition.x, this.shootingStarPosition.y, this.shootingStarPosition.z);
    positions.needsUpdate = true;
    this.shootingStarTrail.material.opacity = THREE.MathUtils.lerp(0.98, 0.62, progress);
  }
}
