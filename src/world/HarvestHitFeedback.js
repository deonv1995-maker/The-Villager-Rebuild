import * as THREE from 'three';

const chipGeometry = new THREE.BoxGeometry(0.09, 0.06, 0.05);
const ringGeometry = new THREE.RingGeometry(0.18, 0.27, 16);

export class HarvestHitFeedback {
  constructor({ group }) {
    this.group = group;
    this.effects = [];
  }

  emit(position, kind = 'wood') {
    if (!position) return;
    const root = new THREE.Group();
    root.name = `${kind}-harvest-hit-feedback`;
    root.position.copy(position).add(new THREE.Vector3(0, kind === 'wood' ? 0.9 : 0.48, 0));

    const color = kind === 'wood' ? 0xe8b06d : 0xd8e0dc;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);

    const chipMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      transparent: true,
      opacity: 1
    });
    const chips = [];
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2 + 0.35;
      const chip = new THREE.Mesh(chipGeometry, chipMaterial);
      chip.position.set(0, 0, 0);
      chip.rotation.set(angle * 0.4, angle, -angle * 0.3);
      chip.userData.hitVelocity = new THREE.Vector3(
        Math.cos(angle) * (0.55 + index * 0.05),
        0.72 + (index % 2) * 0.18,
        Math.sin(angle) * (0.55 + index * 0.05)
      );
      root.add(chip);
      chips.push(chip);
    }

    this.group.add(root);
    this.effects.push({
      root,
      ring,
      ringMaterial,
      chipMaterial,
      chips,
      startedAt: performance.now() * 0.001,
      duration: 0.28
    });

    while (this.effects.length > 5) this.#remove(this.effects.shift());
  }

  update() {
    if (!this.effects.length) return;
    const now = performance.now() * 0.001;
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      const progress = (now - effect.startedAt) / effect.duration;
      if (progress >= 1) {
        this.effects.splice(index, 1);
        this.#remove(effect);
        continue;
      }

      const fade = 1 - progress;
      effect.ring.scale.setScalar(0.8 + progress * 2.2);
      effect.ringMaterial.opacity = fade * 0.92;
      effect.chipMaterial.opacity = fade;
      for (const chip of effect.chips) {
        const velocity = chip.userData.hitVelocity;
        chip.position.set(
          velocity.x * progress,
          velocity.y * progress - 0.48 * progress * progress,
          velocity.z * progress
        );
        chip.rotation.x += 0.12;
        chip.rotation.z += 0.16;
      }
    }
  }

  #remove(effect) {
    if (!effect) return;
    effect.root?.parent?.remove(effect.root);
    effect.ringMaterial?.dispose?.();
    effect.chipMaterial?.dispose?.();
  }
}
