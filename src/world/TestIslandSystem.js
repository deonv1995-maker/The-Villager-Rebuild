import * as THREE from 'three';
import { IslandTerrainSystem } from './IslandTerrainSystem.js';
import { EnvironmentScatterSystem } from './EnvironmentScatterSystem.js';
import { GrassFieldSystem } from './GrassFieldSystem.js';
import { FernFieldSystem } from './FernFieldSystem.js';
import { DistantMountainSystem } from './DistantMountainSystem.js';
import { WorldCollisionSystem } from './WorldCollisionSystem.js';
import { TreeOcclusionSystem } from './TreeOcclusionSystem.js';

export class TestIslandSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foundation-island';
    this.scene.add(this.group);

    this.terrain = new IslandTerrainSystem(this.group);
    this.collision = new WorldCollisionSystem({
      heightAt: (x, z) => this.heightAt(x, z),
      baseHeightAt: (x, z) => this.baseHeightAt(x, z),
      isPlayable: (x, z, margin) => this.isPlayable(x, z, margin),
      maxSlopeDegrees: 58,
      dropFallThreshold: 0.5
    });
    this.scatter = new EnvironmentScatterSystem({
      group: this.group,
      terrain: this.terrain,
      collision: this.collision
    });
    this.grass = new GrassFieldSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter
    });
    this.ferns = new FernFieldSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter
    });
    this.mountains = new DistantMountainSystem({
      group: this.group,
      centerZ: this.terrain.centerZ
    });
    this.treeOcclusion = null;
    this.assetMode = 'terrain-only';
  }

  getSpawnPoint() {
    return this.terrain.getSpawnPoint();
  }

  baseHeightAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  heightAt(x, z) {
    const base = this.terrain.heightAt(x, z);
    return this.collision.supportHeightAt(x, z, base);
  }

  isPlayable(x, z, margin = 0) {
    return this.terrain.isPlayable(x, z, margin);
  }

  regionAt(x, z) {
    return this.terrain.regionAt(x, z);
  }

  slopeAt(x, z) {
    return this.terrain.slopeAt(x, z);
  }

  async load() {
    this.collision.clear();
    this.terrain.create();
    const mountainCount = this.mountains.create();

    let environmentLoaded = false;
    try {
      environmentLoaded = await this.scatter.load();
      this.#removeObsoleteUnderstory();
      this.treeOcclusion = new TreeOcclusionSystem({
        group: this.group,
        collision: this.collision
      });
    } catch (error) {
      console.error('[ENVIRONMENT ASSET FALLBACK]', error);
    }

    const grassCount = this.grass.populate();
    const fernCount = this.ferns.populate();
    this.assetMode = environmentLoaded ? 'production' : 'terrain-fallback';
    console.info(`[WORLD] ${this.assetMode} · ${grassCount} interactive grass tufts · ${fernCount} reactive ferns · ${mountainCount} horizon landforms`);
  }

  #removeObsoleteUnderstory() {
    const shrubs = this.group.getObjectByName('understory-shrub-batch');
    if (!shrubs) return;

    this.group.remove(shrubs);
    shrubs.geometry?.dispose?.();
    if (Array.isArray(shrubs.material)) shrubs.material.forEach(material => material?.dispose?.());
    else shrubs.material?.dispose?.();
  }

  update(dt, playerPosition, camera = null) {
    this.grass.update(dt, playerPosition);
    this.ferns.update(dt, playerPosition);
    this.treeOcclusion?.update(playerPosition, camera);
  }
}
