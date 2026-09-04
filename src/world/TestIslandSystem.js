import * as THREE from 'three';
import { ExpandedIslandTerrainSystem } from './ExpandedIslandTerrainSystem.js';
import { ConstructionTerrainAdaptationSystem } from './ConstructionTerrainAdaptationSystem.js';
import { EnvironmentScatterSystem } from './EnvironmentScatterSystem.js';
import { GrassFieldSystem } from './GrassFieldSystem.js';
import { FernFieldSystem } from './FernFieldSystem.js';
import { AmbientWorldDetailSystem } from './AmbientWorldDetailSystem.js';
import { DistantMountainSystem } from './DistantMountainSystem.js';
import { WorldCollisionSystem } from './WorldCollisionSystem.js';
import { WorldChunkSystem } from './WorldChunkSystem.js';
import { TreeOcclusionSystem } from './TreeOcclusionSystem.js';
import { WaterVisualSystem } from './WaterVisualSystem.js';

const UNBOUNDED_SUPPORT_REFERENCE = Number.MAX_SAFE_INTEGER;

export class TestIslandSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foundation-island';
    this.scene.add(this.group);

    this.chunks = new WorldChunkSystem({
      group: this.group,
      chunkSize: 72,
      renderDistance: 210,
      frustumPadding: 34
    });
    this.terrain = new ExpandedIslandTerrainSystem(this.group, { chunks: this.chunks });
    this.constructionTerrain = new ConstructionTerrainAdaptationSystem({
      group: this.group,
      terrain: this.terrain,
      chunks: this.chunks
    });
    this.collision = new WorldCollisionSystem({
      heightAt: (x, z) => this.heightAt(x, z),
      baseHeightAt: (x, z) => this.constructionHeightAt(x, z),
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
      scatter: this.scatter,
      chunks: this.chunks,
      collision: this.collision,
      constructionTerrain: this.constructionTerrain
    });
    this.ferns = new FernFieldSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter,
      chunks: this.chunks,
      collision: this.collision,
      constructionTerrain: this.constructionTerrain
    });
    this.ambientDetails = new AmbientWorldDetailSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter,
      chunks: this.chunks,
      collision: this.collision,
      constructionTerrain: this.constructionTerrain
    });
    this.mountains = new DistantMountainSystem({
      group: this.group,
      centerZ: this.terrain.centerZ,
      radiusScale: 1.9
    });
    this.waterVisuals = new WaterVisualSystem({
      group: this.group,
      terrain: this.terrain,
      chunks: this.chunks
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

  constructionHeightAt(x, z) {
    return this.constructionTerrain.heightAt(x, z);
  }

  /**
   * Generic world queries retain the highest support semantics used by placement and
   * world objects. Ranger locomotion uses walkableHeightAt instead so overlapping
   * storeys are resolved from the actor's current vertical level rather than globally.
   */
  heightAt(x, z) {
    const base = this.constructionHeightAt(x, z);
    return this.collision.supportHeightAt(x, z, base, {
      referenceY: UNBOUNDED_SUPPORT_REFERENCE,
      maxStepUp: UNBOUNDED_SUPPORT_REFERENCE
    });
  }

  walkableHeightAt(x, z) {
    const base = this.constructionHeightAt(x, z);
    const referenceY = this.collision.getSupportReferenceY();
    return this.collision.supportHeightAt(x, z, base, {
      referenceY: Number.isFinite(referenceY) ? referenceY : base,
      maxStepUp: 0.58
    });
  }

  setConstructionFloors(floors) {
    return this.constructionTerrain.setFloors(floors);
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
    this.constructionTerrain.captureTerrainMeshes();
    this.waterVisuals.create();
    const mountainCount = this.mountains.create();

    let environmentLoaded = false;
    let chunkedTreeCount = 0;
    try {
      environmentLoaded = await this.scatter.load();
      this.#removeObsoleteUnderstory();
      chunkedTreeCount = this.chunks.splitTreeBatches(this.group);
      this.chunks.adoptNamedObjects(this.group, object => (
        object.name.startsWith('forest-rock-')
        || object.name.startsWith('coastal-rock-')
      ));
      this.treeOcclusion = new TreeOcclusionSystem({
        group: this.group,
        collision: this.collision,
        treeRenderRegistry: this.chunks
      });
    } catch (error) {
      console.error('[ENVIRONMENT ASSET FALLBACK]', error);
    }

    const ambientStats = this.ambientDetails.populate();
    const grassCount = this.grass.populate();
    const fernCount = this.ferns.populate();
    this.assetMode = environmentLoaded ? 'production' : 'terrain-fallback';
    const chunkStats = this.chunks.getStats();
    const coastalRockCount = this.scatter.coastalRockCount ?? 0;
    console.info(`[WORLD] ${this.assetMode} · ${chunkStats.total} render chunks · ${chunkedTreeCount} chunk-indexed trees · ${coastalRockCount} coastal rocks · ${grassCount} grass tufts · ${fernCount} reactive ferns · ${ambientStats.total} ambient details · ${mountainCount} horizon landforms`);
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
    this.chunks.update(camera, playerPosition);
    this.grass.update(dt, playerPosition);
    this.ferns.update(dt, playerPosition);
    this.ambientDetails.update();
    this.waterVisuals.update(dt, playerPosition);
    this.treeOcclusion?.update(playerPosition, camera);
  }
}
