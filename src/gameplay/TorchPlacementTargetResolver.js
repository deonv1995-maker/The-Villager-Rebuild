import * as THREE from 'three';

const EPSILON = 0.0001;

const finitePosition = position => (
  Number.isFinite(position?.x) &&
  Number.isFinite(position?.y) &&
  Number.isFinite(position?.z)
);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export class TorchPlacementTargetResolver {
  constructor({ game, definition }) {
    if (!game?.player || !definition?.placement) {
      throw new Error('TorchPlacementTargetResolver requires game player and torch placement definition');
    }
    this.game = game;
    this.definition = definition;
    this.playerPosition = new THREE.Vector3();
    this.aimDirection = new THREE.Vector3();
    this.surfaceNormal = new THREE.Vector3();
  }

  getTarget() {
    this.game.player.getPosition(this.playerPosition);
    this.#resolveAimDirection();

    let best = null;
    for (const target of this.#collectTargets()) {
      const score = this.#score(target);
      if (score === null || (best && score >= best.score)) continue;
      best = { ...target, score };
    }
    if (!best) return null;
    delete best.score;
    return best;
  }

  #resolveAimDirection() {
    const camera = this.game.sceneSystem?.camera;
    if (this.game.player.isFirstPerson?.() && camera?.getWorldDirection) {
      camera.getWorldDirection(this.aimDirection);
    } else {
      this.game.player.getFacingDirection(this.aimDirection);
    }
    this.aimDirection.y = 0;
    if (this.aimDirection.lengthSq() <= EPSILON) this.aimDirection.set(0, 0, 1);
    else this.aimDirection.normalize();
  }

  #collectTargets() {
    return [
      ...this.#panelWallTargets(),
      ...this.#physicalConstructionTargets()
    ];
  }

  #panelWallTargets() {
    const system = this.game.panelConstruction;
    const registry = system?.registry;
    if (!registry?.structures) return [];

    const targets = [];
    for (const structure of registry.structures.values()) {
      for (const wall of structure.grid.walls.values()) {
        // Door and window openings need jamb-specific mounts. Until that geometry contract
        // is exposed, keep torch attachment on complete wall surfaces only.
        if ((wall.variant ?? 'solid') !== 'solid') continue;
        const placement = registry.wallPlacementWorld(structure, wall.key);
        if (!placement) continue;
        const normal = this.#normalTowardPlayer(
          placement.x,
          placement.z,
          placement.inwardNormal,
          placement.outwardNormal
        );
        const y = this.#mountHeight(placement.baseY, placement.topY);
        targets.push({
          kind: 'wall',
          id: `panel-wall:${structure.id}:${wall.key}`,
          label: 'wall',
          position: {
            x: placement.x + normal.x * this.definition.placement.wallSurfaceOffset,
            y,
            z: placement.z + normal.z * this.definition.placement.wallSurfaceOffset
          },
          yaw: Math.atan2(normal.x, normal.z)
        });
      }
    }
    return targets;
  }

  #physicalConstructionTargets() {
    const builtLogs = this.game.physicalLogs?.builtLogs;
    if (!Array.isArray(builtLogs)) return [];

    const targets = [];
    for (const built of builtLogs) {
      if (!built?.active || !built.root) continue;
      if (built.mode === 'frame') {
        const normal = this.#radialNormal(built.root.position.x, built.root.position.z);
        targets.push({
          kind: 'post',
          id: `physical-post:${built.id}`,
          label: 'post',
          position: {
            x: built.root.position.x + normal.x * this.definition.placement.postSurfaceOffset,
            y: this.#mountHeight(built.baseY, built.topY),
            z: built.root.position.z + normal.z * this.definition.placement.postSurfaceOffset
          },
          yaw: Math.atan2(normal.x, normal.z)
        });
        continue;
      }

      if (built.mode !== 'wall') continue;
      this.surfaceNormal.set(0, 0, 1).applyQuaternion(built.root.quaternion);
      this.surfaceNormal.y = 0;
      if (this.surfaceNormal.lengthSq() <= EPSILON) {
        const yaw = Number.isFinite(built.yaw) ? built.yaw : 0;
        this.surfaceNormal.set(Math.sin(yaw), 0, Math.cos(yaw));
      } else {
        this.surfaceNormal.normalize();
      }
      const towardPlayerX = this.playerPosition.x - built.root.position.x;
      const towardPlayerZ = this.playerPosition.z - built.root.position.z;
      if (towardPlayerX * this.surfaceNormal.x + towardPlayerZ * this.surfaceNormal.z < 0) {
        this.surfaceNormal.multiplyScalar(-1);
      }
      targets.push({
        kind: 'wall',
        id: `physical-wall:${built.id}`,
        label: 'wall',
        position: {
          x: built.root.position.x + this.surfaceNormal.x * this.definition.placement.wallSurfaceOffset,
          y: built.root.position.y,
          z: built.root.position.z + this.surfaceNormal.z * this.definition.placement.wallSurfaceOffset
        },
        yaw: Math.atan2(this.surfaceNormal.x, this.surfaceNormal.z)
      });
    }
    return targets;
  }

  #mountHeight(baseY, topY) {
    const base = Number.isFinite(baseY) ? baseY : this.playerPosition.y;
    const top = Number.isFinite(topY)
      ? topY
      : base + this.definition.placement.mountHeight + this.definition.placement.topClearance;
    const minimum = Math.min(top, base + this.definition.placement.minimumMountHeight);
    const maximum = Math.max(minimum, top - this.definition.placement.topClearance);
    return clamp(base + this.definition.placement.mountHeight, minimum, maximum);
  }

  #normalTowardPlayer(x, z, first, second) {
    const firstX = Number(first?.x) || 0;
    const firstZ = Number(first?.z) || 0;
    const secondX = Number(second?.x) || -firstX;
    const secondZ = Number(second?.z) || -firstZ;
    const toPlayerX = this.playerPosition.x - x;
    const toPlayerZ = this.playerPosition.z - z;
    const firstDot = toPlayerX * firstX + toPlayerZ * firstZ;
    const secondDot = toPlayerX * secondX + toPlayerZ * secondZ;
    return firstDot >= secondDot
      ? { x: firstX, z: firstZ }
      : { x: secondX, z: secondZ };
  }

  #radialNormal(x, z) {
    let dx = this.playerPosition.x - x;
    let dz = this.playerPosition.z - z;
    const length = Math.hypot(dx, dz);
    if (length <= EPSILON) {
      dx = -this.aimDirection.x;
      dz = -this.aimDirection.z;
      return { x: dx, z: dz };
    }
    return { x: dx / length, z: dz / length };
  }

  #score(target) {
    if (!finitePosition(target?.position)) return null;
    const dx = target.position.x - this.playerPosition.x;
    const dy = target.position.y - this.playerPosition.y;
    const dz = target.position.z - this.playerPosition.z;
    const horizontalDistance = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontalDistance, dy);
    if (distance > this.definition.placement.maxDistance) return null;

    const forwardDot = horizontalDistance <= EPSILON
      ? 1
      : (dx * this.aimDirection.x + dz * this.aimDirection.z) / horizontalDistance;
    if (forwardDot < this.definition.placement.minFacingDot) return null;

    return distance + (1 - forwardDot) * this.definition.placement.aimPenalty;
  }
}
