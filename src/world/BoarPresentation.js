import * as THREE from 'three';

export class BoarPresentation {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'boar-presentation';
    this.phase = 0;
    this.defeated = false;

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a4a2f,
      roughness: 0.92,
      metalness: 0,
      emissive: 0x000000
    });
    this.darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2923, roughness: 0.98 });
    this.tuskMaterial = new THREE.MeshStandardMaterial({ color: 0xeadbb9, roughness: 0.78 });
    this.eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x171413, roughness: 0.6 });

    this.model = this.#createModel();
    this.root.add(this.model);
  }

  update(dt, movedDistance = 0) {
    if (this.defeated) return;
    const moving = movedDistance > 0.0005;
    this.phase += dt * (moving ? 7.4 : 2.1);
    const stride = moving ? Math.sin(this.phase) * 0.48 : 0;

    this.frontLeft.rotation.x = stride;
    this.backRight.rotation.x = stride;
    this.frontRight.rotation.x = -stride;
    this.backLeft.rotation.x = -stride;
    this.model.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.035 : Math.sin(this.phase) * 0.012;
    this.head.rotation.x = -0.04 + Math.sin(this.phase * 0.7) * 0.035;
    this.tail.rotation.z = 0.25 + Math.sin(this.phase * 1.8) * 0.16;
  }

  setHitFlash(strength) {
    this.bodyMaterial.emissive.setRGB(strength, strength * 0.12, 0);
  }

  setDefeated(defeated) {
    this.defeated = Boolean(defeated);
    if (!this.defeated) return;
    this.frontLeft.rotation.x = 0;
    this.frontRight.rotation.x = 0;
    this.backLeft.rotation.x = 0;
    this.backRight.rotation.x = 0;
    this.model.position.y = 0.2;
    this.model.rotation.z = -Math.PI / 2;
    this.head.rotation.x = 0.08;
  }

  #createModel() {
    const model = new THREE.Group();
    model.name = 'stylised-low-poly-boar';

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 4, 8), this.bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.12, 1, 0.92);
    body.position.y = 0.79;
    this.#prepare(body);
    model.add(body);

    const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.49, 0), this.bodyMaterial);
    shoulder.scale.set(1.08, 1.08, 0.9);
    shoulder.position.set(0, 0.84, 0.48);
    this.#prepare(shoulder);
    model.add(shoulder);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.82, 0.95);
    model.add(this.head);

    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.43, 0), this.bodyMaterial);
    skull.scale.set(0.9, 0.88, 1.05);
    this.#prepare(skull);
    this.head.add(skull);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.45, 8), this.darkMaterial);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.08, 0.46);
    this.#prepare(snout);
    this.head.add(snout);

    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), this.darkMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.08, 0.68);
    this.#prepare(nose);
    this.head.add(nose);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 5), this.bodyMaterial);
      ear.position.set(side * 0.28, 0.34, 0.03);
      ear.rotation.z = side * -0.28;
      ear.rotation.x = -0.18;
      this.#prepare(ear);
      this.head.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.047, 7, 5), this.eyeMaterial);
      eye.position.set(side * 0.29, 0.09, 0.28);
      this.#prepare(eye);
      this.head.add(eye);

      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 7), this.tuskMaterial);
      tusk.position.set(side * 0.22, -0.18, 0.58);
      tusk.rotation.x = Math.PI / 2;
      tusk.rotation.z = side * 0.22;
      this.#prepare(tusk);
      this.head.add(tusk);
    }

    this.frontLeft = this.#createLeg(-0.36, 0.48);
    this.frontRight = this.#createLeg(0.36, 0.48);
    this.backLeft = this.#createLeg(-0.36, -0.48);
    this.backRight = this.#createLeg(0.36, -0.48);
    model.add(this.frontLeft, this.frontRight, this.backLeft, this.backRight);

    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.94, -0.86);
    const tailStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6), this.bodyMaterial);
    tailStem.rotation.x = Math.PI / 2;
    tailStem.position.z = -0.18;
    this.#prepare(tailStem);
    this.tail.add(tailStem);
    model.add(this.tail);

    const maneMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3026, roughness: 1 });
    for (let i = 0; i < 5; i += 1) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 4), maneMaterial);
      tuft.position.set(0, 1.24, 0.36 - i * 0.27);
      tuft.rotation.x = -0.15;
      this.#prepare(tuft);
      model.add(tuft);
    }

    return model;
  }

  #createLeg(x, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.5, z);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.5, 7), this.darkMaterial);
    leg.position.y = -0.24;
    this.#prepare(leg);
    pivot.add(leg);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.25), this.darkMaterial);
    hoof.position.set(0, -0.5, 0.04);
    this.#prepare(hoof);
    pivot.add(hoof);
    return pivot;
  }

  #prepare(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
}
