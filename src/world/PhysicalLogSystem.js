import * as THREE from 'three';

const INTERACTION_RADIUS = 2.8;
const BUILD_DISTANCE = 2.05;

export class PhysicalLogSystem {
  constructor({ group, player, terrain, collision, gatherables }) {
    if (!group || !player || !terrain || !collision || !gatherables) {
      throw new Error('PhysicalLogSystem requires group, player, terrain, collision and gatherables');
    }
    this.group = group;
    this.player = player;
    this.terrain = terrain;
    this.collision = collision;
    this.gatherables = gatherables;
    this.carriedItem = null;
    this.builtLogs = [];
    this.nextBuiltId = 0;
  }

  isCarrying() {
    return Boolean(this.carriedItem);
  }

  getCarryState() {
    return this.carriedItem
      ? { carrying: true, resourceId: 'log', label: 'Log' }
      : { carrying: false, resourceId: null, label: null };
  }

  pickup(playerPosition) {
    if (this.carriedItem) return null;
    const item = this.gatherables.takePhysical(playerPosition, 'log');
    if (!item) return null;

    this.carriedItem = item;
    this.player.root.add(item.root);
    item.root.position.set(0, 1.05, 0.62);
    item.root.rotation.set(0, 0, 0);
    item.root.scale.setScalar(1.18);
    item.root.name = `carried-log-${item.id}`;
    return this.getCarryState();
  }

  drop(playerPosition, facingDirection) {
    if (!this.carriedItem) return null;
    const placement = this.#placementPoint(playerPosition, facingDirection, 1.55);
    const item = this.carriedItem;
    this.player.root.remove(item.root);
    item.root.scale.setScalar(1);
    this.carriedItem = null;
    this.gatherables.returnPhysical(item, {
      x: placement.x,
      z: placement.z,
      yaw: Math.atan2(facingDirection.x, facingDirection.z)
    });
    return { mode: 'drop', position: placement };
  }

  build(mode, playerPosition, facingDirection) {
    if (!this.carriedItem || !['lay', 'post'].includes(mode)) return null;
    const placement = this.#findBuildPlacement(mode, playerPosition, facingDirection);
    if (!placement) return null;

    const item = this.carriedItem;
    this.player.root.remove(item.root);
    this.carriedItem = null;
    item.root.scale.setScalar(1);
    item.root.name = `built-log-${this.nextBuiltId}`;
    item.root.position.set(placement.x, placement.y, placement.z);
    item.root.rotation.set(
      0,
      placement.yaw,
      mode === 'post' ? Math.PI / 2 : 0
    );
    this.group.add(item.root);

    const collisionHandle = mode === 'post'
      ? this.collision.addObstacle({
          x: placement.x,
          z: placement.z,
          radius: 0.28,
          type: 'placed-log',
          label: item.root.name,
          bottomY: placement.y,
          topY: placement.y + 1.28
        })
      : this.collision.addBox({
          x: placement.x,
          z: placement.z,
          halfX: 0.68,
          halfZ: 0.24,
          yaw: placement.yaw,
          type: 'placed-log',
          label: item.root.name,
          bottomY: placement.y,
          topY: placement.y + 0.46,
          standable: true,
          supportHalfX: 0.56,
          supportHalfZ: 0.17,
          supportY: placement.y + 0.42,
          stepHeight: 0.48
        });

    const built = {
      id: this.nextBuiltId,
      mode,
      root: item.root,
      collisionHandle,
      active: true
    };
    this.nextBuiltId += 1;
    this.builtLogs.push(built);
    return {
      mode,
      label: mode === 'post' ? 'Log post' : 'Laid log',
      position: { x: placement.x, y: placement.y, z: placement.z }
    };
  }

  getDemolitionTarget(playerPosition) {
    let best = null;
    let bestDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;
    for (const built of this.builtLogs) {
      if (!built.active) continue;
      const dx = built.root.position.x - playerPosition.x;
      const dz = built.root.position.z - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = built;
    }
    if (!best) return null;
    return {
      type: 'placed-log',
      id: best.id,
      label: best.mode === 'post' ? 'Log post' : 'Laid log',
      icon: 'hammer',
      actionLabel: 'Demolish log'
    };
  }

  demolish(playerPosition) {
    const target = this.getDemolitionTarget(playerPosition);
    if (!target) return null;
    const built = this.builtLogs.find(entry => entry.id === target.id && entry.active);
    if (!built) return null;

    built.active = false;
    this.collision.removeObstacle(built.collisionHandle);
    this.group.remove(built.root);
    const position = built.root.position.clone();
    this.gatherables.spawn('log', {
      x: position.x,
      z: position.z,
      yaw: built.root.rotation.y
    });
    return target;
  }

  #findBuildPlacement(mode, playerPosition, facingDirection) {
    const base = this.#placementPoint(playerPosition, facingDirection, BUILD_DISTANCE);
    const radius = mode === 'post' ? 0.36 : 0.78;
    if (!this.terrain.isPlayable(base.x, base.z, radius + 0.25)) return null;
    if (this.terrain.slopeAt(base.x, base.z) > (mode === 'post' ? 0.62 : 0.48)) return null;
    if (!this.collision.isCircleClear(base.x, base.z, radius)) return null;
    return {
      ...base,
      y: this.terrain.heightAt(base.x, base.z),
      yaw: Math.atan2(facingDirection.x, facingDirection.z)
    };
  }

  #placementPoint(playerPosition, facingDirection, distance) {
    const length = Math.max(0.001, Math.hypot(facingDirection.x, facingDirection.z));
    const x = playerPosition.x + facingDirection.x / length * distance;
    const z = playerPosition.z + facingDirection.z / length * distance;
    return { x, y: this.terrain.heightAt(x, z), z };
  }
}
