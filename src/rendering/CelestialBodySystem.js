import * as THREE from 'three';
import { CELESTIAL_PRESENTATION } from '../data/CelestialDefinitions.js';
import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { celestialDirectionAt, celestialVisibilityForDirection } from './CelestialOrbit.js';

const TAU = Math.PI * 2;

function createSunRays(definition, name) {
  if (!definition.rays) return null;

  const rayDefinition = definition.rays;
  const vertices = [];
  const innerRadius = definition.radius * rayDefinition.innerRadiusScale;
  const outerRadius = definition.radius * rayDefinition.outerRadiusScale;
  const z = definition.radius * 0.025;

  for (let index = 0; index < rayDefinition.count; index += 1) {
    const angle = (index / rayDefinition.count) * TAU;
    const left = angle - rayDefinition.halfWidthRadians;
    const right = angle + rayDefinition.halfWidthRadians;
    vertices.push(
      Math.cos(left) * innerRadius, Math.sin(left) * innerRadius, z,
      Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, z,
      Math.cos(right) * innerRadius, Math.sin(right) * innerRadius, z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.MeshBasicMaterial({
    color: rayDefinition.color,
    transparent: true,
    opacity: rayDefinition.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${name}-rays`;

  return {
    mesh,
    geometry,
    material,
    baseOpacity: rayDefinition.opacity,
    rotationPerGameMinute: rayDefinition.rotationPerGameMinute,
    pulsePeriodGameMinutes: rayDefinition.pulsePeriodGameMinutes,
    pulseAmount: rayDefinition.pulseAmount
  };
}

function createSurfaceMarks(definition, name) {
  if (!definition.surfaceMarks?.length) return null;

  const material = new THREE.MeshBasicMaterial({
    color: definition.surfaceMarkColor,
    transparent: true,
    opacity: definition.surfaceMarkOpacity,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const group = new THREE.Group();
  group.name = `${name}-surface-marks`;
  const geometries = [];

  definition.surfaceMarks.forEach((mark, index) => {
    const geometry = new THREE.CircleGeometry(definition.radius * mark.radius, 18);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}-surface-mark-${index + 1}`;
    mesh.position.set(
      definition.radius * mark.x,
      definition.radius * mark.y,
      definition.radius * 1.015
    );
    mesh.scale.set(mark.scaleX ?? 1, mark.scaleY ?? 1, 1);
    group.add(mesh);
    geometries.push(geometry);
  });

  return {
    group,
    geometries,
    material,
    baseOpacity: definition.surfaceMarkOpacity
  };
}

function createBodyVisual(definition, name) {
  const root = new THREE.Group();
  root.name = `${name}-celestial-body`;

  const rays = createSunRays(definition, name);
  if (rays) root.add(rays.mesh);

  const bodyGeometry = new THREE.SphereGeometry(definition.radius, 24, 16);
  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: definition.color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `${name}-disc`;
  root.add(body);

  const surfaceMarks = createSurfaceMarks(definition, name);
  if (surfaceMarks) root.add(surfaceMarks.group);

  const haloGeometry = new THREE.SphereGeometry(
    definition.radius * definition.haloScale,
    20,
    12
  );
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: definition.haloColor,
    transparent: true,
    opacity: definition.haloOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.name = `${name}-halo`;
  root.add(halo);

  return {
    root,
    body,
    halo,
    rays,
    surfaceMarks,
    bodyGeometry,
    bodyMaterial,
    haloGeometry,
    haloMaterial,
    baseHaloOpacity: definition.haloOpacity
  };
}

export class CelestialBodySystem {
  constructor({ sceneSystem } = {}) {
    if (!sceneSystem?.scene || !sceneSystem?.camera) {
      throw new Error('CelestialBodySystem requires a SceneSystem with scene and camera');
    }

    this.scene = sceneSystem.scene;
    this.camera = sceneSystem.camera;
    this.group = new THREE.Group();
    this.group.name = 'celestial-bodies';
    this.scene.add(this.group);

    this.sun = createBodyVisual(CELESTIAL_PRESENTATION.sun, 'sun');
    this.moon = createBodyVisual(CELESTIAL_PRESENTATION.moon, 'moon');
    this.group.add(this.sun.root, this.moon.root);

    this.sunDirection = new THREE.Vector3();
    this.moonDirection = new THREE.Vector3();
    this.positionScratch = new THREE.Vector3();
  }

  apply(snapshot) {
    const minuteOfDay = Number(snapshot?.minuteOfDay) || 0;
    const day = Math.max(1, Number(snapshot?.day) || 1);
    const animationMinutes = (day - 1) * WORLD_DAY_MINUTES + minuteOfDay;
    celestialDirectionAt(minuteOfDay, { target: this.sunDirection });
    celestialDirectionAt(minuteOfDay, { moon: true, target: this.moonDirection });

    this.#place(this.sun, this.sunDirection, animationMinutes);
    this.#place(this.moon, this.moonDirection, animationMinutes);
  }

  #place(body, direction, animationMinutes) {
    const visibility = celestialVisibilityForDirection(direction);
    body.root.visible = visibility > 0.001;
    if (!body.root.visible) return;

    this.positionScratch.copy(direction)
      .multiplyScalar(CELESTIAL_PRESENTATION.orbitRadius)
      .add(this.camera.position);
    body.root.position.copy(this.positionScratch);
    body.root.lookAt(this.camera.position);
    body.bodyMaterial.opacity = visibility;
    body.haloMaterial.opacity = body.baseHaloOpacity * visibility;

    if (body.surfaceMarks) {
      body.surfaceMarks.material.opacity = body.surfaceMarks.baseOpacity * visibility;
    }

    if (body.rays) {
      const pulsePeriod = Math.max(1, body.rays.pulsePeriodGameMinutes);
      const pulse = 1 + Math.sin((animationMinutes / pulsePeriod) * TAU) * body.rays.pulseAmount;
      body.rays.mesh.rotation.z = (animationMinutes * body.rays.rotationPerGameMinute) % TAU;
      body.rays.material.opacity = body.rays.baseOpacity * pulse * visibility;
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const body of [this.sun, this.moon]) {
      body.bodyGeometry.dispose();
      body.bodyMaterial.dispose();
      body.haloGeometry.dispose();
      body.haloMaterial.dispose();
      body.rays?.geometry.dispose();
      body.rays?.material.dispose();
      body.surfaceMarks?.geometries.forEach(geometry => geometry.dispose());
      body.surfaceMarks?.material.dispose();
    }
  }
}
