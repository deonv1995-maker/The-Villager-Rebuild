import * as THREE from 'three';

const WATER_VERTEX_SHADER = `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
varying vec2 vWorldXZ;

void main() {
  vec3 transformed = position;
  float waveA = sin(position.x * 0.055 + uTime * 0.82);
  float waveB = cos(position.z * 0.071 - uTime * 0.61);
  float waveC = sin((position.x + position.z) * 0.032 + uTime * 0.37);
  transformed.y += waveA * 0.025 + waveB * 0.018 + waveC * 0.012;

  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWorldXZ = worldPosition.xz;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT_SHADER = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uWaterColor;
uniform vec3 uHighlightColor;
uniform float uOpacity;
varying vec2 vWorldXZ;

void main() {
  float broad = sin(vWorldXZ.x * 0.035 + uTime * 0.46) * 0.5 + 0.5;
  float crossWave = cos(vWorldXZ.y * 0.051 - uTime * 0.39) * 0.5 + 0.5;
  float shimmer = sin((vWorldXZ.x + vWorldXZ.y) * 0.082 + uTime * 0.72) * 0.5 + 0.5;
  float blend = clamp(0.24 + broad * 0.18 + crossWave * 0.13 + shimmer * 0.08, 0.0, 0.72);
  vec3 color = mix(uWaterColor, uHighlightColor, blend);
  gl_FragColor = vec4(color, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class WaterSurfaceSystem {
  constructor({ group, terrain, maxRipples = 12 }) {
    this.group = group;
    this.terrain = terrain;
    this.maxRipples = maxRipples;
    this.surface = null;
    this.material = null;
    this.ripples = [];
    this.rippleCursor = 0;
    this.elapsed = 0;
    this.distanceSinceRipple = 0;
    this.previousPlayerPosition = new THREE.Vector3();
    this.hasPreviousPlayerPosition = false;
  }

  create() {
    this.surface = this.group.getObjectByName('foundation-water');
    if (!this.surface) throw new Error('WaterSurfaceSystem requires foundation-water');

    this.surface.geometry?.dispose?.();
    this.surface.material?.dispose?.();
    this.surface.geometry = new THREE.PlaneGeometry(
      this.terrain.extentX * 2 + 360,
      this.terrain.extentZ * 2 + 380,
      72,
      54
    );
    this.surface.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterColor: { value: new THREE.Color(0x4faebb) },
        uHighlightColor: { value: new THREE.Color(0x9ddbd3) },
        uOpacity: { value: 0.78 }
      },
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      fog: true
    });
    this.surface.material = this.material;
    this.surface.position.y = this.terrain.waterLevel;
    this.surface.renderOrder = -2;

    const rippleGeometry = new THREE.RingGeometry(0.55, 0.76, 24);
    rippleGeometry.rotateX(-Math.PI / 2);
    for (let index = 0; index < this.maxRipples; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd7fff3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(rippleGeometry, material);
      mesh.name = `water-ripple-${index}`;
      mesh.visible = false;
      mesh.position.y = this.terrain.waterLevel + 0.035;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.ripples.push({ mesh, age: 0, duration: 0.9, strength: 1, active: false });
    }

    return this.maxRipples;
  }

  isShallowWaterAt(x, z) {
    if (!this.terrain.isPlayable(x, z, 0.15)) return false;
    const ground = this.terrain.heightAt(x, z);
    const depth = this.terrain.waterLevel - ground;
    return depth >= 0.025 && depth <= 1.25;
  }

  #spawnRipple(x, z, strength = 1) {
    if (this.ripples.length === 0) return;
    const ripple = this.ripples[this.rippleCursor];
    this.rippleCursor = (this.rippleCursor + 1) % this.ripples.length;
    ripple.age = 0;
    ripple.duration = THREE.MathUtils.lerp(0.82, 1.05, THREE.MathUtils.clamp(strength, 0, 1));
    ripple.strength = THREE.MathUtils.clamp(strength, 0.55, 1.15);
    ripple.active = true;
    ripple.mesh.visible = true;
    ripple.mesh.position.set(x, this.terrain.waterLevel + 0.04, z);
    ripple.mesh.scale.setScalar(0.68);
    ripple.mesh.material.opacity = 0.36 * ripple.strength;
  }

  #updateRipples(dt) {
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;
      ripple.age += dt;
      const progress = THREE.MathUtils.clamp(ripple.age / ripple.duration, 0, 1);
      const scale = THREE.MathUtils.lerp(0.68, 2.55 + ripple.strength * 0.55, progress);
      ripple.mesh.scale.setScalar(scale);
      ripple.mesh.material.opacity = (1 - progress) ** 1.7 * 0.36 * ripple.strength;
      if (progress >= 1) {
        ripple.active = false;
        ripple.mesh.visible = false;
        ripple.mesh.material.opacity = 0;
      }
    }
  }

  update(dt, playerPosition) {
    this.elapsed += dt;
    if (this.material) this.material.uniforms.uTime.value = this.elapsed;
    this.#updateRipples(dt);
    if (!playerPosition) return;

    if (!this.hasPreviousPlayerPosition) {
      this.previousPlayerPosition.copy(playerPosition);
      this.hasPreviousPlayerPosition = true;
      return;
    }

    const dx = playerPosition.x - this.previousPlayerPosition.x;
    const dz = playerPosition.z - this.previousPlayerPosition.z;
    const distance = Math.hypot(dx, dz);
    const speed = distance / Math.max(0.001, dt);
    const inWater = this.isShallowWaterAt(playerPosition.x, playerPosition.z);

    if (inWater && distance > 0.002 && speed > 0.22) {
      this.distanceSinceRipple += distance;
      const spacing = speed > 4.2 ? 0.72 : 0.95;
      if (this.distanceSinceRipple >= spacing) {
        this.distanceSinceRipple %= spacing;
        this.#spawnRipple(
          playerPosition.x,
          playerPosition.z,
          THREE.MathUtils.clamp(0.58 + speed * 0.08, 0.58, 1.08)
        );
      }
    } else if (!inWater) {
      this.distanceSinceRipple = 0;
    }

    this.previousPlayerPosition.copy(playerPosition);
  }

  getActiveRippleCount() {
    return this.ripples.reduce((count, ripple) => count + (ripple.active ? 1 : 0), 0);
  }
}
