import * as THREE from 'three';

const seeded = (() => {
  let state = 0x71517;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
})();

export class TestIslandSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foundation-island';
    this.scene.add(this.group);
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z);
    const shore = THREE.MathUtils.smoothstep(62 - r, 0, 11);
    const undulation =
      Math.sin(x * 0.075) * 0.7 +
      Math.cos(z * 0.067) * 0.55 +
      Math.sin((x + z) * 0.043) * 0.45;
    const inlandLift = Math.max(0, 1 - r / 64) * 2.2;
    const beachFlatten = Math.exp(-((x + 1) ** 2 + (z - 24) ** 2) / 180);
    return (-1.05 + shore * (2.2 + inlandLift + undulation * 0.55)) * (1 - beachFlatten * 0.7);
  }

  async load() {
    this.#createTerrain();
    this.#createWater();
    this.#populateForest();
    this.#dressCliffs();
    this.#createPath();
  }

  #createTerrain() {
    const geometry = new THREE.PlaneGeometry(136, 136, 104, 104);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      const r = Math.hypot(x, z);
      if (y < -0.15 || r > 57) color.set(0xc8b27e);
      else if (y < 0.45) color.set(0x779451);
      else color.set(0x536f3d);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })
    );
    terrain.name = 'continuous-terrain';
    this.group.add(terrain);
  }

  #createWater() {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(112, 96),
      new THREE.MeshStandardMaterial({
        color: 0x4e9eb2,
        transparent: true,
        opacity: 0.78,
        roughness: 0.3
      })
    );
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = -0.92;
    this.group.add(water);
  }

  #createTree(scale = 1, pine = false) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 4.8 * scale, 7),
      new THREE.MeshStandardMaterial({ color: 0x6d4d31, roughness: 1 })
    );
    trunk.position.y = 2.4 * scale;
    group.add(trunk);

    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: pine ? 0x345c3d : 0x477848,
      roughness: 1
    });
    const crown = new THREE.Mesh(
      pine
        ? new THREE.ConeGeometry(2.2 * scale, 7.4 * scale, 8)
        : new THREE.IcosahedronGeometry(2.3 * scale, 1),
      foliageMaterial
    );
    crown.position.y = pine ? 6.5 * scale : 5.9 * scale;
    crown.scale.y = pine ? 1 : 1.35;
    group.add(crown);
    return group;
  }

  #populateForest() {
    const placements = [];
    let attempts = 0;
    while (placements.length < 86 && attempts < 1200) {
      attempts += 1;
      const angle = seeded() * Math.PI * 2;
      const radius = 13 + seeded() * 44;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z - 24) < 12) continue;
      if (Math.abs(x) < 5.5 && z > -35 && z < 23) continue;
      placements.push({ x, z });
    }

    placements.forEach((p, index) => {
      const scale = 0.85 + seeded() * 0.55;
      const tree = this.#createTree(scale, index % 4 === 0);
      tree.rotation.y = seeded() * Math.PI * 2;
      tree.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      this.group.add(tree);
    });
  }

  #dressCliffs() {
    const material = new THREE.MeshStandardMaterial({ color: 0x73705f, roughness: 1, flatShading: true });
    const spots = [
      [-46, -8, 4.8], [-42, -15, 5.5], [-37, -21, 4.2],
      [38, -20, 4.6], [44, -15, 5.2], [49, -8, 4.5]
    ];
    for (const [x, z, size] of spots) {
      const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
      cliff.scale.set(1.2, 0.55, 0.8);
      cliff.rotation.set(seeded() * 0.35, seeded() * Math.PI, seeded() * 0.25);
      cliff.position.set(x, this.heightAt(x, z) - size * 0.15, z);
      this.group.add(cliff);
    }
  }

  #createPath() {
    const material = new THREE.MeshStandardMaterial({ color: 0x9a855f, roughness: 1 });
    for (let z = 18; z > -34; z -= 3.2) {
      const x = Math.sin(z * 0.11) * 2.1;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.08, 8), material);
      stone.position.set(x, this.heightAt(x, z) + 0.035, z);
      stone.scale.z = 1.7;
      stone.rotation.y = Math.sin(z) * 0.2;
      this.group.add(stone);
    }
  }
}
