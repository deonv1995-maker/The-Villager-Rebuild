import * as THREE from 'three';
import { TITLE_SCENE } from './TitleSceneConfig.js';

const createHullGeometry = sections => {
  const positions = [];
  const indices = [];

  for (const section of sections) {
    positions.push(
      -section.width, section.top, section.z,
      section.width, section.top, section.z,
      -section.width, section.bottom, section.z,
      section.width, section.bottom, section.z
    );
  }

  for (let index = 0; index < sections.length - 1; index += 1) {
    const a = index * 4;
    const b = (index + 1) * 4;
    indices.push(
      a, a + 2, b + 2,
      a, b + 2, b,
      a + 1, b + 1, b + 3,
      a + 1, b + 3, a + 3,
      a + 2, a + 3, b + 3,
      a + 2, b + 3, b + 2
    );
  }

  indices.push(0, 1, 3, 0, 3, 2);
  const last = (sections.length - 1) * 4;
  indices.push(last, last + 2, last + 3, last, last + 3, last + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createDeckGeometry = sections => {
  const positions = [];
  const indices = [];
  for (const section of sections) {
    positions.push(
      -section.width * 0.88, section.top + 0.03, section.z,
      section.width * 0.88, section.top + 0.03, section.z
    );
  }
  for (let index = 0; index < sections.length - 1; index += 1) {
    const a = index * 2;
    const b = (index + 1) * 2;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export function createTitleShipVisual() {
  const ship = new THREE.Group();
  ship.name = 'title-voyage-ship';
  ship.position.set(0, -0.35, TITLE_SCENE.menuShipZ);

  const wood = new THREE.MeshStandardMaterial({ color: 0x6f472a, roughness: 0.94, flatShading: true });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3f2b1f, roughness: 1, flatShading: true });
  const trimWood = new THREE.MeshStandardMaterial({ color: 0x8a5931, roughness: 0.92, flatShading: true });
  const sail = new THREE.MeshStandardMaterial({ color: 0xe3d4ad, roughness: 0.96, side: THREE.DoubleSide });
  const rope = new THREE.MeshStandardMaterial({ color: 0x9a7952, roughness: 1 });

  const hullSections = [
    { z: -6.85, width: 0.10, top: 1.34, bottom: -0.18 },
    { z: -5.65, width: 1.42, top: 1.18, bottom: -0.72 },
    { z: -3.15, width: 2.22, top: 1.10, bottom: -0.98 },
    { z: 0.3, width: 2.55, top: 1.08, bottom: -1.02 },
    { z: 3.55, width: 2.42, top: 1.13, bottom: -0.86 },
    { z: 5.45, width: 2.08, top: 1.28, bottom: -0.52 }
  ];

  const hull = new THREE.Group();
  const hullShell = new THREE.Mesh(createHullGeometry(hullSections), wood);
  hullShell.name = 'title-ship-pointed-hull';
  hull.add(hullShell);

  const deck = new THREE.Mesh(createDeckGeometry(hullSections.slice(1)), darkWood);
  deck.name = 'title-ship-tapered-deck';
  hull.add(deck);

  const bowTrim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 4.5), trimWood);
  bowTrim.rotation.x = -0.19;
  bowTrim.position.set(0, 1.53, -6.7);
  hull.add(bowTrim);

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.12, 3.2, 7), darkWood);
  bowsprit.rotation.x = Math.PI / 2;
  bowsprit.position.set(0, 1.68, -7.85);
  hull.add(bowsprit);

  const aftDeck = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.72, 1.55), darkWood);
  aftDeck.position.set(0, 1.48, 4.35);
  hull.add(aftDeck);
  ship.add(hull);

  const mast = new THREE.Group();
  mast.name = 'title-ship-mast';
  mast.position.set(0, 1.2, -0.6);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 9.4, 8), darkWood);
  pole.position.y = 4.7;
  mast.add(pole);

  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.8, 8), darkWood);
  yard.rotation.z = Math.PI / 2;
  yard.position.y = 7;
  mast.add(yard);

  const sailMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.4, 1, 1), sail);
  sailMesh.position.set(0, 4.25, 0.15);
  mast.add(sailMesh);

  const rigLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 9.5, 6), rope);
  rigLeft.rotation.z = -0.42;
  rigLeft.position.set(-1.9, 3.5, 0.25);
  mast.add(rigLeft);
  const rigRight = rigLeft.clone();
  rigRight.rotation.z = 0.42;
  rigRight.position.x = 1.9;
  mast.add(rigRight);
  ship.add(mast);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 6.6), darkWood);
    rail.position.set(side * 2.17, 1.51, 0.65);
    ship.add(rail);
  }

  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x815735, roughness: 1, flatShading: true });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.25), crateMaterial);
  crate.position.set(-1.25, 1.78, 3.15);
  ship.add(crate);

  return {
    ship,
    hull,
    mast,
    sailMesh,
    crate,
    bowOffset: new THREE.Vector3(0, 0.15, -6.55)
  };
}
