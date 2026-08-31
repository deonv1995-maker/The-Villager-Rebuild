import * as THREE from 'three';
import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import { createPhysicalLogVisual } from './PhysicalLogVisual.js';

const fillMaterial = new THREE.MeshStandardMaterial({
  color: 0x72593d,
  roughness: 1,
  flatShading: true
});

export class FloorSupportVisual {
  constructor({ group, terrain }) {
    this.group = group;
    this.terrain = terrain;
  }

  createForFloor(placement, builtId) {
    if (!placement) return null;
    const root = new THREE.Group();
    root.name = `floor-supports-${builtId}`;
    root.userData.floorSupportVisual = true;

    const basis = this.#basis(placement.yaw);
    const halfX = PHYSICAL_LOG.halfLength * 0.92;
    const halfZ = PHYSICAL_LOG.floorWidth * 0.42;
    const undersideY = placement.y - 0.235;

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = placement.x + basis.xX * halfX * sx + basis.zX * halfZ * sz;
        const z = placement.z + basis.xZ * halfX * sx + basis.zZ * halfZ * sz;
        const groundY = this.terrain.heightAt(x, z);
        const gap = undersideY - groundY;
        if (gap <= PHYSICAL_LOG.floorFillThreshold) continue;

        if (gap < PHYSICAL_LOG.floorSupportThreshold) {
          root.add(this.#createFillPier(x, z, groundY, gap));
        } else {
          for (const support of this.#createLogSupports(x, z, groundY, undersideY)) root.add(support);
        }
      }
    }

    if (!root.children.length) return null;
    this.group.add(root);
    return root;
  }

  remove(root) {
    if (root?.parent) root.parent.remove(root);
  }

  #createFillPier(x, z, groundY, gap) {
    const height = Math.max(0.08, gap + 0.055);
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, height, 6),
      fillMaterial
    );
    fill.name = 'automatic-floor-fill';
    fill.position.set(x, groundY + height * 0.5 - 0.035, z);
    fill.receiveShadow = true;
    fill.castShadow = true;
    return fill;
  }

  #createLogSupports(x, z, bottomY, topY) {
    const totalHeight = Math.max(0.08, topY - bottomY + 0.07);
    const usableLength = PHYSICAL_LOG.length - 0.05;
    const count = Math.max(1, Math.ceil(totalHeight / usableLength));
    const segmentHeight = totalHeight / count;
    const supports = [];

    for (let index = 0; index < count; index += 1) {
      const support = createPhysicalLogVisual('AutomaticFloorSupport');
      support.rotation.z = Math.PI / 2;
      support.scale.x = segmentHeight / PHYSICAL_LOG.length;
      support.position.set(
        x,
        bottomY + segmentHeight * (index + 0.5) - 0.035,
        z
      );
      support.userData.autoFloorSupport = true;
      supports.push(support);
    }
    return supports;
  }

  #basis(yaw) {
    return {
      xX: Math.cos(yaw),
      xZ: -Math.sin(yaw),
      zX: Math.sin(yaw),
      zZ: Math.cos(yaw)
    };
  }
}
