import * as THREE from 'three';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pulseAt = (value, center, width) => {
  const distance = Math.abs(value - center) / width;
  if (distance >= 1) return 0;
  return (1 - distance) ** 3;
};

export class TitleStormSystem {
  constructor({ scene, camera, renderer, hemi, sun, ambient, lightning }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.hemi = hemi;
    this.sun = sun;
    this.ambient = ambient;
    this.lightning = lightning;
    this.random = createRandom(0x51f0a7);
    this.elapsed = 0;
    this.sprayAccumulator = 0;
    this.sprayCursor = 0;
    this.bowWorld = new THREE.Vector3();
    this.calmSky = new THREE.Color(0x9fcde1);
    this.stormSky = new THREE.Color(0x354956);
    this.oceanCalmColor = new THREE.Color(0x3d91ae);
    this.oceanStormColor = new THREE.Color(0x214f63);
    this.#createOcean();
    this.#createWeather();
  }

  setShip(ship, bowOffset) {
    this.ship = ship;
    this.bowOffset = bowOffset.clone();
  }

  update(dt, { danger = 0, introProgress = 0 } = {}) {
    this.elapsed += dt;
    this.#updateOcean(danger);
    this.#updateAtmosphere(dt, danger, introProgress);
    this.#updateBowEffects(dt, danger, introProgress);
    this.#updateRangerSplash(dt);
  }

  triggerRangerSplash(position) {
    this.rangerSplash.visible = true;
    this.rangerSplash.position.set(position.x, TITLE_SCENE.oceanY + 0.05, position.z);
    this.rangerSplash.scale.setScalar(0.75);
    this.rangerSplash.material.opacity = 0.92;
  }

  #createOcean() {
    const geometry = new THREE.PlaneGeometry(340, 340, 48, 48);
    geometry.rotateX(-Math.PI / 2);
    this.oceanBasePositions = Float32Array.from(geometry.attributes.position.array);
    const material = new THREE.MeshStandardMaterial({
      color: this.oceanCalmColor.clone(),
      roughness: 0.32,
      metalness: 0.08,
      transparent: true,
      opacity: 0.97
    });
    this.ocean = new THREE.Mesh(geometry, material);
    this.ocean.name = 'title-ocean';
    this.ocean.position.y = TITLE_SCENE.oceanY;
    this.scene.add(this.ocean);

    const foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xe6f5f4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.bowFoam = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.25, 22), foamMaterial);
    this.bowFoam.rotation.x = -Math.PI / 2;
    this.bowFoam.position.y = TITLE_SCENE.oceanY + 0.035;
    this.scene.add(this.bowFoam);

    this.wreckFoam = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 26), foamMaterial.clone());
    this.wreckFoam.rotation.x = -Math.PI / 2;
    this.wreckFoam.position.y = TITLE_SCENE.oceanY + 0.045;
    this.wreckFoam.visible = false;
    this.scene.add(this.wreckFoam);

    this.rangerSplash = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 24), foamMaterial.clone());
    this.rangerSplash.rotation.x = -Math.PI / 2;
    this.rangerSplash.position.y = TITLE_SCENE.oceanY + 0.05;
    this.rangerSplash.visible = false;
    this.scene.add(this.rangerSplash);
  }

  #createWeather() {
    const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0x33424a,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0
    });
    this.stormClouds = new THREE.Group();
    this.stormClouds.name = 'title-storm-clouds';
    const cloudLayout = [
      [-22, 14.5, -34, 8.4, 2.4, 5.0], [-9, 16, -42, 10.5, 2.8, 5.8],
      [6, 15.2, -38, 9.5, 2.6, 5.3], [20, 14.4, -47, 8.2, 2.2, 4.5],
      [-16, 12.8, -58, 11.4, 2.7, 5.5], [1, 13.6, -61, 12.4, 3.0, 6.0],
      [18, 12.7, -64, 10.0, 2.5, 5.3]
    ];
    for (const [x, y, z, sx, sy, sz] of cloudLayout) {
      const cloud = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
      cloud.position.set(x, y, z);
      cloud.scale.set(sx, sy, sz);
      this.stormClouds.add(cloud);
    }
    this.scene.add(this.stormClouds);

    const rainCount = 520;
    const rainPositions = new Float32Array(rainCount * 3);
    const random = createRandom(0x7a11ce);
    for (let index = 0; index < rainCount; index += 1) {
      const offset = index * 3;
      rainPositions[offset] = (random() * 2 - 1) * 24;
      rainPositions[offset + 1] = random() * 22;
      rainPositions[offset + 2] = (random() * 2 - 1) * 28;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({
        color: 0xc8e3e7,
        size: 0.075,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.rain.name = 'title-storm-rain';
    this.scene.add(this.rain);

    const sprayCount = 110;
    const sprayPositions = new Float32Array(sprayCount * 3);
    sprayPositions.fill(-100);
    const sprayGeometry = new THREE.BufferGeometry();
    sprayGeometry.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
    this.sprayVelocities = new Float32Array(sprayCount * 3);
    this.sprayLife = new Float32Array(sprayCount);
    this.spray = new THREE.Points(
      sprayGeometry,
      new THREE.PointsMaterial({
        color: 0xe8f7f5,
        size: 0.16,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
      })
    );
    this.spray.name = 'title-bow-spray';
    this.scene.add(this.spray);
  }

  #updateOcean(danger) {
    const position = this.ocean.geometry.attributes.position;
    const array = position.array;
    const base = this.oceanBasePositions;
    const amplitude = THREE.MathUtils.lerp(0.12, TITLE_SCENE.stormWaveAmplitudeMax, danger);
    const speed = 1 + danger * TITLE_SCENE.stormWaveSpeedBoost;

    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const x = base[offset];
      const z = base[offset + 2];
      const primary = Math.sin(x * 0.065 + this.elapsed * 0.92 * speed);
      const secondary = Math.cos(z * 0.052 - this.elapsed * 0.76 * speed);
      const chop = Math.sin((x + z) * 0.17 + this.elapsed * 2.7) * danger;
      const crest = primary * Math.abs(primary) * danger;
      array[offset + 1] = amplitude * (
        primary * 0.5 +
        secondary * 0.34 +
        chop * 0.08 +
        crest * 0.12
      );
    }

    position.needsUpdate = true;
    this.ocean.geometry.computeVertexNormals();
    this.ocean.material.color.copy(this.oceanCalmColor).lerp(this.oceanStormColor, danger * 0.92);
    this.ocean.material.roughness = THREE.MathUtils.lerp(0.32, 0.22, danger);
  }

  #updateAtmosphere(dt, danger, introProgress) {
    const flash = Math.max(
      pulseAt(introProgress, 0.36, 0.018),
      pulseAt(introProgress, 0.56, 0.013),
      pulseAt(introProgress, 0.71, 0.019)
    );

    const sky = this.calmSky.clone().lerp(this.stormSky, danger * 0.9);
    if (flash > 0) sky.lerp(new THREE.Color(0xd9edf2), flash * 0.58);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.density = THREE.MathUtils.lerp(0.0085, 0.014, danger);
    this.sun.intensity = THREE.MathUtils.lerp(3.1, 0.65, danger) + flash * 1.6;
    this.hemi.intensity = THREE.MathUtils.lerp(2.5, 1.15, danger) + flash * 0.8;
    this.ambient.intensity = THREE.MathUtils.lerp(0.18, 0.08, danger);
    this.lightning.intensity = flash * 7.5;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.9, danger) + flash * 0.12;
    this.cloudMaterial.opacity = danger * 0.78;
    this.stormClouds.position.x = Math.sin(this.elapsed * 0.08) * 2.4;

    const rainPosition = this.rain.geometry.attributes.position;
    const rainArray = rainPosition.array;
    this.rain.material.opacity = danger * 0.72;
    this.rain.position.set(this.camera.position.x, 0, this.camera.position.z - 8);
    const rainSpeed = 16 + danger * 18;
    const wind = 4 + danger * 7;
    for (let index = 0; index < rainPosition.count; index += 1) {
      const offset = index * 3;
      rainArray[offset] -= dt * wind;
      rainArray[offset + 1] -= dt * rainSpeed;
      if (rainArray[offset + 1] < -2) {
        rainArray[offset + 1] += 24;
        rainArray[offset] = (this.random() * 2 - 1) * 24;
        rainArray[offset + 2] = (this.random() * 2 - 1) * 28;
      }
    }
    rainPosition.needsUpdate = danger > 0.01;
  }

  #updateBowEffects(dt, danger, introProgress) {
    if (!this.ship || !this.bowOffset) return;
    this.ship.updateMatrixWorld(true);
    this.bowWorld.copy(this.bowOffset);
    this.ship.localToWorld(this.bowWorld);

    this.bowFoam.position.set(this.bowWorld.x, TITLE_SCENE.oceanY + 0.035, this.bowWorld.z + 0.4);
    const foamPulse = 1 + Math.sin(this.elapsed * (1.8 + danger * 1.8)) * 0.1;
    const foamScale = foamPulse * THREE.MathUtils.lerp(1, 1.82, danger);
    this.bowFoam.scale.set(1.3 * foamScale, foamScale, 1);
    this.bowFoam.material.opacity = THREE.MathUtils.lerp(0.12, 0.56, danger);

    const impact = THREE.MathUtils.smoothstep(introProgress, 0.66, 0.78);
    this.wreckFoam.visible = impact > 0.02;
    if (this.wreckFoam.visible) {
      this.wreckFoam.position.set(this.bowWorld.x, TITLE_SCENE.oceanY + 0.045, this.bowWorld.z - 0.7);
      const scale = 1 + impact * 3.6;
      this.wreckFoam.scale.set(scale * 1.25, scale, 1);
      this.wreckFoam.material.opacity = (1 - impact * 0.52) * 0.78;
    }

    const rate = introProgress > 0 ? THREE.MathUtils.lerp(5, 96, danger) : 2;
    this.sprayAccumulator += dt * rate;
    while (this.sprayAccumulator >= 1) {
      this.sprayAccumulator -= 1;
      this.#spawnSprayParticle(danger);
    }

    const sprayPosition = this.spray.geometry.attributes.position;
    const sprayArray = sprayPosition.array;
    for (let index = 0; index < this.sprayLife.length; index += 1) {
      if (this.sprayLife[index] <= 0) continue;
      this.sprayLife[index] -= dt;
      const offset = index * 3;
      sprayArray[offset] += this.sprayVelocities[offset] * dt;
      sprayArray[offset + 1] += this.sprayVelocities[offset + 1] * dt;
      sprayArray[offset + 2] += this.sprayVelocities[offset + 2] * dt;
      this.sprayVelocities[offset + 1] -= 8.8 * dt;
      if (sprayArray[offset + 1] <= TITLE_SCENE.oceanY) this.sprayLife[index] = 0;
      if (this.sprayLife[index] <= 0) sprayArray[offset + 1] = -100;
    }
    sprayPosition.needsUpdate = true;
    this.spray.material.opacity = THREE.MathUtils.lerp(0.2, 0.76, danger);
    this.spray.material.size = THREE.MathUtils.lerp(0.12, 0.2, danger);
  }

  #spawnSprayParticle(danger) {
    const index = this.sprayCursor;
    this.sprayCursor = (this.sprayCursor + 1) % this.sprayLife.length;
    const offset = index * 3;
    const positions = this.spray.geometry.attributes.position.array;
    const side = (this.random() * 2 - 1) * (0.8 + danger * 1.2);
    positions[offset] = this.bowWorld.x + side;
    positions[offset + 1] = TITLE_SCENE.oceanY + 0.12 + this.random() * 0.18;
    positions[offset + 2] = this.bowWorld.z - this.random() * 0.9;
    this.sprayVelocities[offset] = side * (0.6 + danger * 0.8);
    this.sprayVelocities[offset + 1] = 1.4 + this.random() * (1.5 + danger * 3.1);
    this.sprayVelocities[offset + 2] = -0.8 - this.random() * (0.9 + danger * 2.2);
    this.sprayLife[index] = 0.45 + this.random() * (0.35 + danger * 0.4);
  }

  #updateRangerSplash(dt) {
    if (!this.rangerSplash.visible) return;
    const next = Math.min(8, this.rangerSplash.scale.x + dt * 4.2);
    this.rangerSplash.scale.set(next, next, 1);
    this.rangerSplash.material.opacity = Math.max(0, this.rangerSplash.material.opacity - dt * 0.72);
  }
}
