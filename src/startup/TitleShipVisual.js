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
      -section.width * 0.88, section.top + 0.04, section.z,
      section.width * 0.88, section.top + 0.04, section.z
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

const createBowDeckGeometry = (tip, shoulder) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, tip.top + 0.04, tip.z,
    -shoulder.width * 0.88, shoulder.top + 0.04, shoulder.z,
    shoulder.width * 0.88, shoulder.top + 0.04, shoulder.z
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
};

const createHullStrake = (sections, side, verticalRatio, material) => {
  const points = sections.map(section => new THREE.Vector3(
    side * section.width * 1.015,
    THREE.MathUtils.lerp(section.bottom, section.top, verticalRatio),
    section.z
  ));
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, 42, 0.055, 5, false);
  return new THREE.Mesh(geometry, material);
};

const createFlexibleRope = ({ name, start, end, material, segments = 9, sag = 0.25 }) => {
  const positions = new Float32Array((segments + 1) * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(geometry, material);
  line.name = name;
  line.userData.rope = {
    start: start.clone(),
    end: end.clone(),
    segments,
    sag
  };
  return line;
};

const updateFlexibleRope = (line, time, wind, slack, upperShift = null) => {
  const { start, end, segments, sag } = line.userData.rope;
  const attribute = line.geometry.getAttribute('position');
  const shiftedEnd = upperShift ? end.clone().add(upperShift) : end;

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const arc = Math.sin(Math.PI * t);
    const x = THREE.MathUtils.lerp(start.x, shiftedEnd.x, t)
      + Math.sin(time * 1.7 + t * 5.1) * wind * arc;
    const y = THREE.MathUtils.lerp(start.y, shiftedEnd.y, t)
      - arc * (sag + slack * 0.8)
      + Math.cos(time * 1.35 + t * 4.2) * wind * 0.18 * arc;
    const z = THREE.MathUtils.lerp(start.z, shiftedEnd.z, t)
      + Math.sin(time * 1.15 + t * 3.7) * wind * 0.45 * arc;
    attribute.setXYZ(index, x, y, z);
  }
  attribute.needsUpdate = true;
};

const createSplinter = (material, height, radius, x, z, yaw = 0) => {
  const splinter = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), material);
  splinter.position.set(x, height * 0.45, z);
  splinter.rotation.y = yaw;
  splinter.rotation.z = (x >= 0 ? -1 : 1) * 0.08;
  return splinter;
};

export function createTitleShipVisual() {
  const ship = new THREE.Group();
  ship.name = 'title-voyage-ship';
  ship.position.set(0, -0.35, TITLE_SCENE.menuShipZ);

  const wood = new THREE.MeshStandardMaterial({
    color: 0x6f472a,
    roughness: 0.94,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x342319,
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const trimWood = new THREE.MeshStandardMaterial({ color: 0x98613a, roughness: 0.92, flatShading: true });
  const rawWood = new THREE.MeshStandardMaterial({ color: 0xb9854e, roughness: 1, flatShading: true });
  const sail = new THREE.MeshStandardMaterial({ color: 0xe3d4ad, roughness: 0.96, side: THREE.DoubleSide });
  const rope = new THREE.LineBasicMaterial({ color: 0x8f704e });

  const hullSections = [
    { z: -6.95, width: 0.08, top: 1.38, bottom: -0.12 },
    { z: -5.65, width: 1.42, top: 1.22, bottom: -0.72 },
    { z: -3.15, width: 2.22, top: 1.12, bottom: -1.02 },
    { z: 0.3, width: 2.55, top: 1.10, bottom: -1.08 },
    { z: 3.55, width: 2.42, top: 1.15, bottom: -0.88 },
    { z: 5.45, width: 2.08, top: 1.31, bottom: -0.50 }
  ];

  const hull = new THREE.Group();
  const hullShell = new THREE.Mesh(createHullGeometry(hullSections), wood);
  hullShell.name = 'title-ship-pointed-hull';
  hull.add(hullShell);

  const waterOccluder = new THREE.Group();
  waterOccluder.name = 'title-ship-water-occluder';
  for (let index = 1; index < hullSections.length; index += 1) {
    const previous = hullSections[index - 1];
    const current = hullSections[index];
    const length = current.z - previous.z + 0.18;
    const width = Math.max(previous.width, current.width) * 1.5;
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, 0.58, length), darkWood);
    block.position.set(0, 0.16, (previous.z + current.z) * 0.5);
    waterOccluder.add(block);
  }
  hull.add(waterOccluder);

  const bowDeck = new THREE.Mesh(createBowDeckGeometry(hullSections[0], hullSections[1]), darkWood);
  bowDeck.name = 'title-ship-solid-bow-deck';
  hull.add(bowDeck);

  const deck = new THREE.Mesh(createDeckGeometry(hullSections.slice(1)), darkWood);
  deck.name = 'title-ship-tapered-deck';
  hull.add(deck);

  for (const side of [-1, 1]) {
    const upperStrake = createHullStrake(hullSections.slice(1), side, 0.72, trimWood);
    upperStrake.name = `title-ship-upper-strake-${side < 0 ? 'left' : 'right'}`;
    hull.add(upperStrake);
    const lowerStrake = createHullStrake(hullSections.slice(1), side, 0.48, darkWood);
    lowerStrake.name = `title-ship-lower-strake-${side < 0 ? 'left' : 'right'}`;
    hull.add(lowerStrake);
  }

  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 10.6), darkWood);
  keel.position.set(0, -0.88, -0.15);
  keel.rotation.x = 0.025;
  hull.add(keel);

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 3.4, 7), darkWood);
  bowsprit.rotation.x = Math.PI / 2;
  bowsprit.position.set(0, 1.72, -7.95);
  hull.add(bowsprit);

  const aftDeck = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.72, 1.55), darkWood);
  aftDeck.position.set(0, 1.5, 4.35);
  hull.add(aftDeck);

  const sternBack = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.25, 0.18), trimWood);
  sternBack.position.set(0, 0.78, 5.48);
  sternBack.rotation.x = -0.05;
  hull.add(sternBack);
  ship.add(hull);

  const mast = new THREE.Group();
  mast.name = 'title-ship-mast';
  mast.position.set(0, 1.2, -0.6);
  const breakY = 4.72;

  const lowerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, breakY, 8), darkWood);
  lowerPole.position.y = breakY * 0.5;
  lowerPole.name = 'title-mast-lower';
  mast.add(lowerPole);

  const lowerSplinters = new THREE.Group();
  lowerSplinters.name = 'title-mast-lower-splinters';
  lowerSplinters.position.y = breakY - 0.04;
  lowerSplinters.add(
    createSplinter(rawWood, 0.72, 0.075, 0.10, 0.03, 0.2),
    createSplinter(rawWood, 0.55, 0.06, -0.11, 0.02, -0.5),
    createSplinter(rawWood, 0.66, 0.065, 0.01, -0.10, 0.8),
    createSplinter(rawWood, 0.48, 0.055, -0.03, 0.11, -0.9)
  );
  mast.add(lowerSplinters);

  const mastUpperPivot = new THREE.Group();
  mastUpperPivot.name = 'title-mast-broken-upper-pivot';
  mastUpperPivot.position.y = breakY;
  mast.add(mastUpperPivot);

  const upperHeight = 9.4 - breakY;
  const upperPole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, upperHeight, 8), darkWood);
  upperPole.position.y = upperHeight * 0.5;
  upperPole.name = 'title-mast-broken-upper';
  mastUpperPivot.add(upperPole);

  const upperSplinters = new THREE.Group();
  upperSplinters.name = 'title-mast-upper-splinters';
  upperSplinters.rotation.z = Math.PI;
  upperSplinters.position.y = 0.08;
  upperSplinters.add(
    createSplinter(rawWood, 0.62, 0.07, 0.09, 0.02, -0.3),
    createSplinter(rawWood, 0.50, 0.055, -0.10, -0.02, 0.5),
    createSplinter(rawWood, 0.58, 0.06, 0.00, 0.10, -0.7)
  );
  mastUpperPivot.add(upperSplinters);

  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.8, 8), darkWood);
  yard.rotation.z = Math.PI / 2;
  yard.position.y = 7 - breakY;
  mastUpperPivot.add(yard);

  const sailGeometry = new THREE.PlaneGeometry(5.8, 5.35, 8, 6);
  const sailMesh = new THREE.Mesh(sailGeometry, sail);
  sailMesh.name = 'title-flexing-sail';
  sailMesh.position.set(0, 4.25 - breakY, 0.15);
  mastUpperPivot.add(sailMesh);
  const sailBasePositions = Float32Array.from(sailGeometry.getAttribute('position').array);

  ship.add(mast);

  const riggingLines = [
    createFlexibleRope({
      name: 'title-rig-port',
      start: new THREE.Vector3(-2.12, 1.52, 2.8),
      end: new THREE.Vector3(-0.08, 9.18, -0.55),
      material: rope,
      sag: 0.24
    }),
    createFlexibleRope({
      name: 'title-rig-starboard',
      start: new THREE.Vector3(2.12, 1.52, 2.8),
      end: new THREE.Vector3(0.08, 9.18, -0.55),
      material: rope,
      sag: 0.24
    }),
    createFlexibleRope({
      name: 'title-rig-forestay',
      start: new THREE.Vector3(0, 1.72, -8.85),
      end: new THREE.Vector3(0, 9.22, -0.58),
      material: rope,
      sag: 0.18
    })
  ];
  riggingLines.forEach(line => ship.add(line));

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 6.45), darkWood);
    rail.position.set(side * 2.14, 1.55, 0.7);
    ship.add(rail);
  }

  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x815735, roughness: 1, flatShading: true });
  const crate = new THREE.Group();
  crate.name = 'title-loose-crate';
  const crateBody = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.25), crateMaterial);
  crate.add(crateBody);
  for (const offset of [-0.47, 0.47]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.2, 1.31), darkWood);
    band.position.x = offset;
    crate.add(band);
  }
  crate.position.set(-1.25, 1.78, 3.15);
  ship.add(crate);

  const updateRigging = (time, { danger = 0, impact = 0 } = {}) => {
    const position = sailGeometry.getAttribute('position');
    const flutter = THREE.MathUtils.lerp(
      TITLE_SCENE.sailFlutterCalm,
      TITLE_SCENE.sailFlutterStorm,
      danger
    );
    for (let index = 0; index < position.count; index += 1) {
      const baseX = sailBasePositions[index * 3];
      const baseY = sailBasePositions[index * 3 + 1];
      const baseZ = sailBasePositions[index * 3 + 2];
      const edgeWeight = 0.45 + Math.abs(baseX) / 5.8;
      const billow = Math.sin(time * (1.35 + danger * 2.7) + baseX * 0.9 + baseY * 0.42)
        * flutter * edgeWeight;
      const crossFlutter = Math.cos(time * (0.9 + danger * 2.1) + baseY * 1.1)
        * flutter * 0.45;
      position.setXYZ(index, baseX + crossFlutter * 0.08, baseY, baseZ + billow + danger * 0.06);
    }
    position.needsUpdate = true;
    sailGeometry.computeVertexNormals();

    const wind = 0.028 + danger * 0.11;
    const slack = impact * 0.75;
    const upperShift = new THREE.Vector3(-impact * 1.15, -impact * 0.62, impact * 0.15);
    riggingLines.forEach(line => updateFlexibleRope(line, time, wind, slack, upperShift));
  };

  return {
    ship,
    hull,
    mast,
    mastUpperPivot,
    lowerSplinters,
    upperSplinters,
    sailMesh,
    crate,
    updateRigging,
    bowOffset: new THREE.Vector3(0, 0.15, -6.65)
  };
}
