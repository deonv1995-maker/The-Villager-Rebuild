import * as THREE from 'three';

export class BoarPresentation {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'boar-presentation';
    this.phase = 0;
    this.defeated = false;

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x73503a,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      emissive: 0x000000
    });
    this.underMaterial = new THREE.MeshStandardMaterial({ color: 0x4a352d, roughness: 1, flatShading: true });
    this.maneMaterial = new THREE.MeshStandardMaterial({ color: 0x352924, roughness: 1, flatShading: true });
    this.snoutMaterial = new THREE.MeshStandardMaterial({ color: 0x5a3d36, roughness: 0.94, flatShading: true });
    this.tuskMaterial = new THREE.MeshStandardMaterial({ color: 0xe9ddbd, roughness: 0.8, flatShading: true });
    this.eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x130f0d, roughness: 0.55 });

    this.model = this.#createModel();
    this.root.add(this.model);
  }

  update(dt, movedDistance = 0) {
    if (this.defeated) return;
    const moving = movedDistance > 0.0005;
    this.phase += dt * (moving ? 7.6 : 1.8);
    const stride = moving ? Math.sin(this.phase) : 0;
    const counterStride = moving ? Math.sin(this.phase + Math.PI) : 0;

    this.#poseLeg(this.frontLeft, stride * 0.5);
    this.#poseLeg(this.backRight, stride * 0.46);
    this.#poseLeg(this.frontRight, counterStride * 0.5);
    this.#poseLeg(this.backLeft, counterStride * 0.46);

    const bob = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.038 : Math.sin(this.phase) * 0.012;
    this.model.position.y = bob;
    this.model.rotation.z = moving ? Math.sin(this.phase) * 0.018 : 0;
    this.headPivot.rotation.x = -0.13 + Math.sin(this.phase * 0.62) * (moving ? 0.045 : 0.028);
    this.neck.rotation.x = 0.13 + Math.sin(this.phase * 0.62 + 0.35) * 0.025;
    this.tailPivot.rotation.y = Math.sin(this.phase * 1.35) * 0.24;
    this.tailPivot.rotation.z = 0.34 + Math.sin(this.phase * 1.7) * 0.11;
  }

  setHitFlash(strength) {
    this.bodyMaterial.emissive.setRGB(strength, strength * 0.1, 0);
  }

  setDefeated(defeated) {
    this.defeated = Boolean(defeated);
    if (!this.defeated) return;
    for (const leg of [this.frontLeft, this.frontRight, this.backLeft, this.backRight]) this.#poseLeg(leg, 0);
    this.model.position.y = 0.18;
    this.model.rotation.set(0.05, 0, -Math.PI / 2);
    this.headPivot.rotation.x = 0.12;
  }

  #createModel() {
    const model = new THREE.Group();
    model.name = 'stylised-boar-v2';
    model.scale.setScalar(1.08);

    const rump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), this.bodyMaterial);
    rump.scale.set(1.08, 0.9, 1.35);
    rump.position.set(0, 0.91, -0.28);
    this.#prepare(rump);
    model.add(rump);

    const barrel = new THREE.Mesh(new THREE.DodecahedronGeometry(0.67, 0), this.bodyMaterial);
    barrel.scale.set(1.1, 0.98, 1.42);
    barrel.position.set(0, 0.96, 0.22);
    barrel.rotation.x = -0.03;
    this.#prepare(barrel);
    model.add(barrel);

    const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), this.bodyMaterial);
    shoulder.scale.set(1.08, 1.18, 1.02);
    shoulder.position.set(0, 1.06, 0.7);
    shoulder.rotation.x = -0.06;
    this.#prepare(shoulder);
    model.add(shoulder);

    const belly = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), this.underMaterial);
    belly.scale.set(1.05, 0.62, 1.6);
    belly.position.set(0, 0.67, 0.08);
    this.#prepare(belly);
    model.add(belly);

    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.98, 0.72);
    model.add(this.neck);
    const neckMass = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), this.bodyMaterial);
    neckMass.scale.set(1.05, 1.12, 1.18);
    neckMass.position.set(0, 0.03, 0.27);
    this.#prepare(neckMass);
    this.neck.add(neckMass);

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.96, 1.08);
    model.add(this.headPivot);

    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.43, 0), this.bodyMaterial);
    skull.scale.set(0.96, 0.9, 1.18);
    skull.position.set(0, 0.02, 0.2);
    this.#prepare(skull);
    this.headPivot.add(skull);

    const cheek = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), this.underMaterial);
    cheek.scale.set(1.08, 0.8, 1.18);
    cheek.position.set(0, -0.16, 0.42);
    this.#prepare(cheek);
    this.headPivot.add(cheek);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.48, 8), this.snoutMaterial);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, -0.17, 0.61);
    this.#prepare(muzzle);
    this.headPivot.add(muzzle);

    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.075, 8), this.maneMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.17, 0.86);
    this.#prepare(nose);
    this.headPivot.add(nose);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 5), this.bodyMaterial);
      ear.position.set(side * 0.28, 0.31, 0.03);
      ear.rotation.set(-0.2, 0, side * -0.34);
      this.#prepare(ear);
      this.headPivot.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), this.eyeMaterial);
      eye.position.set(side * 0.31, 0.08, 0.37);
      this.#prepare(eye);
      this.headPivot.add(eye);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.12), this.maneMaterial);
      brow.position.set(side * 0.23, 0.17, 0.34);
      brow.rotation.z = side * 0.15;
      this.#prepare(brow);
      this.headPivot.add(brow);

      this.headPivot.add(this.#createTusk(side));
    }

    this.#createMane(model);

    this.frontLeft = this.#createLeg(-0.42, 0.61, 0.58);
    this.frontRight = this.#createLeg(0.42, 0.61, 0.58);
    this.backLeft = this.#createLeg(-0.42, -0.48, 0.62);
    this.backRight = this.#createLeg(0.42, -0.48, 0.62);
    model.add(this.frontLeft.pivot, this.frontRight.pivot, this.backLeft.pivot, this.backRight.pivot);

    this.tailPivot = new THREE.Group();
    this.tailPivot.position.set(0, 1.05, -1.0);
    const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.34, 6), this.bodyMaterial);
    tail1.rotation.x = Math.PI / 2;
    tail1.position.z = -0.13;
    this.#prepare(tail1);
    this.tailPivot.add(tail1);
    const tail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 6), this.bodyMaterial);
    tail2.rotation.set(Math.PI / 2, 0, 0.65);
    tail2.position.set(-0.07, 0.07, -0.3);
    this.#prepare(tail2);
    this.tailPivot.add(tail2);
    model.add(this.tailPivot);

    return model;
  }

  #createMane(model) {
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.085 + (1 - t) * 0.025, 0.31 + (1 - t) * 0.08, 4), this.maneMaterial);
      tuft.position.set(0, 1.48 - t * 0.29, 0.79 - t * 1.36);
      tuft.rotation.x = -0.18 + t * 0.12;
      this.#prepare(tuft);
      model.add(tuft);
    }
  }

  #createTusk(side) {
    const group = new THREE.Group();
    group.position.set(side * 0.22, -0.25, 0.69);

    const base = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.25, 7), this.tuskMaterial);
    base.rotation.set(Math.PI / 2 - 0.25, 0, side * 0.25);
    base.position.set(side * 0.025, -0.035, 0.03);
    this.#prepare(base);
    group.add(base);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.19, 7), this.tuskMaterial);
    tip.rotation.set(Math.PI / 2 - 0.72, 0, side * 0.34);
    tip.position.set(side * 0.065, 0.035, 0.14);
    this.#prepare(tip);
    group.add(tip);
    return group;
  }

  #createLeg(x, z, length) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, z);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, length * 0.56, 7), this.underMaterial);
    upper.position.y = -length * 0.27;
    this.#prepare(upper);
    pivot.add(upper);

    const lowerPivot = new THREE.Group();
    lowerPivot.position.y = -length * 0.52;
    pivot.add(lowerPivot);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, length * 0.52, 7), this.maneMaterial);
    lower.position.y = -length * 0.24;
    this.#prepare(lower);
    lowerPivot.add(lower);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.28), this.maneMaterial);
    hoof.position.set(0, -length * 0.52, 0.055);
    hoof.rotation.x = -0.05;
    this.#prepare(hoof);
    lowerPivot.add(hoof);

    return { pivot, lowerPivot };
  }

  #poseLeg(leg, angle) {
    leg.pivot.rotation.x = angle;
    leg.lowerPivot.rotation.x = -angle * 0.46;
  }

  #prepare(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
}
