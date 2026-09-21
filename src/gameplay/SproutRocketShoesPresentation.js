import * as THREE from 'three';

const CYAN = 0x62cfff;
const SHELL = 0x284652;
const DARK = 0x17262c;
const FLAME = 0xa7efff;

function mesh(geometry, material, name) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function createShoe(side, materials) {
  const root = new THREE.Group();
  root.name = `sprout-rocket-shoe-${side}`;

  const shell = mesh(
    new THREE.BoxGeometry(0.28, 0.18, 0.5),
    materials.shell,
    `sprout-rocket-shoe-${side}-shell`
  );
  shell.position.set(0, -0.045, 0.08);
  shell.rotation.x = -0.06;

  const toe = mesh(
    new THREE.BoxGeometry(0.24, 0.12, 0.2),
    materials.dark,
    `sprout-rocket-shoe-${side}-toe`
  );
  toe.position.set(0, -0.035, -0.2);

  const energyPanel = mesh(
    new THREE.BoxGeometry(0.2, 0.055, 0.22),
    materials.energy,
    `sprout-rocket-shoe-${side}-energy-panel`
  );
  energyPanel.position.set(0, 0.065, 0.09);

  const nozzle = mesh(
    new THREE.CylinderGeometry(0.075, 0.095, 0.13, 8),
    materials.dark,
    `sprout-rocket-shoe-${side}-nozzle`
  );
  nozzle.position.set(0, -0.17, 0.15);

  const flame = mesh(
    new THREE.ConeGeometry(0.082, 0.4, 7),
    materials.flame,
    `sprout-rocket-shoe-${side}-flame`
  );
  flame.position.set(0, -0.42, 0.15);
  flame.rotation.z = Math.PI;
  flame.castShadow = false;
  flame.receiveShadow = false;

  const glow = mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    materials.glow,
    `sprout-rocket-shoe-${side}-glow`
  );
  glow.position.set(0, -0.22, 0.15);
  glow.castShadow = false;
  glow.receiveShadow = false;

  root.add(shell, toe, energyPanel, nozzle, flame, glow);
  return { root, flame, glow, energyPanel };
}

export class SproutRocketShoesPresentation {
  constructor({ player } = {}) {
    if (!player) throw new Error('SproutRocketShoesPresentation requires player');

    this.player = player;
    this.elapsed = 0;
    this.materials = {
      shell: new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.5, metalness: 0.28, flatShading: true }),
      dark: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.68, metalness: 0.22, flatShading: true }),
      energy: new THREE.MeshStandardMaterial({
        color: CYAN,
        emissive: CYAN,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.12,
        flatShading: true
      }),
      flame: new THREE.MeshBasicMaterial({
        color: FLAME,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      glow: new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    };

    this.left = createShoe('left', this.materials);
    this.right = createShoe('right', this.materials);
    this.#mount('left', this.left.root);
    this.#mount('right', this.right.root);
  }

  update(dt, energyRatio = 1) {
    const safeDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    this.elapsed += safeDt;
    const energy = THREE.MathUtils.clamp(Number(energyRatio) || 0, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 18);
    const flameLength = 0.72 + pulse * 0.38 + energy * 0.2;
    const glowScale = 0.82 + pulse * 0.24;

    for (const shoe of [this.left, this.right]) {
      shoe.flame.scale.set(1, flameLength, 1);
      shoe.flame.material.opacity = 0.58 + pulse * 0.28;
      shoe.glow.scale.setScalar(glowScale);
      shoe.glow.material.opacity = 0.2 + pulse * 0.2;
      shoe.energyPanel.material.emissiveIntensity = 0.35 + energy * 0.55 + pulse * 0.12;
    }
  }

  dispose() {
    const materials = new Set();
    for (const shoe of [this.left, this.right]) {
      shoe.root?.traverse?.(object => {
        object.geometry?.dispose?.();
        if (object.material) materials.add(object.material);
      });
      shoe.root?.removeFromParent?.();
    }
    for (const material of materials) material.dispose?.();
  }

  #mount(side, object) {
    const mounted = this.player.mountFootObject?.(side, object);
    if (mounted) return;

    this.player.root?.add?.(object);
    object.position.set(side === 'left' ? -0.18 : 0.18, 0.12, 0.08);
    object.rotation.set(0, 0, 0);
  }
}
