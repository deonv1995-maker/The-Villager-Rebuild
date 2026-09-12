import * as THREE from 'three';
import { SPROUT_ARRIVAL } from '../data/SproutArrivalDefinitions.js';

const BLUE = 0x56bfff;
const DEEP_BLUE = 0x1b5f9f;
const DARK_METAL = 0x26323d;
const TREE_TRUNK = 0x6f472a;
const TREE_LEAF = 0x5f8c46;
const CRATER = 0x2e3130;
const TMP_SITE = new THREE.Vector3();

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth01 = value => THREE.MathUtils.smoothstep(clamp01(value), 0, 1);

export class SproutCrashSiteSystem {
  constructor({ game }) {
    if (!game?.sceneSystem?.scene || !game?.island?.collision) {
      throw new Error('SproutCrashSiteSystem requires a started GameApp');
    }
    this.game = game;
    this.scene = game.sceneSystem.scene;
    this.island = game.island;
    this.collision = game.island.collision;
    this.site = null;
    this.root = null;
    this.incoming = null;
    this.incomingCore = null;
    this.incomingHalo = null;
    this.incomingLight = null;
    this.smoke = null;
    this.smokeBase = null;
    this.fallenTree = null;
    this.sprout = null;
    this.sproutEye = null;
    this.treeCollider = null;
    this.podCollider = null;
    this.crashed = false;
    this.freed = false;
    this.elapsed = 0;
    this.impactFlashAge = Number.POSITIVE_INFINITY;
    this.rescueStart = null;
    this.rescueTarget = null;
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
    this.#positionIncomingAt(0);
    return { ...this.site };
  }

  beginImpact() {
    this.resolveSite();
    this.incoming.visible = true;
    this.root.visible = false;
    this.#positionIncomingAt(0);
    this.incomingLight.intensity = 5.2;
  }

  updateImpact(progress) {
    if (!this.site) return;
    const t = smooth01(progress);
    this.#positionIncomingAt(t);
    const pulse = 0.84 + Math.sin(this.elapsed * 18) * 0.16;
    this.incomingCore.scale.setScalar(0.72 + t * 0.55);
    this.incomingHalo.scale.setScalar((1.35 + t * 1.45) * pulse);
    this.incomingHalo.material.opacity = 0.2 + t * 0.48;
    this.incomingLight.intensity = 5.2 + t * 9.5 + Math.max(0, Math.sin(this.elapsed * 20)) * 2.2;
  }

  completeImpact() {
    this.resolveSite();
    this.incoming.visible = false;
    this.root.visible = true;
    this.crashed = true;
    this.freed = false;
    this.impactFlashAge = 0;
    this.#ensureCollision();
    this.#applyTrappedPose();
  }

  beginRescue() {
    if (!this.crashed || this.freed || !this.fallenTree) return false;
    this.rescueStart = {
      position: this.fallenTree.position.clone(),
      rotationY: this.fallenTree.rotation.y,
      rotationZ: this.fallenTree.rotation.z
    };
    this.rescueTarget = {
      position: this.fallenTree.position.clone().add(new THREE.Vector3(-0.25, 0.18, 2.4)),
      rotationY: this.fallenTree.rotation.y + 0.32,
      rotationZ: this.fallenTree.rotation.z + 0.18
    };
    return true;
  }

  updateRescue(progress) {
    if (!this.rescueStart || !this.rescueTarget || !this.fallenTree) return;
    const t = smooth01(progress);
    this.fallenTree.position.lerpVectors(
      this.rescueStart.position,
      this.rescueTarget.position,
      t
    );
    this.fallenTree.position.y += Math.sin(t * Math.PI) * 0.22;
    this.fallenTree.rotation.y = THREE.MathUtils.lerp(
      this.rescueStart.rotationY,
      this.rescueTarget.rotationY,
      t
    );
    this.fallenTree.rotation.z = THREE.MathUtils.lerp(
      this.rescueStart.rotationZ,
      this.rescueTarget.rotationZ,
      t
    );
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
    this.incoming.visible = false;
    this.root.visible = this.crashed;
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
      this.incomingLight.intensity = (1 - flashT) * 17;
      if (flashT >= 1) this.incomingLight.visible = false;
    } else if (!this.incoming?.visible && this.incomingLight) {
      this.incomingLight.visible = false;
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
    if (this.treeCollider) this.collision.removeObstacle(this.treeCollider);
    if (this.podCollider) this.collision.removeObstacle(this.podCollider);
    this.treeCollider = null;
    this.podCollider = null;

    for (const root of [this.root, this.incoming]) {
      if (!root) continue;
      root.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose?.());
        else object.material?.dispose?.();
      });
      root.parent?.remove(root);
    }
    this.incomingLight?.parent?.remove(this.incomingLight);
    this.root = null;
    this.incoming = null;
    this.incomingLight = null;
  }

  #positionIncomingAt(progress) {
    if (!this.site || !this.incoming) return;
    const config = SPROUT_ARRIVAL.incoming;
    const t = clamp01(progress);
    const fall = t * t;
    this.incoming.position.set(
      THREE.MathUtils.lerp(this.site.x - config.lateralOffset, this.site.x, fall),
      THREE.MathUtils.lerp(this.site.y + config.startHeight, this.site.y + 1.25, fall),
      THREE.MathUtils.lerp(this.site.z + config.forwardOffset, this.site.z, fall)
    );
    this.incomingLight.position.copy(this.incoming.position);
  }

  #ensureVisuals() {
    if (this.root) return;

    this.root = new THREE.Group();
    this.root.name = 'sprout-crash-site';
    this.root.visible = false;
    this.scene.add(this.root);

    const crater = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 3.4, 30),
      new THREE.MeshStandardMaterial({
        color: CRATER,
        roughness: 1,
        side: THREE.DoubleSide
      })
    );
    crater.name = 'sprout-impact-crater';
    crater.rotation.x = -Math.PI / 2;
    crater.position.y = 0.025;
    crater.receiveShadow = true;
    this.root.add(crater);

    const scorchedCenter = new THREE.Mesh(
      new THREE.CircleGeometry(1.28, 28),
      new THREE.MeshStandardMaterial({ color: 0x202526, roughness: 1, side: THREE.DoubleSide })
    );
    scorchedCenter.rotation.x = -Math.PI / 2;
    scorchedCenter.position.y = 0.03;
    this.root.add(scorchedCenter);

    const podMaterial = new THREE.MeshStandardMaterial({
      color: DARK_METAL,
      roughness: 0.42,
      metalness: 0.48,
      emissive: DEEP_BLUE,
      emissiveIntensity: 0.42
    });
    const pod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.96, 0), podMaterial);
    pod.name = 'sprout-crashed-pod-core';
    pod.scale.set(1.42, 0.72, 1.05);
    pod.position.set(-0.95, 0.62, -0.5);
    pod.rotation.set(0.22, 0.48, -0.16);
    pod.castShadow = true;
    pod.receiveShadow = true;
    this.root.add(pod);

    for (let index = 0; index < 5; index += 1) {
      const angle = index * 1.41 + 0.35;
      const debris = new THREE.Mesh(
        new THREE.BoxGeometry(0.36 + (index % 2) * 0.2, 0.12, 0.62),
        podMaterial.clone()
      );
      debris.name = `sprout-pod-debris-${index}`;
      debris.position.set(Math.cos(angle) * (1.65 + index * 0.14), 0.12, Math.sin(angle) * (1.35 + index * 0.12));
      debris.rotation.set(0.1 * index, angle + 0.2, 0.18 * (index % 3));
      debris.castShadow = true;
      this.root.add(debris);
    }

    this.fallenTree = this.#createFallenTree();
    this.root.add(this.fallenTree);

    this.sprout = this.#createSproutPlaceholder();
    this.root.add(this.sprout);

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
      new THREE.PointsMaterial({
        color: BLUE,
        size: 0.48,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    this.smoke.name = 'sprout-blue-impact-smoke';
    this.smoke.position.set(-0.8, 0.7, -0.4);
    this.root.add(this.smoke);

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
      new THREE.MeshBasicMaterial({
        color: BLUE,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.incomingHalo.name = 'sprout-incoming-halo';
    this.incoming.add(this.incomingHalo);

    this.incomingLight = new THREE.PointLight(BLUE, 0, 28, 2);
    this.incomingLight.name = 'sprout-impact-blue-light';
    this.incomingLight.visible = false;
    this.scene.add(this.incomingLight);
  }

  #createFallenTree() {
    const root = new THREE.Group();
    root.name = 'sprout-rescue-fallen-tree';
    root.position.set(0.55, 0.52, 0.55);
    root.rotation.y = 0.12;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.43, 6.1, 8),
      new THREE.MeshStandardMaterial({ color: TREE_TRUNK, roughness: 1, flatShading: true })
    );
    trunk.rotation.z = Math.PI / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    root.add(trunk);

    const branchMaterial = trunk.material.clone();
    for (const [x, y, z, rz] of [
      [1.7, 0.52, 0.12, 0.82],
      [2.05, 0.42, -0.16, 1.05],
      [-1.5, 0.36, -0.1, -0.9]
    ]) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.65, 6), branchMaterial);
      branch.position.set(x, y, z);
      branch.rotation.z = rz;
      branch.castShadow = true;
      root.add(branch);
    }

    const leafMaterial = new THREE.MeshStandardMaterial({ color: TREE_LEAF, roughness: 1, flatShading: true });
    for (const [x, y, z, scale] of [
      [2.65, 0.42, 0.1, 0.95],
      [2.25, 0.88, -0.22, 0.78],
      [2.25, 0.34, 0.54, 0.68]
    ]) {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 1), leafMaterial);
      leaves.position.set(x, y, z);
      leaves.scale.setScalar(scale);
      leaves.castShadow = true;
      root.add(leaves);
    }
    return root;
  }

  #createSproutPlaceholder() {
    const root = new THREE.Group();
    root.name = 'sprout-placeholder-companion';
    root.position.set(0.45, 0.2, 0.45);
    root.rotation.z = -1.2;

    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xa9b6be,
      roughness: 0.36,
      metalness: 0.58
    });
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
      new THREE.MeshStandardMaterial({
        color: 0xc9f1ff,
        emissive: BLUE,
        emissiveIntensity: 1.4,
        roughness: 0.2
      })
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

  #ensureCollision() {
    if (!this.site) return;
    if (!this.podCollider) {
      this.podCollider = this.collision.addObstacle({
        x: this.site.x - 0.95,
        z: this.site.z - 0.5,
        radius: 1.05,
        type: 'sprout-crash-pod',
        label: 'Sprout crash pod',
        bottomY: this.site.y,
        topY: this.site.y + 1.65
      });
    }
    if (!this.freed && !this.treeCollider) {
      this.treeCollider = this.collision.addBox({
        x: this.site.x + 0.55,
        z: this.site.z + 0.55,
        halfX: 3.05,
        halfZ: 0.52,
        yaw: 0.12,
        type: 'sprout-crash-tree',
        label: 'Fallen tree over Sprout',
        bottomY: this.site.y,
        topY: this.site.y + 1.45
      });
    }
  }

  #applyTrappedPose() {
    if (!this.fallenTree || !this.sprout) return;
    this.fallenTree.position.set(0.55, 0.52, 0.55);
    this.fallenTree.rotation.set(0, 0.12, 0);
    this.sprout.position.set(0.45, 0.2, 0.45);
    this.sprout.rotation.set(0, Math.PI * 0.08, -1.2);
    this.sprout.visible = true;
  }

  #applyFreedPose() {
    if (!this.fallenTree || !this.sprout) return;
    this.fallenTree.position.set(0.3, 0.7, 2.95);
    this.fallenTree.rotation.set(0, 0.44, 0.18);
    this.sprout.position.set(0.45, 1.12, 0.45);
    this.sprout.rotation.set(0, Math.PI * 0.08, 0);
    this.sprout.visible = true;
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
}
