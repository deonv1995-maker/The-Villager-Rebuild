import * as THREE from 'three';
import { ExpandedIslandTerrainSystem } from './ExpandedIslandTerrainSystem.js';
import { TerrainSculptingSystem } from './TerrainSculptingSystem.js';
import { ConstructionTerrainAdaptationSystem } from './ConstructionTerrainAdaptationSystem.js';
import { EnvironmentScatterSystem } from './EnvironmentScatterSystem.js';
import { ExplorationPoiSystem } from './ExplorationPoiSystem.js';
import { GrassFieldSystem } from './GrassFieldSystem.js';
import { GroundCoverPresentationSystem } from './GroundCoverPresentationSystem.js';
import { JungleFloorPresentationSystem } from './JungleFloorPresentationSystem.js';
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
    this.terrainSculpting = new TerrainSculptingSystem({
      terrain: this.terrain,
      onChanged: change => this.#handleTerrainSculptChanged(change)
    });
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
    this.presentationExclusions = new Map();
    this.tunnelingPresentationExclusionIds = new Set();
    this.explorationPois = new ExplorationPoiSystem({
      group: this.group,
      terrain: this.terrain,
      chunks: this.chunks,
      collision: this.collision,
      onPresentationExclusionsChanged: exclusions =>
        this.#replaceTunnelingPresentationExclusions(exclusions)
    });
    this.collision.setVolumeQuery({
      supportHeightAt: (x, z, options) => this.explorationPois.supportHeightAt(x, z, options),
      isSolidAt: (x, y, z) => this.explorationPois.isSolidAt(x, y, z),
      hasActivityAt: (x, z) => this.explorationPois.hasTunnelingActivityAt(x, z)
    });
    this.groundCover = new GroundCoverPresentationSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter,
      chunks: this.chunks,
      collision: this.collision,
      constructionTerrain: this.constructionTerrain
    });
    this.jungleFloor = new JungleFloorPresentationSystem({
      group: this.group,
      terrain: this.terrain,
      scatter: this.scatter,
      chunks: this.chunks,
      collision: this.collision,
      constructionTerrain: this.constructionTerrain
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

  heightAt(x, z) {
    const base = this.constructionHeightAt(x, z);
    return this.collision.supportHeightAt(x, z, base, {
      referenceY: UNBOUNDED_SUPPORT_REFERENCE,
      maxStepUp: UNBOUNDED_SUPPORT_REFERENCE
    });
  }

  walkableHeightAt(x, z, {
    referenceY = null,
    maxStepUp = 0.58,
    airborne = false
  } = {}) {
    const base = this.constructionHeightAt(x, z);
    const sharedReferenceY = this.collision.getSupportReferenceY();
    return this.collision.supportHeightAt(x, z, base, {
      referenceY: Number.isFinite(referenceY)
        ? referenceY
        : Number.isFinite(sharedReferenceY)
          ? sharedReferenceY
          : base,
      maxStepUp,
      airborne
    });
  }

  setConstructionFloors(floors) {
    return this.constructionTerrain.setFloors(floors);
  }

  setPresentationExclusion(id, exclusion) {
    if (!id) throw new Error('Presentation exclusion requires a stable id');
    if (
      !Number.isFinite(exclusion?.x) ||
      !Number.isFinite(exclusion?.z) ||
      !Number.isFinite(exclusion?.radius) ||
      exclusion.radius <= 0
    ) {
      throw new Error('Presentation exclusion requires finite x, z and a positive radius');
    }
    this.presentationExclusions.set(id, {
      x: exclusion.x,
      z: exclusion.z,
      radius: exclusion.radius
    });
    this.#syncPresentationExclusions();
  }

  clearPresentationExclusion(id) {
    if (!this.presentationExclusions.delete(id)) return false;
    this.#syncPresentationExclusions();
    return true;
  }

  #handleTerrainSculptChanged(change) {
    if (!this.explorationPois) return;
    if (
      Number.isFinite(change?.x) &&
      Number.isFinite(change?.z) &&
      Number.isFinite(change?.radius)
    ) {
      this.explorationPois.refreshTerrainSurface?.(change);
    } else if (change?.restored) {
      this.explorationPois.refreshTerrainSurface?.();
    }
  }

  #replaceTunnelingPresentationExclusions(exclusions = []) {
    const nextIds = new Set();
    for (const exclusion of exclusions) {
      if (!exclusion?.id) continue;
      nextIds.add(exclusion.id);
      this.presentationExclusions.set(exclusion.id, {
        x: exclusion.x,
        z: exclusion.z,
        radius: exclusion.radius
      });
    }
    for (const id of this.tunnelingPresentationExclusionIds) {
      if (!nextIds.has(id)) this.presentationExclusions.delete(id);
    }
    this.tunnelingPresentationExclusionIds = nextIds;
    this.#syncPresentationExclusions();
  }

  #syncPresentationExclusions() {
    const exclusions = Array.from(this.presentationExclusions.values());
    this.groundCover.setPresentationExclusions?.(exclusions);
    this.jungleFloor.setPresentationExclusions?.(exclusions);
    this.grass.setPresentationExclusions?.(exclusions);
    this.ferns.setPresentationExclusions?.(exclusions);
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
    const explorationPoiCount = this.explorationPois.create();
    this.#replaceTunnelingPresentationExclusions(
      this.explorationPois.getPresentationExclusions?.() ?? []
    );

    let environmentLoaded = false;
    let chunkedTreeCount = 0;
    try {
      environmentLoaded = await this.scatter.load();
      this.#removeObsoleteUnderstory();
      chunkedTreeCount = this.chunks.splitTreeBatches(this.group);
      this.chunks.adoptNamedObjects(this.group, object => (
        object.name.startsWith('forest-rock-')
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
    const jungleFloorStats = this.jungleFloor.populate();
    const groundCoverCount = this.groundCover.populate();
    const grassCount = this.grass.populate();
    const fernCount = this.ferns.populate();
    this.#syncPresentationExclusions();
    this.assetMode = environmentLoaded ? 'production' : 'terrain-fallback';
    const chunkStats = this.chunks.getStats();
    const coastalRockCount = this.scatter.coastalRockCount ?? 0;
    const regionalTreeCount = this.scatter.regionalTreeCount ?? 0;
    console.info(`[WORLD] ${this.assetMode} · ${chunkStats.total} render chunks · ${chunkedTreeCount} chunk-indexed trees (${regionalTreeCount} regional) · ${coastalRockCount} coastal rocks · ${explorationPoiCount} exploration POIs · ${groundCoverCount} ground-cover clumps · ${jungleFloorStats.leafLitter} jungle litter clumps · ${jungleFloorStats.rootFans} jungle root fans · ${grassCount} reactive grass tufts · ${fernCount} reactive ferns · ${ambientStats.total} ambient details · ${mountainCount} horizon landforms`);
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
    this.explorationPois.update(playerPosition, dt);
    this.groundCover.update();
    this.jungleFloor.update();
    this.grass.update(dt, playerPosition);
    this.ferns.update(dt, playerPosition);
    this.ambientDetails.update();
    this.waterVisuals.update(dt, playerPosition);
    this.treeOcclusion?.update(playerPosition, camera);
  }
}
