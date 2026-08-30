import * as THREE from 'three';

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

const distanceToSegment = (x, z, a, b) => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq <= 0.0001) return { distance: Math.hypot(x - a.x, z - a.z), t: 0 };
  const t = clamp01(((x - a.x) * vx + (z - a.z) * vz) / lengthSq);
  const px = a.x + vx * t;
  const pz = a.z + vz * t;
  return { distance: Math.hypot(x - px, z - pz), t };
};

export class SatelliteApproachSystem {
  constructor({ group, terrain }) {
    this.group = group;
    this.terrain = terrain;
    this.islands = terrain.getSatelliteIslands();
    this.sampleCount = 18;
    this.material = null;
  }

  #frameAt(bar, t) {
    const dx = bar.x2 - bar.x1;
    const dz = bar.z2 - bar.z1;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const ux = dx / length;
    const uz = dz / length;
    const nx = -uz;
    const nz = ux;
    const envelope = Math.sin(Math.PI * t);
    const bend = (bar.bend ?? 0) * envelope;
    const meander = Math.sin(t * Math.PI * 2.35 + (bar.phase ?? 0)) * 1.35 * envelope;
    return {
      x: bar.x1 + dx * t + nx * (bend + meander),
      z: bar.z1 + dz * t + nz * (bend + meander),
      nx,
      nz
    };
  }

  #widthAt(bar, t) {
    const mainFan = 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.58);
    const islandFan = THREE.MathUtils.smoothstep(t, 0.36, 0.94);
    const organic = 1
      + Math.sin(t * Math.PI * 4.1 + (bar.phase ?? 0)) * 0.055
      + Math.cos(t * Math.PI * 2.7 - (bar.phase ?? 0) * 0.6) * 0.04;
    return bar.width * (1.06 + mainFan * 0.72 + islandFan * 1.38) * organic;
  }

  #closestOnBar(bar, x, z) {
    let best = null;
    let previous = this.#frameAt(bar, 0);
    for (let index = 0; index < this.sampleCount; index += 1) {
      const t0 = index / this.sampleCount;
      const t1 = (index + 1) / this.sampleCount;
      const next = this.#frameAt(bar, t1);
      const segment = distanceToSegment(x, z, previous, next);
      const t = THREE.MathUtils.lerp(t0, t1, segment.t);
      const width = this.#widthAt(bar, t);
      const score = segment.distance / Math.max(0.001, width);
      if (!best || score < best.score) best = { ...segment, t, width, score };
      previous = next;
    }
    return best;
  }

  #infoAt(x, z) {
    let best = null;
    for (const island of this.islands) {
      const sample = this.#closestOnBar(island.bar, x, z);
      if (!sample || sample.distance > sample.width * 1.08) continue;
      if (!best || sample.score < best.score) best = { island, bar: island.bar, ...sample };
    }
    return best;
  }

  isPlayable(x, z, margin = 0) {
    const info = this.#infoAt(x, z);
    if (!info) return false;
    return info.distance <= Math.max(1.2, info.width - margin);
  }

  heightAt(x, z) {
    const info = this.#infoAt(x, z);
    if (!info) return this.terrain.seabedLevel;

    const lateral = 1 - THREE.MathUtils.smoothstep(info.distance / info.width, 0.56, 1);
    if (lateral <= 0) return this.terrain.seabedLevel;

    const islandBlend = THREE.MathUtils.smoothstep(info.t, 0.58, 1);
    const mainBlend = 1 - THREE.MathUtils.smoothstep(info.t, 0, 0.38);
    const ripple =
      Math.sin(info.t * Math.PI * 4.6 + (info.bar.phase ?? 0)) * 0.055 +
      Math.cos((x + z) * 0.047 - (info.bar.phase ?? 0)) * 0.035;
    const crest = this.terrain.waterLevel - 0.15 + ripple + islandBlend * 0.11 + mainBlend * 0.05;
    return THREE.MathUtils.lerp(this.terrain.seabedLevel, crest, lateral);
  }

  getApproachPoint(islandId, t, lateralFraction = 0) {
    const island = this.islands.find(entry => entry.id === islandId);
    if (!island) return null;
    const clampedT = clamp01(t);
    const frame = this.#frameAt(island.bar, clampedT);
    const width = this.#widthAt(island.bar, clampedT);
    return {
      x: frame.x + frame.nx * width * lateralFraction,
      z: frame.z + frame.nz * width * lateralFraction,
      width
    };
  }

  create() {
    this.material = new THREE.MeshStandardMaterial({
      color: 0xdfc993,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    let created = 0;
    for (const island of this.islands) {
      const along = 22;
      const across = 14;
      const positions = [];
      const colors = [];
      const indices = [];
      const color = new THREE.Color();

      for (let row = 0; row <= along; row += 1) {
        const t = row / along;
        const frame = this.#frameAt(island.bar, t);
        const width = this.#widthAt(island.bar, t);
        for (let column = 0; column <= across; column += 1) {
          const s = column / across * 2 - 1;
          const x = frame.x + frame.nx * width * s;
          const z = frame.z + frame.nz * width * s;
          const y = Math.max(this.terrain.heightAt(x, z), this.heightAt(x, z)) + 0.018;
          positions.push(x, y, z);
          color.set(0xdfc993);
          color.offsetHSL(0, 0, Math.sin((t * 9.7 + s * 4.2) + (island.bar.phase ?? 0)) * 0.025);
          colors.push(color.r, color.g, color.b);
        }
      }

      const stride = across + 1;
      for (let row = 0; row < along; row += 1) {
        for (let column = 0; column < across; column += 1) {
          const a = row * stride + column;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `satellite-shallow-shelf-${island.id}`;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      created += 1;
    }

    return created;
  }
}
