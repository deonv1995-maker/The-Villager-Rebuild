import * as THREE from 'three';
import { CELESTIAL_PRESENTATION } from '../data/CelestialDefinitions.js';
import { celestialDirectionAt, celestialVisibilityForDirection } from './CelestialOrbit.js';

function createBodyVisual(definition, name) {
  const root = new THREE.Group();
  root.name = `${name}-celestial-body`;

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
    celestialDirectionAt(minuteOfDay, { target: this.sunDirection });
    celestialDirectionAt(minuteOfDay, { moon: true, target: this.moonDirection });

    this.#place(this.sun, this.sunDirection);
    this.#place(this.moon, this.moonDirection);
  }

  #place(body, direction) {
    const visibility = celestialVisibilityForDirection(direction);
    body.root.visible = visibility > 0.001;
    if (!body.root.visible) return;

    this.positionScratch.copy(direction)
      .multiplyScalar(CELESTIAL_PRESENTATION.orbitRadius)
      .add(this.camera.position);
    body.root.position.copy(this.positionScratch);
    body.bodyMaterial.opacity = visibility;
    body.haloMaterial.opacity = body.baseHaloOpacity * visibility;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const body of [this.sun, this.moon]) {
      body.bodyGeometry.dispose();
      body.bodyMaterial.dispose();
      body.haloGeometry.dispose();
      body.haloMaterial.dispose();
    }
  }
}
