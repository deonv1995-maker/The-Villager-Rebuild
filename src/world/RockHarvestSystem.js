import * as THREE from 'three';
import { HarvestHitFeedback } from './HarvestHitFeedback.js';

const INTERACTION_RADIUS = 2.85;
const HITS_REQUIRED = 3;
const STONE_YIELD = 4;

export class RockHarvestSystem {
  constructor({ group, terrain, collision, gatherables }) {
    if (!group || !terrain || !collision || !gatherables) {
      throw new Error('RockHarvestSystem requires group, terrain, collision and gatherables');
    }
    this.group = group;
    this.terrain = terrain;
    this.collision = collision;
    this.gatherables = gatherables;
    this.rocks = this.collision.getObstaclesByType('rock').map((obstacle, id) => ({
      id,
      obstacle,
      hits: 0,
      active: true
    }));
    this.target = null;
    this.hitFeedback = new HarvestHitFeedback({ group });
    this.#createIndicator();
  }

  update(playerPosition, enabled = true) {
    this.hitFeedback.update();
    if (!enabled) {
      this.target = null;
      this.indicator.visible = false;
      return null;
    }

    let nearest = null;
    let nearestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;
    for (const rock of this.rocks) {
      if (!rock.active) continue;
      const dx = rock.obstacle.x - playerPosition.x;
      const dz = rock.obstacle.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearest = rock;
      nearestDistanceSq = distanceSq;
    }

    this.target = nearest;
    this.indicator.visible = Boolean(nearest);
    if (nearest) {
      this.indicator.position.set(
        nearest.obstacle.x,
        this.terrain.heightAt(nearest.obstacle.x, nearest.obstacle.z) + 0.04,
        nearest.obstacle.z
      );
    }
    return this.getTarget();
  }

  getTarget() {
    if (!this.target) return null;
    return {
      type: 'rock',
      id: this.target.id,
      label: 'Large rock',
      icon: 'pickaxe',
      actionLabel: 'Mine rock',
      position: new THREE.Vector3(
        this.target.obstacle.x,
        this.terrain.heightAt(this.target.obstacle.x, this.target.obstacle.z),
        this.target.obstacle.z
      )
    };
  }

  mine(playerPosition) {
    this.update(playerPosition, true);
    if (!this.target) return null;

    const rock = this.target;
    rock.hits += 1;
    const remainingHits = Math.max(0, HITS_REQUIRED - rock.hits);
    const position = new THREE.Vector3(
      rock.obstacle.x,
      this.terrain.heightAt(rock.obstacle.x, rock.obstacle.z),
      rock.obstacle.z
    );
    this.hitFeedback.emit(position, 'stone');
    if (remainingHits > 0) return { broken: false, remainingHits, label: 'Large rock', position };

    rock.active = false;
    this.collision.removeObstacle(rock.obstacle);
    const visual = this.group.getObjectByName(rock.obstacle.label ?? '');
    visual?.parent?.remove(visual);

    for (let index = 0; index < STONE_YIELD; index += 1) {
      const angle = (index / STONE_YIELD) * Math.PI * 2 + 0.3;
      const distance = 0.6 + (index % 2) * 0.22;
      this.gatherables.spawn('stone', {
        x: rock.obstacle.x + Math.cos(angle) * distance,
        z: rock.obstacle.z + Math.sin(angle) * distance,
        yaw: angle
      });
    }

    this.target = null;
    this.indicator.visible = false;
    return { broken: true, remainingHits: 0, label: 'Large rock', stoneYield: STONE_YIELD, position };
  }

  #createIndicator() {
    this.indicator = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.9, 28),
      new THREE.MeshBasicMaterial({ color: 0xbed3d1, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
    );
    this.indicator.name = 'rock-mine-target-indicator';
    this.indicator.rotation.x = -Math.PI / 2;
    this.indicator.visible = false;
    this.group.add(this.indicator);
  }
}
