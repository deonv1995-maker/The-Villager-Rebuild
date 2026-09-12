import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../data/AssetPaths.js';
import { SPROUT_ARRIVAL } from '../data/SproutArrivalDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const BLUE = 0x56bfff;
const DEEP_BLUE = 0x1b5f9f;
const DARK_METAL = 0x26323d;
const BLACK_GLASS = 0x071014;
const CREAM = 0xded8c8;
const GREEN = 0x315b45;
const ORANGE = 0xd57a31;
const TREE_TRUNK = 0x6f472a;
const TREE_LEAF = 0x5f8c46;
const CRATER = 0x35332f;
const SCORCH = 0x1d2324;
const CRASH_LOG_COUNT = 4;
const CRASH_EXCLUSION_ID = 'sprout-crash-site';

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth01 = value => THREE.MathUtils.smoothstep(clamp01(value), 0, 1);

const CRASH_LOG_TRAPPED = Object.freeze([
  Object.freeze({ position: [-0.28, 0.43, 0.42], yaw: 0.1, roll: 0.06 }),
  Object.freeze({ position: [0.42, 0.62, 0.5], yaw: -0.16, roll: -0.08 }),
  Object.freeze({ position: [0.04, 0.81, 0.68], yaw: 0.32, roll: 0.11 }),
  Object.freeze({ position: [0.63, 0.99, 0.3], yaw: -0.38, roll: -0.12 })
]);

const CRASH_LOG_CLEARED = Object.freeze([
  Object.freeze({ position: [0.2, 0.22, 2.72], yaw: 0.22, roll: 0.02 }),
  Object.freeze({ position: [0.7, 0.27, 3.02], yaw: -0.25, roll: -0.03 }),
  Object.freeze({ position: [-0.22, 0.25, 3.22], yaw: 0.4, roll: 0.04 }),
  Object.freeze({ position: [0.42, 0.42, 3.42], yaw: -0.08, roll: -0.05 })
]);

const SCATTERED_DEBRIS = Object.freeze([
  Object.freeze({ position: [-3.25, 0.19, 1.55], size: [0.62, 0.12, 0.4], rotation: [0.18, -0.52, 0.24], material: 'green' }),
  Object.freeze({ position: [-4.15, 0.16, 1.02], size: [0.38, 0.14, 0.7], rotation: [0.42, 0.3, -0.16], material: 'dark' }),
  Object.freeze({ position: [-2.7, 0.24, 2.48], size: [0.44, 0.1, 0.84], rotation: [0.08, 0.88, 0.32], material: 'orange' }),
  Object.freeze({ position: [-5.05, 0.2, 2.18], size: [0.5, 0.13, 0.35], rotation: [0.25, -0.18, 0.48], material: 'dark' }),
  Object.freeze({ position: [-1.8, 0.18, -2.84], size: [0.7, 0.11, 0.32], rotation: [0.06, 0.65, -0.22], material: 'green' }),
  Object.freeze({ position: [2.72, 0.18, -2.08], size: [0.46, 0.12, 0.58], rotation: [0.3, -0.44, 0.18], material: 'orange' }),
  Object.freeze({ position: [3.45, 0.16, 1.62], size: [0.36, 0.16, 0.42], rotation: [0.52, 0.22, -0.38], material: 'dark' }),
  Object.freeze({ position: [-4.62, 0.18, -0.7], size: [0.82, 0.09, 0.34], rotation: [0.12, 0.1, 0.28], material: 'green' }),
  Object.freeze({ position: [-2.12, 0.22, 3.6], size: [0.34, 0.18, 0.38], rotation: [0.62, -0.2, 0.4], material: 'dark' }),
  Object.freeze({ position: [1.68, 0.2, 3.05], size: [0.5, 0.1, 0.32], rotation: [0.26, 0.72, -0.2], material: 'orange' })
]);

export class SproutCrashSiteSystem {
  constructor({ game }) {
    if (!game?.sceneSystem?.scene || !game?.island?.collision || !game?.gatherables) {
      throw new Error('SproutCrashSiteSystem requires a started GameApp with gatherables');
    }
    this.game = game;
    this.scene = game.sceneSystem.scene;
    this.island = game.island;
    this.collision = game.island.collision;
    this.gatherables = game.gatherables;
    this.site = null;
    this.root = null;
    this.incoming = null;
    this.incomingCore = null;
    this.incomingHalo = null;
    this.incomingTrail = null;
    this.incomingLight = null;
    this.impactShockwave = null;
    this.smoke = null;
    this.smokeBase = null;
    this.impactTreeAnchor = null;
    this.impactTreeVisual = null;
    this.impactTreeAssetReady = false;
    this.rescueLogs = [];
    this.sprout = null;
    this.sproutEye = null;
    this.treeCollider = null;
    this.podCollider = null;
    this.crashed = false;
    this.freed = false;
    this.logsReleased = false;
    this.elapsed = 0;
    this.impactFlashAge = Number.POSITIVE_INFINITY;
    this.rescueStart = null;
    this.rescueTarget = null;
    this.disposed = false;
  }

  resolveSite() {
    if (this.site) return { ...this.site };

    const spawn = this.island.getSpawnPoint?.() ?? { x: 0, z: 91 };
    const centerX = this.island.terrain?.centerX ?? 0;
    const centerZ = this.island.terrain?.centerZ ?? 0;
    const inland = new THREE.Vector2(centerX - spawn.x, centerZ - spawn.z);
    if (inland.lengthSq() < 0.001) inland.set(0, -1);
    inland.normalize();
    const lateral = new THREE.Vector2(-inland.y, inland.x);
    const config = SPROUT_ARRIVAL.crashSite;

    const findCandidate = clearanceRadius => {
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const distance of config.inlandDistances) {
        for (const offset of config.lateralOffsets) {
          const x = spawn.x + inland.x * distance + lateral.x * offset;
          const z = spawn.z + inland.y * distance + lateral.y * offset;
          if (!this.island.isPlayable?.(x, z, config.playableMargin)) continue;

          const height = this.island.baseHeightAt?.(x, z) ?? this.island.heightAt(x, z);
          const slope = this.island.slopeAt?.(x, z) ?? 0;
          if (!Number.isFinite(height) || !Number.isFinite(slope)) continue;
          if (slope > config.maxPreferredSlope * 1.6) continue;
          if (!this.collision.isCircleClear(x, z, clearanceRadius)) continue;

          const preferredSlopePenalty = Math.max(0, slope - config.maxPreferredSlope) * 18;
          const distancePenalty = Math.abs(distance - 28) * 0.05;
          const lateralPenalty = Math.abs(Math.abs(offset) - 9) * 0.025;
          const score = preferredSlopePenalty + distancePenalty + lateralPenalty;
          if (score >= bestScore) continue;
          bestScore = score;
          best = { x, z, y: height };
        }
      }
      return best;
    };

    const candidate = findCandidate(config.clearanceRadius)
      ?? findCandidate(config.relaxedClearanceRadius)
      ?? {
        x: spawn.x + inland.x * 24 + lateral.x * 7,
        z: spawn.z + inland.y * 24 + lateral.y * 7,
        y: 0
      };
    candidate.y = this.island.baseHeightAt?.(candidate.x, candidate.z)
      ?? this.island.heightAt(candidate.x, candidate.z);

    this.setSite(candidate);
    return { ...this.site };
  }

  setSite(site) {
    if (!Number.isFinite(site?.x) || !Number.isFinite(site?.z)) {
      throw new Error('Sprout crash site requires finite x and z coordinates');
    }
    const y = Number.isFinite(site.y)
      ? site.y
      : this.island.baseHeightAt?.(site.x, site.z) ?? this.island.heightAt(site.x, site.z);
    this.site = { x: site.x, y, z: site.z };
    this.#ensureVisuals();
    this.root.position.set(this.site.x, this.site.y, this.site.z);
    this.impactTreeAnchor.position.set(this.site.x, this.site.y, this.site.z);
    this.#positionIncomingAt(0);
    return { ...this.site };
  }

  beginImpact() {
    this.resolveSite();
    this.#setCrashPresentationExclusion(false);
    this.incoming.visible = true;
    this.root.visible = false;
    this.impactTreeAnchor.visible = true;
    if (this.impactTreeVisual) this.impactTreeVisual.rotation.z = 0;
    if (this.impactShockwave) this.impactShockwave.visible = false;
    this.#positionIncomingAt(0);
    this.incomingLight.visible = true;
    this.incomingLight.intensity = 5.2;
  }

  updateImpact(progress) {
    if (!this.site) return;
    const t = clamp01(progress);
    const flightT = Math.pow(t, 2.65);
    this.#positionIncomingAt(flightT);
    const pulse = 0.82 + Math.sin(this.elapsed * (18 + t * 18)) * 0.18;
    this.incomingCore.scale.set(0.72 + t * 0.32, 0.82 + t * 0.88, 0.72 + t * 0.32);
    this.incomingHalo.scale.setScalar((1.32 + t * 1.7) * pulse);
    this.incomingHalo.material.opacity = 0.2 + t * 0.56;
    if (this.incomingTrail) {
      this.incomingTrail.scale.set(1 + t * 0.32, 0.82 + t * 1.05, 1 + t * 0.32);
      this.incomingTrail.material.opacity = 0.25 + t * 0.38;
    }
    this.incomingLight.intensity = 5.2 + t * 12.5 + Math.max(0, Math.sin(this.elapsed * 26)) * 2.8;

    if (this.impactTreeVisual) {
      const treeFall = smooth01((t - 0.84) / 0.16);
      this.impactTreeVisual.rotation.z = -treeFall * 1.28;
      this.impactTreeVisual.rotation.x = treeFall * 0.12;
    }
  }

  completeImpact() {
    this.resolveSite();
    this.incoming.visible = false;
    this.impactTreeAnchor.visible = false;
    this.root.visible = true;
    this.crashed = true;
    this.freed = false;
    this.logsReleased = false;
    this.impactFlashAge = 0;
    this.#setCrashPresentationExclusion(true);
    if (this.impactShockwave) {
      this.impactShockwave.visible = true;
      this.impactShockwave.scale.setScalar(0.45);
      this.impactShockwave.material.opacity = 0.9;
    }
    this.#ensureCollision();
    this.#applyTrappedPose();
  }

  beginRescue() {
    if (!this.crashed || this.freed || this.rescueLogs.length === 0) return false;
    this.rescueStart = this.rescueLogs.map(log => ({
      position: log.position.clone(),
      rotation: log.rotation.clone()
    }));
    this.rescueTarget = CRASH_LOG_CLEARED.map(entry => ({
      position: new THREE.Vector3(...entry.position),
      rotation: new THREE.Euler(0, entry.yaw, entry.roll)
    }));
    return true;
  }

  updateRescue(progress) {
    if (!this.rescueStart || !this.rescueTarget) return;
    const t = smooth01(progress);
    this.rescueLogs.forEach((log, index) => {
      const start = this.rescueStart[index];
      const target = this.rescueTarget[index];
      log.position.lerpVectors(start.position, target.position, t);
      log.position.y += Math.sin(t * Math.PI) * (0.2 + index * 0.035);
      log.rotation.x = THREE.MathUtils.lerp(start.rotation.x, target.rotation.x, t);
      log.rotation.y = THREE.MathUtils.lerp(start.rotation.y, target.rotation.y, t);
      log.rotation.z = THREE.MathUtils.lerp(start.rotation.z, target.rotation.z, t);
    });
    if (this.sprout) {
      this.sprout.rotation.z = THREE.MathUtils.lerp(-1.2, -0.34, t);
      this.sprout.position.y = THREE.MathUtils.lerp(0.2, 0.48, t);
    }
  }

  completeRescue() {
    if (!this.crashed) return;
    this.freed = true;
    if (this.treeCollider) {
      this.collision.removeObstacle(this.treeCollider);
      this.treeCollider = null;
    }
    this.#applyFreedPose();
  }

  restore({ crashed = false, freed = false } = {}) {
    this.resolveSite();
    this.crashed = Boolean(crashed || freed);
    this.freed = Boolean(freed);
    this.logsReleased = false;
    this.incoming.visible = false;
    this.impactTreeAnchor.visible = false;
    this.root.visible = this.crashed;
    this.#setCrashPresentationExclusion(this.crashed);
    if (!this.crashed) return;
    this.#ensureCollision();
    if (this.freed) {
      if (this.treeCollider) {
        this.collision.removeObstacle(this.treeCollider);
        this.treeCollider = null;
      }
      this.#applyFreedPose();
    } else {
      this.#applyTrappedPose();
    }
  }

  update(dt, { allied = false } = {}) {
    this.elapsed += Math.max(0, dt);
    if (!this.root) return;

    if (allied && this.freed && !this.logsReleased) this.#releaseLogsToGatherables();

    if (this.crashed && this.root.visible) {
      this.#updateSmoke(dt, allied);
      if (this.sprout?.visible) {
        const hover = this.freed ? Math.sin(this.elapsed * 2.25) * 0.055 : 0;
        this.sprout.position.y = (this.freed ? 1.12 : 0.2) + hover;
        if (this.sproutEye?.material) {
          this.sproutEye.material.emissiveIntensity = 1.35 + Math.sin(this.elapsed * 4.6) * 0.28;
        }
      }
    }

    if (Number.isFinite(this.impactFlashAge) && this.impactFlashAge < 1.25) {
      this.impactFlashAge += dt;
      const flashT = clamp01(this.impactFlashAge / 1.25);
      this.incomingLight.visible = true;
      this.incomingLight.position.set(this.site.x, this.site.y + 1.5, this.site.z);
      this.incomingLight.intensity = (1 - flashT) * 20;
      if (this.impactShockwave) {
        const shockT = clamp01(this.impactFlashAge / 0.72);
        this.impactShockwave.visible = shockT < 1;
        this.impactShockwave.scale.setScalar(0.45 + shockT * 5.8);
        this.impactShockwave.material.opacity = (1 - shockT) * 0.9;
      }
      if (flashT >= 1) this.incomingLight.visible = false;
    } else if (!this.incoming?.visible && this.incomingLight) {
      this.incomingLight.visible = false;
      if (this.impactShockwave) this.impactShockwave.visible = false;
    }
  }

  distanceTo(position) {
    if (!this.site || !position) return Number.POSITIVE_INFINITY;
    return Math.hypot(position.x - this.site.x, position.z - this.site.z);
  }

  getWorldPosition(target = new THREE.Vector3()) {
    if (!this.site) return target.set(0, 0, 0);
    return target.set(this.site.x, this.site.y, this.site.z);
  }

  dispose() {
    this.disposed = true;
    this.#setCrashPresentationExclusion(false);
    if (this.treeCollider) this.collision.removeObstacle(this.treeCollider);
    if (this.podCollider) this.collision.removeObstacle(this.podCollider);
    this.treeCollider = null;
    this.podCollider = null;

    for (const root of [this.root, this.incoming, this.impactTreeAnchor]) {
      if (!root) continue;
      this.#disposeObject(root);
      root.parent?.remove(root);
    }
    this.incomingLight?.parent?.remove(this.incomingLight);
    this.root = null;
    this.incoming = null;
    this.impactTreeAnchor = null;
    this.impactTreeVisual = null;
    this.incomingLight = null;
    this.impactShockwave = null;
  }

  #setCrashPresentationExclusion(active) {
    if (!this.site) return;
    if (!active) {
      this.island.clearPresentationExclusion?.(CRASH_EXCLUSION_ID);
      return;
    }
    this.island.setPresentationExclusion?.(CRASH_EXCLUSION_ID, {
      x: this.site.x,
      z: this.site.z,
      radius: SPROUT_ARRIVAL.crashSite.presentationClearRadius
    });
  }

  #getApproachDirection() {
    const configured = SPROUT_ARRIVAL.incoming.approachDirection;
    const direction = new THREE.Vector2(configured.x, configured.z);
    if (direction.lengthSq() < 0.0001) direction.set(-3, 1);
    return direction.normalize();
  }

  #positionIncomingAt(progress) {
    if (!this.site || !this.incoming) return;
    const config = SPROUT_ARRIVAL.incoming;
    const direction = this.#getApproachDirection();
    const t = clamp01(progress);
    const startX = this.site.x - direction.x * config.horizontalStartDistance;
    const startZ = this.site.z - direction.y * config.horizontalStartDistance;
    this.incoming.position.set(
      THREE.MathUtils.lerp(startX, this.site.x, t),
      THREE.MathUtils.lerp(this.site.y + config.startHeight, this.site.y + 1.12, t),
      THREE.MathUtils.lerp(startZ, this.site.z, t)
    );
    this.incomingLight.position.copy(this.incoming.position);
  }

  #ensureVisuals() {
    if (this.root) return;

    this.root = new THREE.Group();
    this.root.name = 'sprout-crash-site';
    this.root.visible = false;
    this.scene.add(this.root);

    this.#createCrater();
    this.#createWreckedShip();
    this.#createBrokenTreeRemains();
    this.#createRescueLogPile();
    this.#createImpactShockwave();

    this.sprout = this.#createSproutPlaceholder();
    this.root.add(this.sprout);

    this.#createSmoke();
    this.#createImpactTree();
    this.#createIncomingObject();
  }

  #createCraterBowlGeometry(innerRadius = 1.7, outerRadius = 3.35, innerY = 0.1, outerY = 0.58, segments = 40) {
    const positions = [];
    const indices = [];
    const zScale = 0.8;
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const irregular = 1 + Math.sin(angle * 3.1 + 0.4) * 0.035 + Math.sin(angle * 7.2) * 0.02;
      positions.push(
        c * innerRadius, innerY, s * innerRadius * zScale,
        c * outerRadius * irregular, outerY + Math.sin(angle * 5) * 0.06, s * outerRadius * irregular * zScale
      );
      if (index < segments) {
        const base = index * 2;
        indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  #createCrater() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.86, 36),
      new THREE.MeshStandardMaterial({ color: SCORCH, roughness: 1, side: THREE.DoubleSide })
    );
    floor.name = 'sprout-impact-crater-scorch';
    floor.rotation.x = -Math.PI / 2;
    floor.scale.z = 0.8;
    floor.position.y = 0.085;
    floor.receiveShadow = true;
    this.root.add(floor);

    const innerWall = new THREE.Mesh(
      this.#createCraterBowlGeometry(),
      new THREE.MeshStandardMaterial({ color: CRATER, roughness: 1, flatShading: true, side: THREE.DoubleSide })
    );
    innerWall.name = 'sprout-impact-crater-inner-wall';
    innerWall.receiveShadow = true;
    innerWall.castShadow = true;
    this.root.add(innerWall);

    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x4c4337, roughness: 1, flatShading: true });
    for (let index = 0; index < 20; index += 1) {
      const angle = (index / 20) * Math.PI * 2 + (index % 4) * 0.035;
      const radius = 3.28 + (index % 3) * 0.13;
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36 + (index % 4) * 0.045, 0), rimMaterial);
      chunk.name = `sprout-impact-crater-raised-rim-${index}`;
      chunk.position.set(Math.cos(angle) * radius, 0.49 + (index % 3) * 0.045, Math.sin(angle) * radius * 0.8);
      chunk.scale.set(1.55, 0.58 + (index % 2) * 0.12, 1.08);
      chunk.rotation.set(index * 0.11, -angle, (index % 5 - 2) * 0.07);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      this.root.add(chunk);
    }

    const ejectaMaterial = new THREE.MeshStandardMaterial({ color: 0x514a40, roughness: 1, flatShading: true });
    const direction = this.#getApproachDirection();
    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let index = 0; index < 18; index += 1) {
      const fan = ((index % 9) - 4) * 0.17 + (index >= 9 ? 0.09 : -0.05);
      const angle = baseAngle + fan;
      const radius = 3.7 + (index % 6) * 0.48 + Math.floor(index / 6) * 0.22;
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + (index % 4) * 0.055, 0), ejectaMaterial);
      chunk.name = `sprout-impact-ejecta-${index}`;
      chunk.position.set(Math.cos(angle) * radius, 0.18 + (index % 3) * 0.045, Math.sin(angle) * radius);
      chunk.scale.set(1.35, 0.5, 0.9);
      chunk.rotation.set(index * 0.15, angle, -index * 0.06);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      this.root.add(chunk);
    }

    const scourMaterial = new THREE.MeshStandardMaterial({ color: 0x272421, roughness: 1 });
    const scourYaw = Math.atan2(-direction.y, direction.x);
    for (let index = 0; index < 4; index += 1) {
      const lateral = (index - 1.5) * 0.72;
      const forward = 4.2 + index * 0.6;
      const perpendicular = new THREE.Vector2(-direction.y, direction.x);
      const centerX = direction.x * forward + perpendicular.x * lateral;
      const centerZ = direction.y * forward + perpendicular.y * lateral;
      const streak = new THREE.Mesh(new THREE.BoxGeometry(2.8 + index * 0.35, 0.025, 0.28 + (index % 2) * 0.12), scourMaterial);
      streak.name = `sprout-impact-ejecta-scour-${index}`;
      streak.position.set(centerX, 0.055, centerZ);
      streak.rotation.y = scourYaw;
      streak.receiveShadow = true;
      this.root.add(streak);
    }
  }

  #createWreckedShip() {
    const wreck = new THREE.Group();
    wreck.name = 'sprout-wrecked-scout-pod';
    wreck.position.set(-1.05, 0.52, -0.72);
    wreck.rotation.set(0.18, 0.54, -0.2);
    this.root.add(wreck);

    const hullMaterial = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.48, metalness: 0.28 });
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: DARK_METAL, roughness: 0.38, metalness: 0.62 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: BLACK_GLASS,
      roughness: 0.16,
      metalness: 0.68,
      emissive: DEEP_BLUE,
      emissiveIntensity: 0.28
    });
    const greenMaterial = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.5, metalness: 0.22 });
    const orangeMaterial = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.48, metalness: 0.28 });
    const charMaterial = new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.92, metalness: 0.18 });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xbcefff,
      emissive: BLUE,
      emissiveIntensity: 2.2,
      roughness: 0.22,
      metalness: 0.2
    });

    const chassis = new THREE.Mesh(new THREE.SphereGeometry(0.92, 14, 9), chassisMaterial);
    chassis.name = 'sprout-crashed-pod-core';
    chassis.scale.set(1.72, 0.7, 1.08);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    wreck.add(chassis);

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.86, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), hullMaterial);
    shell.name = 'sprout-crashed-pod-shell';
    shell.scale.set(1.66, 0.76, 1.03);
    shell.position.y = 0.12;
    shell.castShadow = true;
    wreck.add(shell);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), glassMaterial);
    canopy.name = 'sprout-crashed-pod-canopy';
    canopy.scale.set(1.0, 0.62, 0.9);
    canopy.position.set(0.72, 0.26, 0);
    canopy.castShadow = true;
    wreck.add(canopy);

    const breach = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), charMaterial);
    breach.name = 'sprout-crashed-pod-hull-breach';
    breach.position.set(-0.18, 0.59, 0.22);
    breach.scale.set(1.25, 0.22, 0.85);
    breach.rotation.set(0.1, 0.36, -0.08);
    wreck.add(breach);

    const exposedCore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.34, 8), glowMaterial);
    exposedCore.name = 'sprout-crashed-pod-exposed-core';
    exposedCore.position.set(-0.2, 0.64, 0.22);
    exposedCore.rotation.z = Math.PI / 2;
    wreck.add(exposedCore);

    for (const [index, data] of [
      [0, { position: [-0.45, 0.58, -0.46], rotation: [0.3, -0.18, 0.52], scale: [0.7, 0.11, 0.48] }],
      [1, { position: [0.02, 0.64, 0.58], rotation: [-0.24, 0.38, -0.44], scale: [0.56, 0.1, 0.42] }]
    ]) {
      const tornPlate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), index === 0 ? hullMaterial : greenMaterial);
      tornPlate.name = `sprout-crashed-pod-torn-plate-${index}`;
      tornPlate.position.set(...data.position);
      tornPlate.rotation.set(...data.rotation);
      tornPlate.scale.set(...data.scale);
      tornPlate.castShadow = true;
      wreck.add(tornPlate);
    }

    const canopyCrackA = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.52, 0.035), charMaterial);
    canopyCrackA.name = 'sprout-crashed-pod-canopy-crack-a';
    canopyCrackA.position.set(1.08, 0.31, 0.02);
    canopyCrackA.rotation.z = 0.42;
    wreck.add(canopyCrackA);
    const canopyCrackB = canopyCrackA.clone();
    canopyCrackB.name = 'sprout-crashed-pod-canopy-crack-b';
    canopyCrackB.scale.y = 0.72;
    canopyCrackB.rotation.z = -0.7;
    canopyCrackB.position.y = 0.36;
    wreck.add(canopyCrackB);

    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.58), greenMaterial);
      panel.name = `sprout-crashed-pod-armor-${side < 0 ? 'left' : 'right'}`;
      panel.position.set(-0.15, 0.05, side * 0.83);
      panel.rotation.y = side * 0.08;
      if (side < 0) {
        panel.position.x -= 0.18;
        panel.rotation.set(0.2, -0.42, 0.32);
      }
      panel.castShadow = true;
      wreck.add(panel);

      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.88, 10), chassisMaterial);
      engine.name = `sprout-crashed-pod-engine-${side < 0 ? 'left' : 'right'}`;
      engine.rotation.z = Math.PI / 2;
      engine.position.set(-0.82, -0.05, side * 0.72);
      if (side < 0) {
        engine.rotation.set(0.32, -0.18, Math.PI / 2 + 0.34);
        engine.position.set(-0.98, -0.22, -0.78);
      }
      engine.castShadow = true;
      wreck.add(engine);

      const thruster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.055, 12),
        side < 0 ? charMaterial : glowMaterial
      );
      thruster.name = `sprout-crashed-pod-thruster-${side < 0 ? 'left' : 'right'}`;
      thruster.rotation.z = Math.PI / 2;
      thruster.position.set(side < 0 ? -1.33 : -1.28, side < 0 ? -0.24 : -0.05, side * 0.72);
      wreck.add(thruster);
    }

    const bellyStripe = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.09, 1.66), orangeMaterial);
    bellyStripe.name = 'sprout-crashed-pod-orange-safety-band';
    bellyStripe.position.set(-0.12, -0.46, 0);
    bellyStripe.castShadow = true;
    wreck.add(bellyStripe);

    const brokenWing = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.11, 0.7), greenMaterial);
    brokenWing.name = 'sprout-crashed-pod-broken-wing';
    brokenWing.position.set(-0.15, 0.02, -1.18);
    brokenWing.rotation.set(-0.18, -0.34, 0.38);
    brokenWing.scale.x = 0.72;
    brokenWing.castShadow = true;
    wreck.add(brokenWing);

    const tornWingTip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.48, 0), orangeMaterial);
    tornWingTip.name = 'sprout-crashed-pod-torn-wing-tip';
    tornWingTip.position.set(-0.35, 0.06, -1.72);
    tornWingTip.scale.set(1.45, 0.32, 0.68);
    tornWingTip.rotation.set(0.12, 0.4, 0.16);
    tornWingTip.castShadow = true;
    wreck.add(tornWingTip);

    const reactorRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 7, 16), glowMaterial);
    reactorRing.name = 'sprout-crashed-pod-reactor-ring';
    reactorRing.rotation.y = Math.PI / 2;
    reactorRing.position.set(-1.45, 0.18, 0);
    wreck.add(reactorRing);

    const debrisMaterials = {
      green: greenMaterial,
      orange: orangeMaterial,
      dark: chassisMaterial
    };
    SCATTERED_DEBRIS.forEach((entry, index) => {
      const debris = index % 3 === 0
        ? new THREE.Mesh(new THREE.TetrahedronGeometry(0.42, 0), debrisMaterials[entry.material])
        : new THREE.Mesh(new THREE.BoxGeometry(...entry.size), debrisMaterials[entry.material]);
      debris.name = `sprout-scattered-pod-debris-${index}`;
      debris.position.set(...entry.position);
      debris.rotation.set(...entry.rotation);
      if (index % 3 === 0) debris.scale.set(entry.size[0] * 1.7, entry.size[1] * 3.2, entry.size[2] * 1.7);
      debris.castShadow = true;
      debris.receiveShadow = true;
      this.root.add(debris);
    });
  }

  #createBrokenTreeRemains() {
    const stumpMaterial = new THREE.MeshStandardMaterial({ color: TREE_TRUNK, roughness: 1, flatShading: true });
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.52, 0.62, 8), stumpMaterial);
    stump.name = 'sprout-impact-tree-broken-stump';
    stump.position.set(0.56, 0.3, 0.48);
    stump.rotation.z = -0.08;
    stump.castShadow = true;
    stump.receiveShadow = true;
    this.root.add(stump);

    const splinter = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.68, 5), stumpMaterial);
    splinter.name = 'sprout-impact-tree-splinter';
    splinter.position.set(0.7, 0.72, 0.46);
    splinter.rotation.z = -0.36;
    splinter.castShadow = true;
    this.root.add(splinter);
  }

  #createRescueLogPile() {
    this.rescueLogs = CRASH_LOG_TRAPPED.map((entry, index) => {
      const log = createPhysicalLogVisual('RawLog');
      log.name = `sprout-rescue-log-${index}`;
      log.position.set(...entry.position);
      log.rotation.set(0, entry.yaw, entry.roll);
      log.visible = true;
      this.root.add(log);
      return log;
    });
  }

  #createImpactShockwave() {
    this.impactShockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color: 0xa9efff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    this.impactShockwave.name = 'sprout-impact-shockwave';
    this.impactShockwave.rotation.x = -Math.PI / 2;
    this.impactShockwave.position.y = 0.64;
    this.impactShockwave.visible = false;
    this.root.add(this.impactShockwave);
  }

  #createImpactTree() {
    this.impactTreeAnchor = new THREE.Group();
    this.impactTreeAnchor.name = 'sprout-impact-tree-anchor';
    this.impactTreeAnchor.visible = false;
    this.scene.add(this.impactTreeAnchor);

    this.impactTreeVisual = this.#createFallbackImpactTree();
    this.impactTreeAnchor.add(this.impactTreeVisual);

    const loader = new GLTFLoader();
    loader.loadAsync(ASSET_PATHS.forest.treeBroad)
      .then(gltf => {
        if (this.disposed || !this.impactTreeAnchor) return;
        const tree = gltf.scene;
        tree.name = 'sprout-impact-live-forest-tree';
        tree.position.set(0.55, 0, 0.5);
        tree.rotation.y = 0.16;
        tree.scale.setScalar(1.7);
        tree.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
        });
        const old = this.impactTreeVisual;
        this.impactTreeVisual = tree;
        this.impactTreeAnchor.add(tree);
        old?.parent?.remove(old);
        this.#disposeObject(old);
        this.impactTreeAssetReady = true;
      })
      .catch(error => console.warn('[SPROUT CRASH] Forest tree asset fallback retained', error));
  }

  #createFallbackImpactTree() {
    const root = new THREE.Group();
    root.name = 'sprout-impact-tree-fallback';
    root.position.set(0.55, 0, 0.5);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: TREE_TRUNK, roughness: 1, flatShading: true });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: TREE_LEAF, roughness: 1, flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, 5.8, 8), trunkMaterial);
    trunk.position.y = 2.9;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    root.add(trunk);
    for (const [x, y, z, scale] of [[0, 5.3, 0, 1.25], [0.65, 4.9, -0.2, 0.92], [-0.55, 4.75, 0.35, 0.86]]) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), leafMaterial);
      crown.position.set(x, y, z);
      crown.scale.setScalar(scale);
      crown.castShadow = true;
      root.add(crown);
    }
    return root;
  }

  #createSproutPlaceholder() {
    const root = new THREE.Group();
    root.name = 'sprout-placeholder-companion';
    root.position.set(0.38, 0.2, 0.36);
    root.rotation.z = -1.2;

    const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xa9b6be, roughness: 0.36, metalness: 0.58 });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x29485c,
      roughness: 0.32,
      metalness: 0.4,
      emissive: DEEP_BLUE,
      emissiveIntensity: 0.62
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), shellMaterial);
    body.scale.set(1, 0.82, 0.9);
    body.castShadow = true;
    root.add(body);

    const face = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.12), accentMaterial);
    face.position.set(0, 0.03, 0.33);
    face.rotation.x = -0.05;
    root.add(face);

    this.sproutEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.075, 0.035),
      new THREE.MeshStandardMaterial({ color: 0xc9f1ff, emissive: BLUE, emissiveIntensity: 1.4, roughness: 0.2 })
    );
    this.sproutEye.position.set(0, 0.035, 0.402);
    root.add(this.sproutEye);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), shellMaterial);
    antenna.position.y = 0.45;
    root.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), accentMaterial);
    antennaTip.position.y = 0.64;
    root.add(antennaTip);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.42, 7), shellMaterial);
      arm.position.set(side * 0.42, -0.02, 0);
      arm.rotation.z = side * 0.6;
      root.add(arm);
    }
    return root;
  }

  #createSmoke() {
    const smokeCount = 18;
    const smokePositions = new Float32Array(smokeCount * 3);
    this.smokeBase = new Float32Array(smokeCount * 3);
    for (let index = 0; index < smokeCount; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399963;
      const radius = 0.28 + (index % 4) * 0.13;
      this.smokeBase[offset] = Math.cos(angle) * radius;
      this.smokeBase[offset + 1] = (index / smokeCount) * 11;
      this.smokeBase[offset + 2] = Math.sin(angle) * radius;
      smokePositions[offset] = this.smokeBase[offset];
      smokePositions[offset + 1] = this.smokeBase[offset + 1];
      smokePositions[offset + 2] = this.smokeBase[offset + 2];
    }
    const smokeGeometry = new THREE.BufferGeometry();
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    this.smoke = new THREE.Points(
      smokeGeometry,
      new THREE.PointsMaterial({ color: BLUE, size: 0.48, transparent: true, opacity: 0.38, depthWrite: false, sizeAttenuation: true })
    );
    this.smoke.name = 'sprout-blue-impact-smoke';
    this.smoke.position.set(-0.9, 0.55, -0.65);
    this.root.add(this.smoke);
  }

  #createIncomingObject() {
    this.incoming = new THREE.Group();
    this.incoming.name = 'sprout-gameplay-incoming-object';
    this.incoming.visible = false;
    this.scene.add(this.incoming);

    this.incomingCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.44, 1),
      new THREE.MeshBasicMaterial({ color: 0xbbeeff })
    );
    this.incomingCore.name = 'sprout-incoming-core';
    this.incoming.add(this.incomingCore);

    this.incomingHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 12, 8),
      new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.36, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.incomingHalo.name = 'sprout-incoming-halo';
    this.incoming.add(this.incomingHalo);

    const direction = this.#getApproachDirection();
    const config = SPROUT_ARRIVAL.incoming;
    const travel = new THREE.Vector3(
      direction.x * config.horizontalStartDistance,
      -(config.startHeight - 1.12),
      direction.y * config.horizontalStartDistance
    ).normalize();
    const flightFrame = new THREE.Group();
    flightFrame.name = 'sprout-gameplay-flight-frame';
    flightFrame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), travel);
    this.incoming.add(flightFrame);

    this.incomingTrail = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 6.4, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    this.incomingTrail.name = 'sprout-gameplay-plasma-tail';
    this.incomingTrail.position.y = -3.2;
    flightFrame.add(this.incomingTrail);

    this.incomingLight = new THREE.PointLight(BLUE, 0, 28, 2);
    this.incomingLight.name = 'sprout-impact-blue-light';
    this.incomingLight.visible = false;
    this.scene.add(this.incomingLight);
  }

  #ensureCollision() {
    if (!this.site) return;
    if (!this.podCollider) {
      this.podCollider = this.collision.addObstacle({
        x: this.site.x - 1.05,
        z: this.site.z - 0.72,
        radius: 1.55,
        type: 'sprout-crash-pod',
        label: 'Sprout wrecked scout pod',
        bottomY: this.site.y,
        topY: this.site.y + 1.75
      });
    }
    if (!this.freed && !this.treeCollider) {
      this.treeCollider = this.collision.addBox({
        x: this.site.x + 0.2,
        z: this.site.z + 0.52,
        halfX: 2.75,
        halfZ: 0.78,
        yaw: 0.05,
        type: 'sprout-crash-log-pile',
        label: 'Impact logs trapping Sprout',
        bottomY: this.site.y,
        topY: this.site.y + 1.45
      });
    }
  }

  #applyTrappedPose() {
    this.rescueLogs.forEach((log, index) => {
      const entry = CRASH_LOG_TRAPPED[index];
      log.position.set(...entry.position);
      log.rotation.set(0, entry.yaw, entry.roll);
      log.visible = true;
    });
    if (!this.sprout) return;
    this.sprout.position.set(0.38, 0.2, 0.36);
    this.sprout.rotation.set(0, Math.PI * 0.08, -1.2);
    this.sprout.visible = true;
  }

  #applyFreedPose() {
    this.rescueLogs.forEach((log, index) => {
      const entry = CRASH_LOG_CLEARED[index];
      log.position.set(...entry.position);
      log.rotation.set(0, entry.yaw, entry.roll);
      log.visible = !this.logsReleased;
    });
    if (!this.sprout) return;
    this.sprout.position.set(0.38, 1.12, 0.36);
    this.sprout.rotation.set(0, Math.PI * 0.08, 0);
    this.sprout.visible = true;
  }

  #releaseLogsToGatherables() {
    if (!this.site || this.logsReleased) return;
    const planned = CRASH_LOG_CLEARED.map(entry => ({
      x: this.site.x + entry.position[0],
      z: this.site.z + entry.position[2],
      yaw: entry.yaw
    }));

    const existing = this.gatherables.items.filter(item => {
      if (item.resourceId !== 'log' || !String(item.id).startsWith('spawn-')) return false;
      return planned.some(point => Math.hypot(item.root.position.x - point.x, item.root.position.z - point.z) < 0.38);
    });

    if (existing.length < CRASH_LOG_COUNT) {
      for (const [index, point] of planned.entries()) {
        const alreadyThere = existing.some(item => Math.hypot(item.root.position.x - point.x, item.root.position.z - point.z) < 0.38);
        if (alreadyThere) continue;
        const root = this.gatherables.spawn('log', { x: point.x, z: point.z, quantity: 1, yaw: point.yaw });
        root.name = `sprout-demo-log-${index}`;
      }
    }

    this.rescueLogs.forEach(log => { log.visible = false; });
    this.logsReleased = true;
  }

  #updateSmoke(dt, allied) {
    if (!this.smoke?.geometry?.attributes?.position || !this.smokeBase) return;
    const position = this.smoke.geometry.attributes.position;
    const array = position.array;
    const count = position.count;
    const height = allied ? 6.5 : 11;
    const speed = allied ? 0.48 : 0.8;

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const baseX = this.smokeBase[offset];
      const baseY = this.smokeBase[offset + 1];
      const baseZ = this.smokeBase[offset + 2];
      const y = (baseY + this.elapsed * speed * 2.2) % height;
      const drift = Math.sin(this.elapsed * 0.8 + index * 1.7) * (0.08 + y * 0.02);
      array[offset] = baseX + drift;
      array[offset + 1] = y;
      array[offset + 2] = baseZ + Math.cos(this.elapsed * 0.7 + index) * 0.08;
    }
    position.needsUpdate = dt > 0;
    this.smoke.material.opacity = allied ? 0.18 : 0.38;
  }

  #disposeObject(root) {
    if (!root) return;
    const geometries = new Set();
    const materials = new Set();
    root.traverse?.(object => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose?.();
    for (const material of materials) material.dispose?.();
  }
}