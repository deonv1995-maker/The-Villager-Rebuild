import { WORLD_RESOURCE_DISTRIBUTION } from '../data/WorldResourceDistribution.js';

const MAX_ACTIVE_STEP_SECONDS = 0.25;
const TWO_PI = Math.PI * 2;

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export class ResourceRenewalSystem {
  constructor({ gatherables, treeHarvest }) {
    if (!gatherables || !treeHarvest) {
      throw new Error('ResourceRenewalSystem requires gatherables and treeHarvest');
    }

    this.gatherables = gatherables;
    this.treeHarvest = treeHarvest;
    this.grassConfig = WORLD_RESOURCE_DISTRIBUTION.renewal.grass;
    this.stickConfig = WORLD_RESOURCE_DISTRIBUTION.renewal.stick;
    this.grassPatchesById = new Map(
      (this.gatherables.grassPatches ?? []).map(patch => [patch.id, patch])
    );
    this.grassRegrowth = new Map();
    this.grassNaturalScales = new Map();
    this.#captureGrassNaturalScales();

    this.stickPopulationCeiling = this.#countActiveResource('stick');
    this.randomState = this.stickConfig.seed >>> 0;
    this.stickDropRemaining = this.#nextStickDropDelay();
  }

  update(dt, playerPosition) {
    const elapsed = clamp(finiteNumber(dt, 0), 0, MAX_ACTIVE_STEP_SECONDS);
    this.#advanceGrassRegrowth(elapsed);
    this.#advanceStickDrops(elapsed, playerPosition);
  }

  captureState() {
    this.#synchronizeGrassTimers();
    return {
      grassPatches: [...this.grassRegrowth.entries()]
        .map(([patchId, remainingSeconds]) => ({
          patchId,
          remainingSeconds: Math.max(0, finiteNumber(remainingSeconds, this.grassConfig.regrowSeconds))
        }))
        .sort((left, right) => left.patchId.localeCompare(right.patchId)),
      stickDrops: {
        remainingSeconds: Math.max(0, finiteNumber(this.stickDropRemaining, this.stickConfig.minDropIntervalSeconds)),
        randomState: this.randomState >>> 0
      }
    };
  }

  restoreState(state) {
    this.grassRegrowth.clear();
    const savedGrass = Array.isArray(state?.grassPatches) ? state.grassPatches : [];
    const savedGrassById = new Map(
      savedGrass
        .filter(entry => typeof entry?.patchId === 'string')
        .map(entry => [entry.patchId, entry])
    );

    for (const patch of this.gatherables.grassPatches ?? []) {
      if (patch.active) continue;
      const saved = savedGrassById.get(patch.id);
      const remaining = Number(saved?.remainingSeconds);
      this.grassRegrowth.set(
        patch.id,
        Number.isFinite(remaining)
          ? clamp(remaining, 0, this.grassConfig.regrowSeconds)
          : this.grassConfig.regrowSeconds
      );
    }

    const savedRandomState = Number(state?.stickDrops?.randomState);
    if (Number.isFinite(savedRandomState)) this.randomState = savedRandomState >>> 0;

    const savedStickRemaining = Number(state?.stickDrops?.remainingSeconds);
    if (Number.isFinite(savedStickRemaining)) {
      this.stickDropRemaining = clamp(
        savedStickRemaining,
        0,
        this.stickConfig.maxDropIntervalSeconds
      );
    } else if (Number.isFinite(savedRandomState)) {
      this.stickDropRemaining = this.#nextStickDropDelay();
    }
  }

  #captureGrassNaturalScales() {
    for (const patch of this.gatherables.grassPatches ?? []) {
      for (const entry of patch.entries ?? []) {
        if (this.grassNaturalScales.has(entry)) continue;
        this.grassNaturalScales.set(entry, {
          x: finiteNumber(entry.scaleX, 1),
          y: finiteNumber(entry.scaleY, 1),
          z: finiteNumber(entry.scaleZ, 1)
        });
      }
    }
  }

  #synchronizeGrassTimers() {
    for (const patch of this.gatherables.grassPatches ?? []) {
      if (patch.active) {
        this.grassRegrowth.delete(patch.id);
        continue;
      }
      if (!this.grassRegrowth.has(patch.id)) {
        this.grassRegrowth.set(patch.id, this.grassConfig.regrowSeconds);
      }
    }
  }

  #advanceGrassRegrowth(elapsed) {
    this.#synchronizeGrassTimers();
    if (elapsed <= 0) return;

    for (const [patchId, remainingSeconds] of [...this.grassRegrowth.entries()]) {
      const patch = this.grassPatchesById.get(patchId);
      if (!patch || patch.active) {
        this.grassRegrowth.delete(patchId);
        continue;
      }

      const nextRemaining = Math.max(0, remainingSeconds - elapsed);
      if (nextRemaining > 0) {
        this.grassRegrowth.set(patchId, nextRemaining);
        continue;
      }

      if (!this.#canRestoreGrassPatch(patch)) {
        this.grassRegrowth.set(patchId, 0);
        continue;
      }

      this.#restoreGrassPatch(patch);
      this.grassRegrowth.delete(patchId);
    }
  }

  #canRestoreGrassPatch(patch) {
    return (patch.entries ?? []).some(entry => !entry.constructionHidden);
  }

  #restoreGrassPatch(patch) {
    patch.active = true;
    const dirtyMeshes = new Set();
    const dummy = this.gatherables.grassDummy;

    for (const entry of patch.entries ?? []) {
      const naturalScale = this.grassNaturalScales.get(entry);
      if (!naturalScale) continue;

      entry.grassHarvested = false;
      entry.scaleX = naturalScale.x;
      entry.scaleY = naturalScale.y;
      entry.scaleZ = naturalScale.z;
      entry.bendX = 0;
      entry.bendZ = 0;
      entry.compression = 0;
      this.gatherables.grassField?.active?.delete?.(entry);

      if (!dummy || !entry?.mesh || entry.index < 0) continue;
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(entry.baseLeanX ?? 0, entry.baseYaw ?? 0, entry.baseLeanZ ?? 0);
      if (entry.constructionHidden) {
        dummy.scale.set(0, 0, 0);
      } else {
        dummy.scale.set(naturalScale.x, naturalScale.y, naturalScale.z);
      }
      dummy.updateMatrix();
      entry.mesh.setMatrixAt(entry.index, dummy.matrix);
      dirtyMeshes.add(entry.mesh);
    }

    for (const mesh of dirtyMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  #advanceStickDrops(elapsed, playerPosition) {
    if (elapsed <= 0 || this.stickPopulationCeiling <= 0) return;
    this.stickDropRemaining = Math.max(0, this.stickDropRemaining - elapsed);
    if (this.stickDropRemaining > 0) return;

    this.#trySpawnStick(playerPosition);
    this.stickDropRemaining = this.#nextStickDropDelay();
  }

  #trySpawnStick(playerPosition) {
    if (this.#countActiveResource('stick') >= this.stickPopulationCeiling) return false;

    const playerX = Number(playerPosition?.x);
    const playerZ = Number(playerPosition?.z);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerZ)) return false;

    const radiusSq = this.stickConfig.playerTreeRadius ** 2;
    const candidates = (this.treeHarvest.trees ?? []).filter(tree => {
      if (!tree?.active || !tree.obstacle) return false;
      const dx = tree.obstacle.x - playerX;
      const dz = tree.obstacle.z - playerZ;
      return dx * dx + dz * dz <= radiusSq;
    });
    if (!candidates.length) return false;

    const tree = candidates[Math.floor(this.#random() * candidates.length)];
    const angle = this.#random() * TWO_PI;
    const obstacleRadius = Math.max(0, finiteNumber(tree.obstacle.radius, 0));
    const minimumDistance = Math.max(this.stickConfig.minDropDistance, obstacleRadius + 0.25);
    const maximumDistance = Math.max(minimumDistance, this.stickConfig.maxDropDistance);
    const distance = minimumDistance + this.#random() * (maximumDistance - minimumDistance);

    this.gatherables.spawn('stick', {
      x: tree.obstacle.x + Math.cos(angle) * distance,
      z: tree.obstacle.z + Math.sin(angle) * distance,
      quantity: 1,
      yaw: angle + Math.PI / 2
    });
    return true;
  }

  #countActiveResource(resourceId) {
    return (this.gatherables.items ?? [])
      .filter(item => item.active && item.resourceId === resourceId)
      .length;
  }

  #nextStickDropDelay() {
    const span = Math.max(0, this.stickConfig.maxDropIntervalSeconds - this.stickConfig.minDropIntervalSeconds);
    return this.stickConfig.minDropIntervalSeconds + this.#random() * span;
  }

  #random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
